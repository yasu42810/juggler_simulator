// 機種データに書かれた確率の表現を、数値の確率に直す。

export type ProbValue = { oneIn: number } | { num: number; den: number };

export function toProbability(v: ProbValue): number {
  if ("oneIn" in v) return 1 / v.oneIn;
  return v.num / v.den;
}

/** 確率 p を「1/x」の x に直す（表示用） */
export function toOneIn(p: number): number {
  return 1 / p;
}
