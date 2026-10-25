// 生の入力・実戦記録 → 検証済み Observation（変換はここだけで行う。内部設計 §4.7）。

import type { FieldDef, Issue, Observation } from "./types";

/** かんたん入力の生の値（入力途中の値を壊さないよう文字列のまま持つ） */
export interface SimpleInput {
  games: string;
  counts: Record<string, string>; // scope: total の項目
  sessionGames: string;
  sessionCounts: Record<string, string>; // scope: session の項目
}

export function emptySimpleInput(): SimpleInput {
  return { games: "", counts: {}, sessionGames: "", sessionCounts: {} };
}

const ZENKAKU_DIGITS = /[０-９]/g;

/** 空欄 → null、0以上の整数 → 数値、それ以外 → NaN */
export function parseCount(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw
    .replace(ZENKAKU_DIGITS, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, "");
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

export interface BuildResult {
  obs: Observation | null;
  issues: Issue[];
}

const FORMAT_MESSAGE = "0以上の整数で入力してください";

export function buildFromSimple(fields: FieldDef[], input: SimpleInput): BuildResult {
  const issues: Issue[] = [];
  const read = (raw: string | undefined, field: string): number | null => {
    const v = parseCount(raw);
    if (Number.isNaN(v)) {
      issues.push({ id: "V-01", level: "error", field, message: FORMAT_MESSAGE });
      return null;
    }
    return v;
  };

  const games = read(input.games, "games");
  const totalCounts: Record<string, number> = {};
  for (const f of fields.filter((f) => f.scope === "total")) {
    totalCounts[f.key] = read(input.counts[f.key], f.key) ?? 0;
  }
  const sessionGames = read(input.sessionGames, "sessionGames");
  const sessionFields = fields.filter((f) => f.scope === "session");
  const sessionCounts: Record<string, number | null> = {};
  for (const f of sessionFields) sessionCounts[f.key] = read(input.sessionCounts[f.key], f.key);

  if (issues.length > 0) return { obs: null, issues };
  if (games === null) {
    return { obs: null, issues: [{ id: "V-00", level: "notice", field: "games", message: "総回転数を入れてください" }] };
  }

  const anySessionCount = sessionFields.some((f) => sessionCounts[f.key] !== null);
  let session: Observation["session"] = null;
  if (sessionGames !== null && anySessionCount) {
    session = { games: sessionGames, counts: sessionCounts, totalDelta: null };
  } else if (sessionGames !== null || anySessionCount) {
    const labels = sessionFields.map((f) => f.label).join("・");
    issues.push({ id: "V-09", level: "notice", message: `${labels}は、遊技区間の回転数と回数の両方を入れると計算に使います` });
  }
  return { obs: { total: { games, counts: totalCounts }, session }, issues };
}

/** 実戦モードのある時点の値（打ち始めとの差から区間を作る） */
export interface PlayPoint {
  games: number;
  counts: Record<string, number>;
  sessionCounts: Record<string, number>;
}

export function buildFromPlay(
  fields: FieldDef[],
  start: { games: number; counts: Record<string, number> },
  point: PlayPoint,
): Observation {
  const totalFields = fields.filter((f) => f.scope === "total");
  const totalDelta = Object.fromEntries(totalFields.map((f) => [f.key, (point.counts[f.key] ?? 0) - (start.counts[f.key] ?? 0)]));
  const sessionCounts = Object.fromEntries(
    fields.filter((f) => f.scope === "session").map((f) => [f.key, point.sessionCounts[f.key] ?? 0]),
  );
  return {
    total: { games: point.games, counts: Object.fromEntries(totalFields.map((f) => [f.key, point.counts[f.key] ?? 0])) },
    session: { games: point.games - start.games, counts: sessionCounts, totalDelta },
  };
}

/** 1日分として受け付ける回転数の上限（これを超える値は入力ミスとみなす） */
export const MAX_GAMES = 100000;

/**
 * Observation の数値の基本検証（どの経路から来た入力でも、モデルの計算に入る前に行う）。
 * すべての回転数・回数が 0 以上の整数で、上限以下であること。
 */
export function numericIssues(obs: Observation): Issue[] {
  const bad: string[] = [];
  const check = (v: number | null | undefined, name: string, allowNull = false) => {
    if (v === null || v === undefined) {
      if (!allowNull) bad.push(name);
      return;
    }
    if (!Number.isInteger(v) || v < 0 || v > MAX_GAMES) bad.push(name);
  };
  check(obs.total.games, "games");
  for (const [k, v] of Object.entries(obs.total.counts)) check(v, k);
  if (obs.session) {
    check(obs.session.games, "sessionGames");
    for (const [k, v] of Object.entries(obs.session.counts)) check(v, k, true);
    if (obs.session.totalDelta) {
      for (const [k, v] of Object.entries(obs.session.totalDelta)) {
        // 区間の差分は負になり得る（打ち始めより減った）。整数であることだけを確かめ、負は V-11 で扱う
        if (!Number.isInteger(v)) bad.push(k);
      }
    }
  }
  return [...new Set(bad)].map((field) => ({ id: "V-01", level: "error" as const, field, message: "0以上の整数で入力してください" }));
}
