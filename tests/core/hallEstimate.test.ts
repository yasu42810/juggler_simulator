import { describe, expect, it } from "vitest";
import { logFactorial } from "../../src/core/math";
import { estimateHallMix, likelihoodMatrix, type HallUnit } from "../../src/core/priors/hallEstimate";
import { machine, model, obs, ON } from "../helpers";

const units: HallUnit[] = [
  { unit: "1", obs: obs(5600, 22, 17) },
  { unit: "2", obs: obs(6100, 22, 30) },
  { unit: "3", obs: obs(4900, 15, 10) },
  { unit: "4", obs: obs(5900, 28, 25) },
];

/** 全パターンの数え上げによる E[α | D]（β = 各設定 1） */
function exactMean(us: HallUnit[]): number[] {
  const L = likelihoodMatrix(model, machine, us, ON);
  const K = machine.settings.length;
  const n = us.length;
  const mean = new Array<number>(K).fill(0);
  let total = 0;
  const z = new Array<number>(n).fill(0);
  const visit = (i: number) => {
    if (i === n) {
      const c = new Array<number>(K).fill(0);
      let w = 1;
      z.forEach((k, j) => {
        c[k]! += 1;
        w *= L[j]![k]!;
      });
      // B(1 + c) / B(1) = Π c_k! · (K − 1)! / (K − 1 + n)!
      w *= Math.exp(c.reduce((a, x) => a + logFactorial(x), 0) + logFactorial(K - 1) - logFactorial(K - 1 + n));
      total += w;
      c.forEach((x, k) => (mean[k]! += (w * (1 + x)) / (K + n)));
      return;
    }
    for (let k = 0; k < K; k++) {
      z[i] = k;
      visit(i + 1);
    }
  };
  visit(0);
  return mean.map((m) => m / total);
}

describe("その日の店の配分の推定", () => {
  it("ギブスサンプリングの平均が、数え上げによる厳密な値と一致する", () => {
    const exact = exactMean(units);
    const est = estimateHallMix(model, machine, units, ON, { iterations: 40000, burnIn: 1000, seed: 7 });
    machine.settings.forEach((s, k) => expect(Math.abs(est.mean[s]! - exact[k]!)).toBeLessThan(0.005));
  });
  it("見たい台を除いて推定する（同じデータを二重に使わない）", () => {
    const est = estimateHallMix(model, machine, units, ON, { exclude: "2", iterations: 40000, seed: 7 });
    const exact = exactMean(units.filter((u) => u.unit !== "2"));
    expect(est.unitCount).toBe(3);
    expect(est.excluded).toBe("2");
    machine.settings.forEach((s, k) => expect(Math.abs(est.mean[s]! - exact[k]!)).toBeLessThan(0.005));
  });
  it("同じ seed なら同じ結果、平均の合計は1", () => {
    const a = estimateHallMix(model, machine, units, ON, { seed: 3 });
    const b = estimateHallMix(model, machine, units, ON, { seed: 3 });
    expect(a).toEqual(b);
    expect(Object.values(a.mean).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(a.groups[0]!.lo).toBeLessThanOrEqual(a.groups[0]!.mean);
    expect(a.groups[0]!.hi).toBeGreaterThanOrEqual(a.groups[0]!.mean);
  });
  it("台が多く、どれも高設定らしいデータなら、配分は高設定に寄る", () => {
    const many: HallUnit[] = Array.from({ length: 30 }, (_, i) => ({ unit: String(i), obs: obs(8000, 35, 35) }));
    const est = estimateHallMix(model, machine, many, ON);
    expect(est.groups[0]!.mean).toBeGreaterThan(0.7);
  });
  it("台がなければ事前分布（均等）のまま", () => {
    const est = estimateHallMix(model, machine, [], ON, { iterations: 20000 });
    for (const s of machine.settings) expect(est.mean[s]).toBeCloseTo(1 / 6, 10);
  });
});
