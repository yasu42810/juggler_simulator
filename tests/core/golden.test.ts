// 計算検証: SciPy（scripts/golden.py）の独立計算と、事後確率の絶対誤差 1e-9 以内で一致する（NFR-06）
import { describe, expect, it } from "vitest";
import { estimate } from "../../src/core/posterior";
import { resolvePrior } from "../../src/core/priors/preset";
import golden from "../golden/my-juggler-v.json";
import { machine, model, obs, ON } from "../helpers";

interface Case {
  N: number; b: number; r: number;
  session?: { n: number; g: number; known: { bw: number; rw: number } | null };
  posterior: Record<string, Record<string, number>>;
}

describe("golden: my-juggler-v", () => {
  const cases = (golden as { cases: Case[] }).cases;
  it("has cases for all three paths", () => {
    expect(cases.some((c) => !c.session)).toBe(true);
    expect(cases.some((c) => c.session && !c.session.known)).toBe(true);
    expect(cases.some((c) => c.session?.known)).toBe(true);
  });
  for (const presetId of ["uniform", "standard", "generous"]) {
    it(`matches SciPy (${presetId})`, () => {
      const prior = resolvePrior(machine, presetId);
      let worst = 0;
      for (const c of cases) {
        const o = obs(c.N, c.b, c.r, c.session ? { n: c.session.n, g: c.session.g, known: c.session.known ?? undefined } : undefined);
        const est = estimate(model, machine, o, prior, ON);
        for (const s of machine.settings) {
          worst = Math.max(worst, Math.abs(est.posterior[s]! - c.posterior[presetId]![s]!));
        }
      }
      expect(worst).toBeLessThan(1e-9);
    });
  }
});
