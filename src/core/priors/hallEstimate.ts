// その日の店の設定配分の推定（FR-32、内部設計 §11）。
// 店・その日の配分 α ~ Dirichlet(β)、各台の設定 s_i ~ Categorical(α)、各台のデータは s_i のもとでモデルの尤度に従う。
// α の事後分布をギブスサンプリングで求め、見たい台を除いた E[α | D_{−j}] を事前分布として使う。

import { categorical, createRng, dirichlet } from "../random";
import type { LikelihoodOptions, MachineDataBase, Observation, SettingModel } from "../types";

export interface HallUnit {
  unit: string; // 台番号
  obs: Observation;
}

export interface IntervalSummary {
  label: string;
  mean: number;
  lo: number; // 5% 点
  hi: number; // 95% 点
}

export interface HallMixEstimate {
  /** 設定 → E[α_s | D]（事前分布として使う値） */
  mean: Record<string, number>;
  perSetting: IntervalSummary[];
  groups: IntervalSummary[];
  /** 推定に使った台の数（除いた台を除く） */
  unitCount: number;
  excluded: string | null;
}

export interface HallMixOptions {
  /** 推定から除く台番号（見たい台） */
  exclude?: string | null;
  /** α の事前分布 Dirichlet(β)。既定は各設定 1（店の傾向が分からない） */
  beta?: Record<string, number>;
  iterations?: number;
  burnIn?: number;
  seed?: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return sorted[i]! + (sorted[Math.min(i + 1, sorted.length - 1)]! - sorted[i]!) * f;
}

function summarize(label: string, draws: number[]): IntervalSummary {
  const sorted = [...draws].sort((a, b) => a - b);
  return { label, mean: draws.reduce((a, b) => a + b, 0) / draws.length, lo: quantile(sorted, 0.05), hi: quantile(sorted, 0.95) };
}

/** 各台の尤度ベクトル（設定ごと、最大値で割って正規化した値） */
export function likelihoodMatrix<M extends MachineDataBase>(
  model: SettingModel<M>, machine: M, units: HallUnit[], opts: LikelihoodOptions,
): number[][] {
  return units.map((u) => {
    const ll = machine.settings.map((s) => model.logLikelihood(machine, u.obs, s, opts));
    const max = Math.max(...ll);
    if (!Number.isFinite(max)) throw new Error(`台 ${u.unit} のデータはモデル上起こり得ません`);
    return ll.map((x) => Math.exp(x - max));
  });
}

export function estimateHallMix<M extends MachineDataBase>(
  model: SettingModel<M>,
  machine: M,
  units: HallUnit[],
  opts: LikelihoodOptions,
  options: HallMixOptions = {},
): HallMixEstimate {
  const settings = machine.settings;
  const K = settings.length;
  const used = units.filter((u) => u.unit !== options.exclude);
  const beta = settings.map((s) => options.beta?.[s] ?? 1);
  const iterations = options.iterations ?? 4000;
  const burnIn = options.burnIn ?? 500;
  const rng = createRng(options.seed ?? 12345);
  const L = likelihoodMatrix(model, machine, used, opts);

  const draws: number[][] = [];
  const rbSum = new Array<number>(K).fill(0); // E[α | z] = (β + 各設定の台数) / (Σβ + 台数) の合計
  const betaSum = beta.reduce((x, y) => x + y, 0);
  let alpha = beta.map((b) => b / beta.reduce((x, y) => x + y, 0));
  const counts = new Array<number>(K);
  const w = new Array<number>(K);
  for (let it = 0; it < iterations + burnIn; it++) {
    counts.fill(0);
    for (const li of L) {
      for (let k = 0; k < K; k++) w[k] = li[k]! * alpha[k]!;
      counts[categorical(rng, w)]! += 1;
    }
    alpha = dirichlet(rng, beta.map((b, k) => b + counts[k]!));
    if (it >= burnIn) {
      draws.push(alpha);
      for (let k = 0; k < K; k++) rbSum[k]! += (beta[k]! + counts[k]!) / (betaSum + L.length);
    }
  }

  // 平均は条件付き期待値の平均（Rao–Blackwell 化）で求める。単純な標本平均よりばらつきが小さい
  const mean = Object.fromEntries(settings.map((s, k) => [s, rbSum[k]! / draws.length]));
  return {
    mean,
    perSetting: settings.map((s, k) => summarize(`設定${s}`, draws.map((d) => d[k]!))),
    groups: machine.settingGroups.map((g) => {
      const idx = g.settings.map((s) => settings.indexOf(s));
      return summarize(g.label, draws.map((d) => idx.reduce((a, k) => a + d[k]!, 0)));
    }),
    unitCount: used.length,
    excluded: options.exclude && units.some((u) => u.unit === options.exclude) ? options.exclude : null,
  };
}
