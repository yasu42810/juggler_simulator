import { describe, expect, it } from "vitest";
import { logBinomPmf, logChoose, logFactorial, logHypergeomPmf, logSumExp } from "../../src/core/math";

describe("math", () => {
  it("logFactorial", () => {
    expect(logFactorial(0)).toBe(0);
    expect(logFactorial(5)).toBeCloseTo(Math.log(120), 12);
    expect(logFactorial(20000)).toBeGreaterThan(0);
    expect(() => logFactorial(-1)).toThrow();
  });
  it("logChoose", () => {
    expect(Math.exp(logChoose(10, 3))).toBeCloseTo(120, 9);
    expect(logChoose(3, 4)).toBe(-Infinity);
  });
  it("二項分布の確率の和は1", () => {
    const n = 300;
    let sum = 0;
    for (let k = 0; k <= n; k++) sum += Math.exp(logBinomPmf(k, n, 1 / 5.8));
    expect(sum).toBeCloseTo(1, 10);
    expect(logBinomPmf(0, 0, 0.3)).toBe(0);
    expect(logBinomPmf(0, 10, 0)).toBe(0);
  });
  it("超幾何分布の確率の和は1", () => {
    let sum = 0;
    for (let k = 0; k <= 20; k++) sum += Math.exp(logHypergeomPmf(k, 100, 20, 30));
    expect(sum).toBeCloseTo(1, 12);
    expect(logHypergeomPmf(5, 10, 2, 5)).toBe(-Infinity);
  });
  it("logSumExp はあふれない", () => {
    expect(logSumExp([1000, 1000])).toBeCloseTo(1000 + Math.log(2), 12);
    expect(logSumExp([-1000, -1000])).toBeCloseTo(-1000 + Math.log(2), 12);
    expect(logSumExp([-Infinity, -Infinity])).toBe(-Infinity);
    expect(logSumExp([])).toBe(-Infinity);
  });
});
