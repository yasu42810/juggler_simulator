import { describe, expect, it } from "vitest";
import { buildFromPlay, buildFromSimple, numericIssues, parseCount } from "../../src/core/observation";
import { machine, model } from "../helpers";

const fields = model.fields(machine);
const input = (o: Partial<{ games: string; big: string; reg: string; sg: string; grape: string }>) => ({
  games: o.games ?? "", counts: { big: o.big ?? "", reg: o.reg ?? "" }, sessionGames: o.sg ?? "", sessionCounts: { grape: o.grape ?? "" },
});

describe("parseCount", () => {
  it("全角・カンマ・空欄・不正", () => {
    expect(parseCount("３０００")).toBe(3000);
    expect(parseCount("3,000")).toBe(3000);
    expect(parseCount(" ")).toBeNull();
    expect(Number.isNaN(parseCount("1.5"))).toBe(true);
    expect(Number.isNaN(parseCount("-1"))).toBe(true);
  });
});

describe("buildFromSimple", () => {
  it("総回転数が空なら結果なし（V-00）", () => {
    const r = buildFromSimple(fields, input({}));
    expect(r.obs).toBeNull();
    expect(r.issues[0]!.id).toBe("V-00");
  });
  it("BIG・REG の空欄は 0", () => {
    expect(buildFromSimple(fields, input({ games: "100" })).obs!.total.counts).toEqual({ big: 0, reg: 0 });
  });
  it("V-01: 不正な数", () => {
    expect(buildFromSimple(fields, input({ games: "abc" })).issues.map((i) => i.id)).toEqual(["V-01"]);
  });
  it("遊技区間: 両方入力で使う、片方だけなら V-09 で使わない、ぶどう 0 は観測", () => {
    expect(buildFromSimple(fields, input({ games: "100", sg: "50", grape: "8" })).obs!.session).toEqual({ games: 50, counts: { grape: 8 }, totalDelta: null });
    const half = buildFromSimple(fields, input({ games: "100", sg: "50" }));
    expect(half.obs!.session).toBeNull();
    expect(half.issues.map((i) => i.id)).toEqual(["V-09"]);
    expect(buildFromSimple(fields, input({ games: "100", sg: "50", grape: "0" })).obs!.session!.counts.grape).toBe(0);
  });
});

describe("buildFromPlay", () => {
  it("区間は打ち始めとの差", () => {
    const o = buildFromPlay(fields, { games: 1000, counts: { big: 4, reg: 3 } }, { games: 1600, counts: { big: 6, reg: 5 }, sessionCounts: { grape: 100 } });
    expect(o).toEqual({
      total: { games: 1600, counts: { big: 6, reg: 5 } },
      session: { games: 600, counts: { grape: 100 }, totalDelta: { big: 2, reg: 2 } },
    });
  });
});

describe("入力の基本検証", () => {
  it("片方だけ入力でも、不正な値は V-01 にする（未計測として捨てない）", () => {
    const r = buildFromSimple(fields, input({ games: "100", grape: "abc" }));
    expect(r.obs).toBeNull();
    expect(r.issues.map((i) => i.id)).toEqual(["V-01"]);
  });
  it("numericIssues: NaN・負数・小数・上限超過を拒否（実戦モードの経路も守る）", () => {
    const base = { total: { games: 100, counts: { big: 1, reg: 1 } }, session: null };
    expect(numericIssues(base)).toEqual([]);
    expect(numericIssues({ ...base, total: { games: NaN, counts: { big: 1, reg: 1 } } }).map((i) => i.field)).toEqual(["games"]);
    expect(numericIssues({ ...base, total: { games: 100, counts: { big: -1, reg: 1.5 } } }).map((i) => i.field)).toEqual(["big", "reg"]);
    expect(numericIssues({ ...base, total: { games: 1e6, counts: { big: 1, reg: 1 } } }).map((i) => i.field)).toEqual(["games"]);
    expect(model.validate(machine, { ...base, total: { games: NaN, counts: { big: 1, reg: 1 } } }, { enabled: {} })[0]!.id).toBe("V-01");
  });
});
