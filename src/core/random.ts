// 再現できる乱数（同じ seed なら同じ結果）。ギブスサンプリング用。

export type Rng = () => number;

/** mulberry32: 32ビットの小さな擬似乱数。[0, 1) を返す */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  // Box–Muller
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** ガンマ分布 Gamma(shape, 1)（Marsaglia–Tsang） */
export function gamma(rng: Rng, shape: number): number {
  if (shape < 1) {
    let u = 0;
    while (u === 0) u = rng();
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** ディリクレ分布 Dir(alpha) */
export function dirichlet(rng: Rng, alpha: readonly number[]): number[] {
  const g = alpha.map((a) => gamma(rng, a));
  const sum = g.reduce((x, y) => x + y, 0);
  return g.map((x) => x / sum);
}

/** 重み（合計1でなくてよい）に従ってカテゴリを1つ選ぶ */
export function categorical(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((x, y) => x + y, 0);
  let u = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    u -= weights[i]!;
    if (u < 0) return i;
  }
  return weights.length - 1;
}
