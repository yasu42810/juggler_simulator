import { describe, expect, it } from "vitest";
import { buildFromPlay } from "../../src/core/observation";
import { estimate } from "../../src/core/posterior";
import {
  acceptConditionChange, applySnapshot, checkUpdate, EndedSessionError, createSession, endSession, increment, sessionCountsSinceLastSnapshot, undoLast, UNDO_LIMIT,
} from "../../src/state/playSession";
import { machine, model, standard } from "../helpers";

const fields = model.fields(machine);
const f = (k: string) => fields.find((x) => x.key === k)!;
const conditions = { modelId: model.id, modelVersion: model.version, dataVersion: machine.dataVersion, prior: standard, enabled: { grape: true } };
const estimator = (o: Parameters<typeof estimate>[2]) => {
  const e = estimate(model, machine, o, standard, { enabled: { grape: true } });
  return { posterior: e.posterior, concentration: e.concentration };
};
/** 1500G の点が BIG 5 のまま残っている記録 */
const afterFirstSession = (s: ReturnType<typeof createSession>) => applySnapshot(undoLast(s), fields, { games: 1500, counts: { big: 5 } }, estimator);
const start = () => createSession({ machineId: machine.id, fields, conditions, start: { games: 1000, counts: { big: 4, reg: 3 } }, estimator });

describe("playSession", () => {
  it("打ち始めで最初のスナップショットができる", () => {
    const s = start();
    expect(s.snapshots).toHaveLength(1);
    expect(s.sessionCounts).toEqual({ grape: 0 });
  });
  it("BIG のボタンは台全体を +1、ぶどうは区間を +1", () => {
    let s = start();
    s = increment(s, f("big"));
    s = increment(s, f("grape"));
    expect(s.current.counts.big).toBe(5);
    expect(s.sessionCounts.grape).toBe(1);
    expect(sessionCountsSinceLastSnapshot(s)).toBe(1);
  });
  it("スナップショットの事後確率は、同じ値の Observation を推定関数に渡した結果と一致（A-15）", () => {
    let s = start();
    for (let i = 0; i < 90; i++) s = increment(s, f("grape"));
    s = increment(s, f("reg"));
    s = applySnapshot(s, fields, { games: 1500, counts: { big: 5, reg: 4 } }, estimator);
    const last = s.snapshots[s.snapshots.length - 1]!;
    const o = buildFromPlay(fields, s.start, last);
    expect(o.session!.totalDelta).toEqual({ big: 1, reg: 1 });
    const direct = estimate(model, machine, o, standard, { enabled: { grape: true } });
    for (const k of machine.settings) expect(last.posterior[k]).toBeCloseTo(direct.posterior[k]!, 12);
  });
  it("同じ総回転数での更新は最新の点を置き換える", () => {
    let s = start();
    s = applySnapshot(s, fields, { games: 1500, counts: {} }, estimator);
    s = increment(s, f("grape"));
    s = applySnapshot(s, fields, { games: 1500, counts: {} }, estimator);
    expect(s.snapshots.map((x) => x.games)).toEqual([1000, 1500]);
    expect(s.snapshots[1]!.sessionCounts.grape).toBe(1);
  });
  it("戻すと台全体・区間・スナップショットがそろって戻る（A-16）", () => {
    let s = start();
    s = increment(s, f("grape"));
    const before = structuredClone({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots });
    s = applySnapshot(s, fields, { games: 1400, counts: { big: 3 } }, estimator); // BIG を減らす訂正を含む更新
    expect(s.current.counts.big).toBe(3);
    s = undoLast(s);
    expect({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots }).toEqual(before);
  });
  it("戻すの履歴は上限まで", () => {
    let s = start();
    for (let i = 0; i < UNDO_LIMIT + 20; i++) s = increment(s, f("grape"));
    expect(s.undo).toHaveLength(UNDO_LIMIT);
  });
  it("V-10 / V-11", () => {
    let s = start();
    s = applySnapshot(s, fields, { games: 1500, counts: {} }, estimator);
    expect(checkUpdate(s, { games: 1400, counts: {} }).map((i) => i.id)).toEqual(["V-10"]);
    expect(checkUpdate(s, { games: 1600, counts: { big: 3 } }).map((i) => i.id)).toEqual(["V-11"]);
    expect(checkUpdate(s, { games: 1600, counts: { big: 4 } })).toEqual([]);
    expect(checkUpdate(start(), { games: 1000, counts: {} }).map((i) => i.id)).toEqual(["V-10"]);
  });
  it("打ち終わりで undo を捨てる", () => {
    const s = endSession(increment(start(), f("grape")));
    expect(s.undo).toEqual([]);
    expect(s.endedAt).toBeDefined();
  });
  it("タップ → 更新 → 同じ回転数で訂正（置き換え）→ 戻す → 戻す", () => {
    let s = start();
    s = increment(s, f("grape"));
    const afterTap = structuredClone({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots });
    s = applySnapshot(s, fields, { games: 1500, counts: { big: 5 } }, estimator);
    const afterFirst = structuredClone({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots });
    s = applySnapshot(s, fields, { games: 1500, counts: { big: 4 }, sessionCounts: { grape: 0 } }, estimator); // 訂正
    expect(s.snapshots).toHaveLength(2);
    expect(s.snapshots[1]!.corrected).toBeUndefined(); // 誤った点は置き換えで消えたので、訂正の印は不要
    const appended = applySnapshot(s, fields, { games: 1600, counts: { big: 4 }, sessionCounts: { grape: 0 } }, estimator);
    expect(applySnapshot(appended, fields, { games: 1700, counts: { big: 4 }, sessionCounts: { grape: 0 } }, estimator).snapshots.at(-1)!.corrected).toBeUndefined();
    expect(applySnapshot(afterFirstSession(s), fields, { games: 1600, counts: { big: 4 } }, estimator).snapshots.at(-1)!.corrected).toBe(true);
    s = undoLast(s);
    expect({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots }).toEqual(afterFirst);
    s = undoLast(s);
    expect({ current: s.current, sessionCounts: s.sessionCounts, snapshots: s.snapshots }).toEqual(afterTap);
  });
  it("戻すの履歴は全体を複製しない（スナップショット本体を持たない）", () => {
    let s = start();
    for (let i = 0; i < 5; i++) s = applySnapshot(s, fields, { games: 1100 + i * 100, counts: {} }, estimator);
    s = increment(s, f("grape"));
    const entry = s.undo[s.undo.length - 1]!;
    expect(Object.keys(entry.prev).sort()).toEqual(["current", "lastSnapshot", "sessionCounts", "snapshotCount"]);
    expect(entry.prev.snapshotCount).toBe(6);
  });
  it("終了した記録は変更できない", () => {
    const s = endSession(start());
    expect(() => increment(s, f("grape"))).toThrow(EndedSessionError);
    expect(() => applySnapshot(s, fields, { games: 2000, counts: {} }, estimator)).toThrow(EndedSessionError);
  });
  it("新しい機種データで続けると、条件と変更点が記録される", () => {
    const s = acceptConditionChange(start(), { modelVersion: "9", dataVersion: "2099-01-01" });
    expect(s.conditions.dataVersion).toBe("2099-01-01");
    expect(s.conditionChanges).toHaveLength(1);
    expect(s.conditionChanges![0]!.from.dataVersion).toBe(machine.dataVersion);
  });
});
