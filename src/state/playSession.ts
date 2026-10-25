// 実戦モードの記録（内部設計 §6.3）。画面から独立した純粋関数で、テストできるようにする。
// 正本は current（台全体）と sessionCounts（区間だけで数える回数）。区間のボーナス回数は current − start で求める。

import { buildFromPlay, type PlayPoint } from "../core/observation";
import type { FieldDef, Issue, Observation } from "../core/types";

export const UNDO_LIMIT = 200;

export interface PlayConditions {
  modelId: string;
  modelVersion: string;
  dataVersion: string;
  prior: { id: string; label: string; version: string; weights: Record<string, number> };
  enabled: Record<string, boolean>;
}

export interface Counter {
  games: number;
  counts: Record<string, number>;
}

export interface Snapshot extends PlayPoint {
  t: string;
  posterior: Record<string, number>;
  concentration: number;
  /** この更新で、前の点より回数を減らす訂正をした（前の点の値は誤っていた可能性がある） */
  corrected?: boolean;
}

/**
 * 戻す（undo）用の差分。全体を複製せず、変わり得る部分だけを持つ。
 * スナップショットは「件数」と「直前の最後の点」だけを持てば、追加・置き換えのどちらも元に戻せる。
 */
export interface UndoEntry {
  op: "inc" | "snapshot";
  label: string;
  prev: {
    current: Counter;
    sessionCounts: Record<string, number>;
    snapshotCount: number;
    lastSnapshot: Snapshot | null;
  };
}

/** 機種データ・モデルの版が変わった後も続けたときの記録 */
export interface ConditionChange {
  t: string;
  games: number;
  from: { modelVersion: string; dataVersion: string };
  to: { modelVersion: string; dataVersion: string };
}

export interface PlaySession {
  version: 1;
  id: string;
  machineId: string;
  conditions: PlayConditions;
  startedAt: string;
  endedAt?: string;
  start: Counter;
  current: Counter;
  sessionCounts: Record<string, number>;
  undo: UndoEntry[];
  snapshots: Snapshot[];
  conditionChanges?: ConditionChange[];
  memo?: string;
}

export interface Estimator {
  (obs: Observation): { posterior: Record<string, number>; concentration: number };
}

export class EndedSessionError extends Error {
  constructor() {
    super("終了した実戦の記録は変更できません");
  }
}

function assertActive(s: PlaySession): void {
  if (s.endedAt) throw new EndedSessionError();
}

function pushUndo(s: PlaySession, op: UndoEntry["op"], label: string): UndoEntry[] {
  const last = s.snapshots[s.snapshots.length - 1] ?? null;
  const entry: UndoEntry = {
    op,
    label,
    prev: {
      current: { games: s.current.games, counts: { ...s.current.counts } },
      sessionCounts: { ...s.sessionCounts },
      snapshotCount: s.snapshots.length,
      lastSnapshot: last,
    },
  };
  const undo = [...s.undo, entry];
  return undo.length > UNDO_LIMIT ? undo.slice(undo.length - UNDO_LIMIT) : undo;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function pointOf(s: Pick<PlaySession, "current" | "sessionCounts">): PlayPoint {
  return { games: s.current.games, counts: { ...s.current.counts }, sessionCounts: { ...s.sessionCounts } };
}

export function observationAt(fields: FieldDef[], s: Pick<PlaySession, "start">, point: PlayPoint): Observation {
  return buildFromPlay(fields, s.start, point);
}

/** 打ち始め。最初のスナップショット（打ち始めの値だけでの推定）も作る */
export function createSession(args: {
  machineId: string;
  fields: FieldDef[];
  conditions: PlayConditions;
  start: Counter;
  memo?: string;
  estimator: Estimator;
  now?: Date;
}): PlaySession {
  const now = (args.now ?? new Date()).toISOString();
  const sessionCounts = Object.fromEntries(args.fields.filter((f) => f.scope === "session").map((f) => [f.key, 0]));
  const base = {
    version: 1 as const,
    id: newId(),
    machineId: args.machineId,
    conditions: args.conditions,
    startedAt: now,
    start: structuredClone(args.start),
    current: structuredClone(args.start),
    sessionCounts,
    undo: [],
    memo: args.memo,
  };
  const point = pointOf(base);
  const est = args.estimator(observationAt(args.fields, base, point));
  return { ...base, snapshots: [{ ...point, t: now, ...est }] };
}

/** ボタンで +1。total の項目は台全体の回数を増やす（区間の回数は差分から自動で増える） */
export function increment(s: PlaySession, field: FieldDef): PlaySession {
  assertActive(s);
  const undo = pushUndo(s, "inc", `${field.label} +1`);
  if (field.scope === "total") {
    return { ...s, undo, current: { ...s.current, counts: { ...s.current.counts, [field.key]: (s.current.counts[field.key] ?? 0) + 1 } } };
  }
  return { ...s, undo, sessionCounts: { ...s.sessionCounts, [field.key]: (s.sessionCounts[field.key] ?? 0) + 1 } };
}

export interface SnapshotUpdate {
  games: number;
  counts: Record<string, number>; // total の項目（台全体）
  sessionCounts?: Record<string, number>; // session の項目の訂正（任意）
}

/** 総回転数の更新の入力チェック（V-10, V-11）。V-12 などはモデルの validate で行う */
export function checkUpdate(s: PlaySession, update: SnapshotUpdate): Issue[] {
  const issues: Issue[] = [];
  const last = s.snapshots[s.snapshots.length - 1];
  if (update.games < s.start.games || (last && update.games < last.games)) {
    issues.push({ id: "V-10", level: "error", field: "games", message: "総回転数が前回より減っています" });
  } else if (update.games === s.start.games) {
    issues.push({ id: "V-10", level: "error", field: "games", message: "総回転数が打ち始めと同じです。回した後の総回転数を入れてください" });
  }
  for (const [k, v] of Object.entries(update.counts)) {
    if (v < (s.start.counts[k] ?? 0)) issues.push({ id: "V-11", level: "error", field: k, message: "打ち始めの回数より少なくなっています" });
  }
  return issues;
}

/**
 * 総回転数の更新を確定し、スナップショットを記録する。
 * 総回転数が前回と同じなら最新のスナップショットを置き換える（打ち始めの点は置き換えない。checkUpdate で拒否する）。
 */
export function applySnapshot(
  s: PlaySession,
  fields: FieldDef[],
  update: SnapshotUpdate,
  estimator: Estimator,
  now: Date = new Date(),
): PlaySession {
  assertActive(s);
  const undo = pushUndo(s, "snapshot", `総回転数 ${update.games}G`);
  const current = { games: update.games, counts: { ...s.current.counts, ...update.counts } };
  const sessionCounts = { ...s.sessionCounts, ...update.sessionCounts };
  const next = { ...s, undo, current, sessionCounts };
  const point = pointOf(next);
  const est = estimator(observationAt(fields, next, point));
  const last = s.snapshots[s.snapshots.length - 1];
  const replace = last !== undefined && last.games === update.games && s.snapshots.length > 1;
  // 残る直前の点より回数が減っていれば、その点は誤った回数で計算されていた（置き換えた点は消えるので比べない）
  const prev = replace ? s.snapshots[s.snapshots.length - 2] : last;
  const decreased = prev !== undefined && (
    Object.keys(point.counts).some((k) => point.counts[k]! < (prev.counts[k] ?? 0)) ||
    Object.keys(point.sessionCounts).some((k) => point.sessionCounts[k]! < (prev.sessionCounts[k] ?? 0))
  );
  const snap: Snapshot = { ...point, t: now.toISOString(), ...est, ...(decreased ? { corrected: true } : {}) };
  const snapshots = replace ? [...s.snapshots.slice(0, -1), snap] : [...s.snapshots, snap];
  return { ...next, snapshots };
}

/** 直前の操作を取り消す（台全体・区間・スナップショットをそろえて戻す） */
export function undoLast(s: PlaySession): PlaySession {
  assertActive(s);
  const entry = s.undo[s.undo.length - 1];
  if (!entry) return s;
  const snapshots = s.snapshots.slice(0, entry.prev.snapshotCount);
  if (entry.prev.lastSnapshot && snapshots.length > 0) snapshots[snapshots.length - 1] = entry.prev.lastSnapshot;
  return {
    ...s,
    current: entry.prev.current,
    sessionCounts: entry.prev.sessionCounts,
    snapshots,
    undo: s.undo.slice(0, -1),
  };
}

/** 機種データ・モデルの版が変わった後も、新しい版で続ける（それまでの点は記録当時の結果のまま） */
export function acceptConditionChange(s: PlaySession, to: { modelVersion: string; dataVersion: string }, now: Date = new Date()): PlaySession {
  assertActive(s);
  const change: ConditionChange = {
    t: now.toISOString(),
    games: s.current.games,
    from: { modelVersion: s.conditions.modelVersion, dataVersion: s.conditions.dataVersion },
    to,
  };
  return {
    ...s,
    conditions: { ...s.conditions, ...to },
    conditionChanges: [...(s.conditionChanges ?? []), change],
  };
}

/** 打ち終わり。undo は捨てて、スナップショットだけを残す */
export function endSession(s: PlaySession, now: Date = new Date()): PlaySession {
  return { ...s, endedAt: now.toISOString(), undo: [] };
}

/** 前回の更新から増えた、区間だけで数える回数の合計（更新を促す表示用） */
export function sessionCountsSinceLastSnapshot(s: PlaySession): number {
  const last = s.snapshots[s.snapshots.length - 1];
  if (!last) return 0;
  return Object.keys(s.sessionCounts).reduce((a, k) => a + (s.sessionCounts[k]! - (last.sessionCounts[k] ?? 0)), 0);
}
