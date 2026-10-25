// 画面の状態（signals）と計算結果（computed）。計算は core に任せ、ここでは組み立てるだけ。

import { computed, effect, signal } from "@preact/signals";
import { buildFromPlay, buildFromSimple, emptySimpleInput, type SimpleInput } from "../core/observation";
import { estimate, ImpossibleObservationError, type Estimate } from "../core/posterior";
import { DEFAULT_PRIOR_ID, presetsFor, resolvePrior } from "../core/priors/preset";
import type { ChartData, CompareRow, Issue, LikelihoodOptions, Observation } from "../core/types";
import { findMachine, registry, type MachineEntry } from "../machines/registry";
import * as store from "./persistence";
import {
  acceptConditionChange, applySnapshot, checkUpdate, createSession, endSession, increment, observationAt, pointOf, undoLast,
  type Counter, type PlayConditions, type PlaySession, type SnapshotUpdate,
} from "./playSession";

// ---------- 永続化の失敗 ----------
export const storageError = signal<string | null>(null);
store.onStorageFailure(() => {
  storageError.value = "この端末では入力を保存できません（プライベートブラウズや容量不足の可能性があります）";
});

// ---------- 基本の状態 ----------
const prefs = store.loadPrefs();
const urlMachine = typeof location !== "undefined" ? new URLSearchParams(location.search).get("m") : null;

export const machineId = signal<string>(
  findMachine(urlMachine)?.machine.id ?? findMachine(prefs?.machineId)?.machine.id ?? registry.entries[0]?.machine.id ?? "",
);
export const mode = signal<"simple" | "play">(prefs?.mode ?? "simple");
export const priorId = signal<string>(prefs?.priorId ?? DEFAULT_PRIOR_ID);
export const enabled = signal<Record<string, boolean>>(prefs?.enabled ?? { grape: true });
export const sheet = signal<null | "machine" | "settings" | "help" | "history">(null);

export const entry = computed<MachineEntry | undefined>(() => findMachine(machineId.value));
export const fields = computed(() => (entry.value ? entry.value.model.fields(entry.value.machine) : []));
export const priorOptions = computed(() => (entry.value ? presetsFor(entry.value.machine) : []));
export const prior = computed(() => (entry.value ? resolvePrior(entry.value.machine, priorId.value) : null));
export const opts = computed<LikelihoodOptions>(() => ({ enabled: enabled.value }));

effect(() => {
  store.savePrefs({ machineId: machineId.value, mode: mode.value, priorId: priorId.value, enabled: enabled.value });
});

// ---------- かんたん入力 ----------
function loadSimple(id: string): { input: SimpleInput; staleDate: string | null } {
  const saved = store.loadInput(id);
  if (!saved) return { input: emptySimpleInput(), staleDate: null };
  return { input: saved.input, staleDate: store.isToday(saved.updatedAt) ? null : saved.updatedAt };
}

const initial = loadSimple(machineId.value);
export const simpleInput = signal<SimpleInput>(initial.input);
/** 前回の入力が今日のものでないとき、その日時 */
export const staleInputDate = signal<string | null>(initial.staleDate);

let loadedFor = machineId.value;
effect(() => {
  const id = machineId.value;
  if (id !== loadedFor) {
    loadedFor = id;
    const next = loadSimple(id);
    simpleInput.value = next.input;
    staleInputDate.value = next.staleDate;
  }
});

export function setSimpleField(part: "games" | "sessionGames", value: string): void;
export function setSimpleField(part: "counts" | "sessionCounts", value: string, key: string): void;
export function setSimpleField(part: keyof SimpleInput, value: string, key?: string): void {
  const cur = simpleInput.value;
  const next: SimpleInput =
    part === "counts" || part === "sessionCounts"
      ? { ...cur, [part]: { ...cur[part], [key!]: value } }
      : { ...cur, [part]: value };
  simpleInput.value = next;
  staleInputDate.value = null;
  store.saveInput(machineId.value, next);
}

export function resetSimple(): void {
  simpleInput.value = emptySimpleInput();
  staleInputDate.value = null;
  store.saveInput(machineId.value, simpleInput.value);
}

export interface ResultView {
  obs: Observation | null;
  issues: Issue[];
  estimate: Estimate | null;
  rows: CompareRow[];
  /** 計算の前提（機種・データ版・事前分布・使った判別要素） */
  contextKey: string;
}

function contextKeyOf(e: MachineEntry, priorKey: string, o: LikelihoodOptions): string {
  return JSON.stringify([e.machine.id, e.machine.dataVersion, e.model.version, priorKey, o.enabled]);
}

export const simpleResult = computed<ResultView>(() => {
  const e = entry.value;
  const p = prior.value;
  if (!e || !p) return { obs: null, issues: [], estimate: null, rows: [], contextKey: "" };
  const contextKey = contextKeyOf(e, p.id, opts.value);
  const built = buildFromSimple(fields.value, simpleInput.value);
  if (!built.obs) return { obs: null, issues: built.issues, estimate: null, rows: [], contextKey };
  const issues = [...built.issues, ...e.model.validate(e.machine, built.obs, opts.value)];
  const rows = e.model.compareRows(e.machine, built.obs);
  if (issues.some((i) => i.level === "error")) return { obs: built.obs, issues, estimate: null, rows, contextKey };
  try {
    return { obs: built.obs, issues, estimate: estimate(e.model, e.machine, built.obs, p, opts.value), rows, contextKey };
  } catch (err) {
    if (!(err instanceof ImpossibleObservationError)) throw err;
    return { obs: built.obs, issues: [...issues, { id: "V-13", level: "error", message: err.message }], estimate: null, rows, contextKey };
  }
});

/** 入力エラー時に薄く残す前回の結果（前提が同じときだけ） */
export const lastGood = signal<{ view: ResultView; input: SimpleInput } | null>(null);
effect(() => {
  const r = simpleResult.value;
  if (r.estimate) lastGood.value = { view: r, input: simpleInput.peek() };
});
export const staleResult = computed(() => {
  const r = simpleResult.value;
  const lg = lastGood.value;
  if (r.estimate || !lg || lg.view.contextKey !== r.contextKey) return null;
  return r.issues.some((i) => i.level === "error") ? lg : null;
});

export const simpleCharts = computed<ChartData[]>(() => {
  const e = entry.value;
  const r = simpleResult.value;
  if (!e || !r.obs || !r.estimate) return [];
  return e.model.charts(e.machine, r.obs, opts.value);
});

// ---------- 実戦モード ----------
const savedPlay = store.loadActivePlay();
export const activePlay = signal<PlaySession | null>(savedPlay);
export const playHistory = signal<PlaySession[]>(store.loadHistory());
export const stalePlayDate = signal<string | null>(savedPlay && !store.isToday(savedPlay.startedAt) ? savedPlay.startedAt : null);

function savePlay(s: PlaySession | null): void {
  activePlay.value = s;
  store.saveActivePlay(s);
}

export const playEntry = computed(() => (activePlay.value ? findMachine(activePlay.value.machineId) : entry.value));

function estimatorFor(e: MachineEntry, c: PlayConditions) {
  const p = { id: c.prior.id, label: c.prior.label, version: c.prior.version, weights: c.prior.weights };
  return (obs: Observation) => {
    const est = estimate(e.model, e.machine, obs, p, { enabled: c.enabled });
    return { posterior: est.posterior, concentration: est.concentration };
  };
}

export function startPlay(start: Counter, memo?: string): Issue[] {
  const e = entry.value;
  const p = prior.value;
  if (!e || !p) return [];
  if (!e.model.capabilities.playMode) {
    return [{ id: "V-14", level: "error", message: "この機種は実戦モードに対応していません" }];
  }
  const startObs = buildFromPlay(fields.value, start, { ...start, sessionCounts: {} });
  const startIssues = e.model.validate(e.machine, startObs, opts.value).filter((i) => i.level === "error");
  if (startIssues.length > 0) return startIssues;
  const conditions: PlayConditions = {
    modelId: e.model.id, modelVersion: e.model.version, dataVersion: e.machine.dataVersion,
    prior: { id: p.id, label: p.label, version: p.version, weights: p.weights },
    enabled: { ...enabled.value },
  };
  try {
    savePlay(createSession({ machineId: e.machine.id, fields: fields.value, conditions, start, memo, estimator: estimatorFor(e, conditions) }));
    stalePlayDate.value = null;
    return [];
  } catch (err) {
    if (err instanceof ImpossibleObservationError) return [{ id: "V-13", level: "error", message: err.message }];
    throw err;
  }
}

export function tap(key: string): void {
  const s = activePlay.value;
  const e = playEntry.value;
  if (!s || !e || conditionsOutdated(s)) return;
  const f = e.model.fields(e.machine).find((x) => x.key === key);
  if (f) savePlay(increment(s, f));
}

export function undo(): void {
  const s = activePlay.value;
  if (s && !conditionsOutdated(s)) savePlay(undoLast(s));
}

/** 総回転数の更新。エラーがあれば記録せずに返す */
export function updatePlay(update: SnapshotUpdate): Issue[] {
  const s = activePlay.value;
  const e = playEntry.value;
  if (!s || !e || conditionsOutdated(s)) return [];
  const flds = e.model.fields(e.machine);
  const issues = checkUpdate(s, update);
  if (issues.length > 0) return issues;
  const trial = {
    ...s,
    current: { games: update.games, counts: { ...s.current.counts, ...update.counts } },
    sessionCounts: { ...s.sessionCounts, ...update.sessionCounts },
  };
  const obs = observationAt(flds, trial, pointOf(trial));
  const vIssues = e.model.validate(e.machine, obs, { enabled: s.conditions.enabled }).filter((i) => i.level === "error");
  if (vIssues.length > 0) return vIssues;
  try {
    savePlay(applySnapshot(s, flds, update, estimatorFor(e, s.conditions)));
    return [];
  } catch (err) {
    if (err instanceof ImpossibleObservationError) return [{ id: "V-13", level: "error", message: err.message }];
    throw err;
  }
}

/** 機種データ・モデルの版が変わった実戦を、新しい版で続ける（それまでの点は記録当時の結果のまま残す） */
export function continueWithNewData(): void {
  const s = activePlay.value;
  const e = playEntry.value;
  if (!s || !e) return;
  savePlay(acceptConditionChange(s, { modelVersion: e.model.version, dataVersion: e.machine.dataVersion }));
}

export function finishPlay(): void {
  const s = activePlay.value;
  if (!s) return;
  const ended = endSession(s);
  store.addHistory(ended);
  playHistory.value = store.loadHistory();
  savePlay(null);
  stalePlayDate.value = null;
}

export function discardPlay(): void {
  savePlay(null);
  stalePlayDate.value = null;
}

export function deleteHistory(id: string): void {
  store.removeHistory(id);
  playHistory.value = store.loadHistory();
}

/** 実戦モードの最新スナップショットでの詳しい結果（分布グラフ・比較表用） */
export const playLatest = computed(() => {
  const s = activePlay.value;
  const e = playEntry.value;
  if (!s || !e) return null;
  const last = s.snapshots[s.snapshots.length - 1];
  if (!last || conditionsOutdated(s)) return null;
  const flds = e.model.fields(e.machine);
  const obs = observationAt(flds, s, last);
  const o = { enabled: s.conditions.enabled };
  try {
    const est = estimate(e.model, e.machine, obs, s.conditions.prior, o);
    return { obs, estimate: est, charts: e.model.charts(e.machine, obs, o), rows: e.model.compareRows(e.machine, obs) };
  } catch {
    return null;
  }
});

/** 記録の前提が今の機種データ・モデルと違うか */
export function conditionsOutdated(s: PlaySession): boolean {
  const e = findMachine(s.machineId);
  return !e || e.machine.dataVersion !== s.conditions.dataVersion || e.model.version !== s.conditions.modelVersion;
}

/** 今の機種データ・モデルで推移を計算し直す（記録当時の条件の事前分布・ON/OFF はそのまま） */
export function recomputeTrend(s: PlaySession): { games: number; posterior: Record<string, number>; concentration: number }[] | null {
  const e = findMachine(s.machineId);
  if (!e) return null;
  const flds = e.model.fields(e.machine);
  const est = estimatorFor(e, s.conditions);
  try {
    return s.snapshots.map((snap) => ({ games: snap.games, ...est(observationAt(flds, s, snap)) }));
  } catch {
    return null;
  }
}

export function clearAllData(): void {
  store.clearAll();
  simpleInput.value = emptySimpleInput();
  activePlay.value = null;
  playHistory.value = [];
  lastGood.value = null;
  priorId.value = DEFAULT_PRIOR_ID;
  enabled.value = { grape: true };
}
