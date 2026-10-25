import { describe, expect, it } from "vitest";
import { machine, model, obs, ON } from "../helpers";

const ids = (o: ReturnType<typeof obs>) => model.validate(machine, o, ON).map((i) => i.id);

describe("validate（入力チェック）", () => {
  it("V-02: BIG+REG > 総回転数", () => expect(ids(obs(10, 6, 5))).toContain("V-02"));
  it("V-03: 遊技区間 > 総回転数", () => expect(ids(obs(100, 0, 0, { n: 200, g: 10 }))).toContain("V-03"));
  it("V-04: ぶどう > 総回転数 − BIG − REG", () => {
    expect(ids(obs(100, 5, 5, { n: 100, g: 91 }))).toContain("V-04");
    expect(ids(obs(100, 5, 5, { n: 100, g: 90 }))).not.toContain("V-04");
  });
  it("V-12: 区間のボーナス回数が分かるとき、ぶどう > 区間の回転数 − 区間ボーナス", () => {
    expect(ids(obs(1000, 5, 5, { n: 100, g: 99, known: { bw: 1, rw: 1 } }))).toContain("V-12");
    expect(ids(obs(1000, 5, 5, { n: 100, g: 98, known: { bw: 1, rw: 1 } }))).not.toContain("V-12");
  });
  it("V-06 / V-08 の警告", () => {
    expect(ids(obs(13000, 50, 40))).toContain("V-06");
    expect(ids(obs(500, 2, 1))).toContain("V-08");
  });
  it("V-07: どの設定でも起こりにくいぶどう回数は警告", () => {
    expect(ids(obs(3000, 12, 11, { n: 3000, g: 400 }))).toContain("V-07");
    expect(ids(obs(3000, 12, 11, { n: 3000, g: 515 }))).not.toContain("V-07");
  });
});

describe("charts（分布グラフ）", () => {
  it("BIG・REG・合算・ぶどうのタブがあり、表示範囲に実測値が入る", () => {
    const charts = model.charts(machine, obs(3000, 40, 11, { n: 1500, g: 265 }), ON);
    expect(charts.map((c) => c.id)).toEqual(["big", "reg", "combined", "grape"]);
    for (const c of charts) {
      const ks = c.series[0]!.points.map((p) => p.k);
      expect(ks[0]!).toBeLessThanOrEqual(c.observed!);
      expect(ks[ks.length - 1]!).toBeGreaterThanOrEqual(c.observed!);
    }
  });
  it("表示範囲の確率の和はほぼ1（0.1%〜99.9% 点を含む）", () => {
    for (const o of [obs(3000, 12, 11, { n: 1500, g: 265 }), obs(3000, 12, 11, { n: 1500, g: 265, known: { bw: 6, rw: 5 } })]) {
      for (const c of model.charts(machine, o, ON)) {
        for (const s of c.series) {
          const sum = s.points.reduce((a, p) => a + p.p, 0);
          expect(sum).toBeGreaterThan(0.997);
          expect(sum).toBeLessThan(1 + 1e-9);
        }
      }
    }
  });
  it("回転数0ならグラフなし、期待回数が小さいときは棒", () => {
    expect(model.charts(machine, obs(0, 0, 0), ON)).toEqual([]);
    expect(model.charts(machine, obs(500, 1, 1), ON)[0]!.discrete).toBe(true);
    expect(model.charts(machine, obs(5000, 20, 15), ON)[0]!.discrete).toBe(false);
  });
  it("ぶどう OFF ならぶどうのタブは出ない", () => {
    expect(model.charts(machine, obs(3000, 12, 11, { n: 1500, g: 265 }), { enabled: { grape: false } }).map((c) => c.id)).not.toContain("grape");
  });
});

describe("compareRows", () => {
  it("実測の 1/○○ と公表の合算", () => {
    const rows = model.compareRows(machine, obs(3000, 12, 0, { n: 1500, g: 250 }));
    expect(rows.find((r) => r.key === "big")!.observedOneIn).toBe(250);
    expect(rows.find((r) => r.key === "reg")!.observedOneIn).toBeNull();
    expect(rows.find((r) => r.key === "combined")!.bySetting["1"]).toBe(163.8);
    expect(rows.find((r) => r.key === "grape")!.observedOneIn).toBe(6);
  });
});
