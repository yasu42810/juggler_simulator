// 尤度ベクトル + 事前分布 → 事後確率と集計値（内部設計 §4.6）。
// モデルの中身は知らず、logLikelihood を設定ごとに呼ぶだけ。

import { logSumExp } from "./math";
import type { PriorSpec } from "./priors/types";
import type { LikelihoodOptions, MachineDataBase, Observation, SettingModel } from "./types";

export interface GroupProbability {
  label: string;
  p: number;
}

export interface Estimate {
  /** 設定 → 事後確率 */
  posterior: Record<string, number>;
  /** 比較用: 事前分布が均等の場合の事後確率（FR-17b） */
  uniformPosterior: Record<string, number>;
  groups: GroupProbability[];
  uniformGroups: GroupProbability[];
  /** 公表機械割の事後加重平均（%） */
  payoutMean: number;
  /** 集中度 1 − H(P)/ln K（0〜1） */
  concentration: number;
  /** 計算に使った判別要素 */
  evidence: string[];
  logLikelihood: Record<string, number>;
}

export class ImpossibleObservationError extends Error {
  constructor() {
    super("この入力はモデル上起こり得ません");
  }
}

export function normalizeLog(settings: string[], logWeights: Record<string, number>): Record<string, number> {
  const values = settings.map((s) => logWeights[s]!);
  const total = logSumExp(values);
  if (total === -Infinity || Number.isNaN(total)) throw new ImpossibleObservationError();
  return Object.fromEntries(settings.map((s) => [s, Math.exp(logWeights[s]! - total)]));
}

export function concentration(probs: number[]): number {
  const k = probs.length;
  if (k <= 1) return 1;
  let h = 0;
  for (const p of probs) if (p > 0) h -= p * Math.log(p);
  return Math.max(0, 1 - h / Math.log(k));
}

export function estimate<M extends MachineDataBase>(
  model: SettingModel<M>,
  machine: M,
  obs: Observation,
  prior: PriorSpec,
  opts: LikelihoodOptions,
): Estimate {
  const settings = machine.settings;
  const logLikelihood = Object.fromEntries(settings.map((s) => [s, model.logLikelihood(machine, obs, s, opts)]));
  const withPrior = Object.fromEntries(
    settings.map((s) => {
      const w = prior.weights[s] ?? 0;
      return [s, w > 0 ? Math.log(w) + logLikelihood[s]! : -Infinity];
    }),
  );
  const posterior = normalizeLog(settings, withPrior);
  const uniformPosterior = normalizeLog(settings, logLikelihood);
  const groupsOf = (post: Record<string, number>) =>
    machine.settingGroups.map((g) => ({ label: g.label, p: g.settings.reduce((a, s) => a + (post[s] ?? 0), 0) }));
  return {
    posterior,
    uniformPosterior,
    groups: groupsOf(posterior),
    uniformGroups: groupsOf(uniformPosterior),
    payoutMean: settings.reduce((a, s) => a + posterior[s]! * machine.payout.values[s]!, 0),
    concentration: concentration(settings.map((s) => posterior[s]!)),
    evidence: model.usedEvidence(machine, obs, opts),
    logLikelihood,
  };
}
