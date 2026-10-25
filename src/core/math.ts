// 対数空間での確率計算。大きな回転数でもあふれないよう、確率はすべて対数で扱う。

let logFactTable: Float64Array = new Float64Array([0]);

function ensureLogFact(n: number): void {
  if (n < logFactTable.length) return;
  const size = Math.max(n + 1, logFactTable.length * 2, 1024);
  const table = new Float64Array(size);
  table.set(logFactTable);
  for (let i = logFactTable.length; i < size; i++) {
    table[i] = table[i - 1]! + Math.log(i);
  }
  logFactTable = table;
}

/** ln(n!) */
export function logFactorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`logFactorial: ${n}`);
  ensureLogFact(n);
  return logFactTable[n]!;
}

/** ln C(n, k)。範囲外は -Infinity */
export function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** k·ln(p)。0·ln(0) = 0 として扱う */
function xlogy(x: number, y: number): number {
  if (x === 0) return 0;
  return x * Math.log(y);
}

/** k·ln(1−p)。0·ln(0) = 0 として扱う */
function xlog1my(x: number, y: number): number {
  if (x === 0) return 0;
  return x * Math.log1p(-y);
}

/** 二項分布 Bin(k; n, p) の対数確率 */
export function logBinomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logChoose(n, k) + xlogy(k, p) + xlog1my(n - k, p);
}

/** 超幾何分布 Hyp(k; N, K, n)（N 個中 K 個が当たり、n 個取り出したときの当たり数 k）の対数確率 */
export function logHypergeomPmf(k: number, N: number, K: number, n: number): number {
  if (k < Math.max(0, n - (N - K)) || k > Math.min(K, n)) return -Infinity;
  return logChoose(K, k) + logChoose(N - K, n - k) - logChoose(N, n);
}

/** ln Σ exp(x_i)。すべて -Infinity なら -Infinity */
export function logSumExp(xs: readonly number[]): number {
  let max = -Infinity;
  for (const x of xs) if (x > max) max = x;
  if (max === -Infinity) return -Infinity;
  if (max === Infinity) return Infinity;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - max);
  return max + Math.log(sum);
}
