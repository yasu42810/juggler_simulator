import { describe, expect, it } from "vitest";
import { concentration, estimate, ImpossibleObservationError } from "../../src/core/posterior";
import { resolvePrior } from "../../src/core/priors/preset";
import { machine, model, obs, ON, standard, uniform } from "../helpers";

const pct = (x: number) => Math.round(x * 1000) / 10;

describe("posterior", () => {
  it("設計書の参考値（均等）", () => {
    const e = estimate(model, machine, obs(3000, 12, 11), uniform, ON);
    expect(machine.settings.map((s) => pct(e.posterior[s]!))).toEqual([9.5, 11.8, 17.3, 21.7, 21.9, 17.7]);
    expect(pct(e.groups[0]!.p)).toBe(61.4);
    expect(Math.round(e.payoutMean * 10) / 10).toBe(102.9);
    const e2 = estimate(model, machine, obs(3000, 12, 11, { n: 1500, g: 265 }), uniform, ON);
    expect(machine.settings.map((s) => pct(e2.posterior[s]!))).toEqual([7.8, 10.7, 17.1, 22.1, 22.9, 19.4]);
  });
  it("設計書の参考値（標準）と、均等の比較値", () => {
    const e = estimate(model, machine, obs(3000, 12, 11), standard, ON);
    expect(machine.settings.map((s) => pct(e.posterior[s]!))).toEqual([22.2, 27.4, 29.8, 12.9, 5.8, 1.8]);
    expect(pct(e.groups[0]!.p)).toBe(20.5);
    expect(pct(e.uniformGroups[0]!.p)).toBe(61.4);
  });
  it("総回転数0なら事前分布がそのまま返る", () => {
    const e = estimate(model, machine, obs(0, 0, 0), standard, ON);
    for (const s of machine.settings) expect(e.posterior[s]).toBeCloseTo(standard.weights[s]!, 12);
  });
  it("事後確率の和は1、事前0の設定は0", () => {
    const prior = { ...standard, weights: { ...standard.weights, "6": 0 } };
    const e = estimate(model, machine, obs(4000, 18, 16), prior, ON);
    expect(Object.values(e.posterior).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(e.posterior["6"]).toBe(0);
  });
  it("単調性（マイジャグラーV: N・REG 固定で BIG を増やすと設定4以上が増える）", () => {
    let prev = -1;
    for (let b = 5; b <= 30; b++) {
      const p4 = estimate(model, machine, obs(5000, b, 15), standard, ON).groups[0]!.p;
      expect(p4).toBeGreaterThan(prev);
      prev = p4;
    }
  });
  it("極端な値でも NaN を出さない", () => {
    const inputs = [obs(20000, 0, 0), obs(20000, 150, 120, { n: 20000, g: 3500 }), obs(500, 250, 250), obs(10, 0, 0, { n: 10, g: 10 })];
    for (const o of inputs) {
      const e = estimate(model, machine, o, uniform, ON);
      for (const s of machine.settings) expect(Number.isFinite(e.posterior[s]!)).toBe(true);
    }
  });
  it("起こり得ない入力ではエラー", () => {
    expect(() => estimate(model, machine, obs(10, 6, 6), uniform, ON)).toThrow(ImpossibleObservationError);
  });
  it("集中度", () => {
    expect(concentration([1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6])).toBeCloseTo(0, 12);
    expect(concentration([1, 0, 0, 0, 0, 0])).toBeCloseTo(1, 12);
  });
});

describe("ぶどう", () => {
  it("未計測と OFF は同じ、0回は違う", () => {
    const off = estimate(model, machine, obs(3000, 12, 11, { n: 1500, g: 265 }), uniform, { enabled: { grape: false } });
    const none = estimate(model, machine, obs(3000, 12, 11, { n: 1500, g: null }), uniform, ON);
    const base = estimate(model, machine, obs(3000, 12, 11), uniform, ON);
    const zero = estimate(model, machine, obs(3000, 12, 11, { n: 10, g: 0 }), uniform, ON);
    for (const s of machine.settings) {
      expect(off.posterior[s]).toBeCloseTo(base.posterior[s]!, 12);
      expect(none.posterior[s]).toBeCloseTo(base.posterior[s]!, 12);
    }
    expect(Math.abs(zero.posterior["1"]! - base.posterior["1"]!)).toBeGreaterThan(1e-6);
    expect(off.evidence).toEqual(["BIG", "REG"]);
    expect(base.evidence).toEqual(["BIG", "REG"]);
  });
  it("ボーナス以外のゲームでのぶどう確率 q を全設定で同じにすると、ぶどうは結果を変えない", () => {
    const q = 1 / 6.2;
    const flat = structuredClone(machine);
    for (const s of flat.settings) {
      const pb = 1 / (flat.probabilities.big.values[s] as { oneIn: number }).oneIn;
      const pr = 1 / (flat.probabilities.reg.values[s] as { oneIn: number }).oneIn;
      flat.probabilities.grape!.values[s] = { oneIn: 1 / (q * (1 - pb - pr)) };
    }
    const a = estimate(model, flat, obs(3000, 12, 11, { n: 1500, g: 240 }), uniform, ON);
    const b = estimate(model, flat, obs(3000, 12, 11), uniform, ON);
    const c = estimate(model, flat, obs(3000, 12, 11, { n: 1500, g: 240, known: { bw: 6, rw: 5 } }), uniform, ON);
    for (const s of flat.settings) {
      expect(a.posterior[s]).toBeCloseTo(b.posterior[s]!, 10);
      expect(c.posterior[s]).toBeCloseTo(b.posterior[s]!, 10);
    }
  });
  it("設定の並びを入れ替えると結果も同じように入れ替わる", () => {
    const rev = structuredClone(machine);
    const order = [...machine.settings].reverse();
    for (const key of ["big", "reg", "grape"] as const) {
      const t = rev.probabilities[key]!;
      t.values = Object.fromEntries(machine.settings.map((s, i) => [s, machine.probabilities[key]!.values[order[i]!]!]));
    }
    const o = obs(4000, 17, 14, { n: 2000, g: 345 });
    const a = estimate(model, machine, o, uniform, ON);
    const b = estimate(model, rev, o, uniform, ON);
    machine.settings.forEach((s, i) => expect(b.posterior[s]).toBeCloseTo(a.posterior[order[i]!]!, 12));
  });
  it("プリセットを解決できる", () => {
    expect(resolvePrior(machine, "nope").id).toBe("standard");
    expect(Object.values(resolvePrior(machine, "generous").weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});
