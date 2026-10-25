// 分布グラフ用の点列を作る（内部設計 §4.8）。

import type { ChartSeries } from "./types";

export interface SeriesSpec {
  setting: string;
  mean: number;
  sd: number;
  /** k 回になる対数確率 */
  logPmf: (k: number) => number;
}

const LOWER_Q = 0.001;
const UPPER_Q = 0.999;

/**
 * 各設定の 0.1%〜99.9% 点の和集合に、実測値を加えた範囲の点列を返す。
 * 表示範囲の外の確率で再正規化はしない。
 */
export function buildSeries(
  specs: SeriesSpec[],
  maxK: number,
  observed: number | null,
): { series: ChartSeries[]; discrete: boolean } {
  if (maxK <= 0 || specs.length === 0) return { series: [], discrete: true };

  let lo = Infinity;
  let hi = -Infinity;
  for (const s of specs) {
    const width = 6 * Math.max(s.sd, 1);
    lo = Math.min(lo, Math.floor(s.mean - width));
    hi = Math.max(hi, Math.ceil(s.mean + width));
  }
  if (observed !== null) {
    lo = Math.min(lo, observed);
    hi = Math.max(hi, observed);
  }
  lo = Math.max(0, lo);
  hi = Math.min(maxK, hi);

  const full = specs.map((s) => {
    const ps: number[] = [];
    for (let k = lo; k <= hi; k++) ps.push(Math.exp(s.logPmf(k)));
    return ps;
  });

  // 0.1%〜99.9% 点の和集合。窓は平均 ± 6σ なので、窓より下の確率は無視できる
  let a = hi;
  let b = lo;
  full.forEach((ps) => {
    let cum = 0;
    let qlo = lo;
    let qhi = hi;
    let foundLo = false;
    for (let j = 0; j < ps.length; j++) {
      cum += ps[j]!;
      if (!foundLo && cum >= LOWER_Q) {
        qlo = lo + j;
        foundLo = true;
      }
      if (cum >= UPPER_Q) {
        qhi = lo + j;
        break;
      }
    }
    a = Math.min(a, qlo);
    b = Math.max(b, qhi);
  });
  if (observed !== null) {
    a = Math.min(a, observed);
    b = Math.max(b, observed);
  }
  a = Math.max(lo, a);
  b = Math.min(hi, b);

  const series = specs.map((s, i) => ({
    setting: s.setting,
    points: full[i]!.slice(a - lo, b - lo + 1).map((p, j) => ({ k: a + j, p })),
  }));
  const discrete = Math.max(...specs.map((s) => s.mean)) < 5;
  return { series, discrete };
}

/**
 * 片側の確率 P(K ≤ x) と P(K ≥ x) を返す（V-07 用）。
 * 平均 ± 10σ の外の確率は無視できるものとして扱う。
 */
export function tailProbabilities(s: SeriesSpec, maxK: number, x: number): { lower: number; upper: number } {
  const width = 10 * Math.max(s.sd, 1);
  const lo = Math.max(0, Math.floor(s.mean - width));
  const hi = Math.min(maxK, Math.ceil(s.mean + width));
  if (x < lo) return { lower: 0, upper: 1 };
  if (x > hi) return { lower: 1, upper: 0 };
  let lower = 0;
  let upper = 0;
  for (let k = lo; k <= hi; k++) {
    const p = Math.exp(s.logPmf(k));
    if (k <= x) lower += p;
    if (k >= x) upper += p;
  }
  return { lower, upper };
}
