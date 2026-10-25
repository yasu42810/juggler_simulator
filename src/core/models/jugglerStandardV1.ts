// juggler-standard-v1: BIG・REG・ぶどうで設定を推定するモデル（内部設計 §4）。
// REG 内訳（regSolo / regCherry）はデータとしては受け付けるが、計算への反映は Phase 2。

import { buildSeries, tailProbabilities, type SeriesSpec } from "../distribution";
import {
  checkSourceIds, fail, isObject, parseMachineBase, reqDataType, reqString, reqStringArray, rejectUnknownKeys,
} from "../machineBase";
import { logBinomPmf, logHypergeomPmf, logSumExp } from "../math";
import { numericIssues } from "../observation";
import { toProbability, type ProbValue } from "../probability";
import type {
  ChartData, CompareRow, DataType, FieldDef, Issue, LikelihoodOptions, MachineDataBase, Observation, SettingModel,
} from "../types";

export interface ProbTable {
  values: Record<string, ProbValue>;
  dataType: DataType;
  measurement: string;
  sourceIds: string[];
  basis?: string;
}

export interface JugglerStandardV1Data extends MachineDataBase {
  model: "juggler-standard-v1";
  probabilities: {
    big: ProbTable;
    reg: ProbTable;
    regSolo?: ProbTable;
    regCherry?: ProbTable;
    grape?: ProbTable;
  };
  published?: { combinedOneIn?: Record<string, number> };
}

const PROB_KEYS = ["big", "reg", "regSolo", "regCherry", "grape"] as const;

function parseProbValue(v: unknown, ctx: string): ProbValue {
  if (!isObject(v)) fail("D-01", `${ctx} は {oneIn} か {num, den} です`);
  if ("oneIn" in v) {
    rejectUnknownKeys(v, ["oneIn"], ctx);
    if (typeof v.oneIn !== "number" || !(v.oneIn > 1)) fail("D-02", `${ctx}.oneIn は 1 より大きい数です`);
    return { oneIn: v.oneIn };
  }
  rejectUnknownKeys(v, ["num", "den"], ctx);
  if (typeof v.num !== "number" || typeof v.den !== "number" || !(v.num > 0 && v.num < v.den)) {
    fail("D-02", `${ctx} は 0 < num < den です`);
  }
  return { num: v.num, den: v.den };
}

function parseProbTable(v: unknown, settings: string[], sourceIds: Set<string>, ctx: string): ProbTable {
  if (!isObject(v)) fail("D-01", `${ctx} が必要です`);
  rejectUnknownKeys(v, ["values", "dataType", "measurement", "sourceIds", "basis"], ctx);
  const valuesRaw = v.values;
  if (!isObject(valuesRaw)) fail("D-01", `${ctx}.values が必要です`);
  rejectUnknownKeys(valuesRaw, settings, `${ctx}.values`);
  const values: Record<string, ProbValue> = {};
  for (const s of settings) {
    if (valuesRaw[s] === undefined) fail("D-06", `${ctx}.values に設定${s}の値がありません`);
    values[s] = parseProbValue(valuesRaw[s], `${ctx}.values.${s}`);
  }
  const ids = reqStringArray(v, "sourceIds", ctx);
  checkSourceIds(ids, sourceIds, ctx);
  return {
    values,
    dataType: reqDataType(v, "dataType", ctx),
    measurement: reqString(v, "measurement", ctx),
    sourceIds: ids,
    basis: typeof v.basis === "string" ? v.basis : undefined,
  };
}

function parseMachine(json: unknown): JugglerStandardV1Data {
  const base = parseMachineBase(json, ["probabilities", "published"]);
  if (base.model !== "juggler-standard-v1") fail("D-01", `model "${base.model}" はこのモデルでは読めません`);
  const raw = json as Record<string, unknown>;
  const probsRaw = raw.probabilities;
  if (!isObject(probsRaw)) fail("D-01", "probabilities が必要です");
  rejectUnknownKeys(probsRaw, PROB_KEYS, "probabilities");
  const sourceIds = new Set(base.sources.map((s) => s.id));
  const probabilities: JugglerStandardV1Data["probabilities"] = {
    big: parseProbTable(probsRaw.big, base.settings, sourceIds, "probabilities.big"),
    reg: parseProbTable(probsRaw.reg, base.settings, sourceIds, "probabilities.reg"),
  };
  for (const k of ["regSolo", "regCherry", "grape"] as const) {
    if (probsRaw[k] !== undefined) probabilities[k] = parseProbTable(probsRaw[k], base.settings, sourceIds, `probabilities.${k}`);
  }

  // D-02: 同じゲームで排他なイベントの確率の和 < 1
  for (const s of base.settings) {
    const sum = p(probabilities.big, s) + p(probabilities.reg, s) + (probabilities.grape ? p(probabilities.grape, s) : 0);
    if (!(sum < 1)) fail("D-02", `設定${s}: BIG+REG+ぶどうの確率の和が 1 以上です`);
  }
  // D-03: REG 内訳は両方あるか両方ない。和と REG の相対誤差 0.5% 以内
  if ((probabilities.regSolo === undefined) !== (probabilities.regCherry === undefined)) {
    fail("D-03", "regSolo と regCherry は両方そろえてください");
  }
  if (probabilities.regSolo && probabilities.regCherry) {
    for (const s of base.settings) {
      const sum = p(probabilities.regSolo, s) + p(probabilities.regCherry, s);
      const reg = p(probabilities.reg, s);
      if (Math.abs(sum / reg - 1) > 0.005) fail("D-03", `設定${s}: REG 内訳の和が REG 確率と 0.5% 以上ずれています`);
    }
  }
  // D-04: 公表されている合算と、BIG+REG から計算した合算の照合（相対誤差 0.1% 以内）
  let published: JugglerStandardV1Data["published"];
  if (raw.published !== undefined) {
    if (!isObject(raw.published)) fail("D-01", "published が不正です");
    rejectUnknownKeys(raw.published, ["combinedOneIn"], "published");
    const comb = raw.published.combinedOneIn;
    if (comb !== undefined) {
      if (!isObject(comb)) fail("D-01", "published.combinedOneIn が不正です");
      const combined: Record<string, number> = {};
      for (const s of base.settings) {
        const given = comb[s];
        if (typeof given !== "number") fail("D-06", `published.combinedOneIn に設定${s}の値がありません`);
        const calc = 1 / (p(probabilities.big, s) + p(probabilities.reg, s));
        if (Math.abs(calc / given - 1) > 0.001) fail("D-04", `設定${s}: 合算の公表値 1/${given} と計算値 1/${calc.toFixed(1)} が合いません`);
        combined[s] = given;
      }
      published = { combinedOneIn: combined };
    }
  }
  return { ...base, model: "juggler-standard-v1", probabilities, published };
}

function p(t: ProbTable, s: string): number {
  return toProbability(t.values[s]!);
}

interface Probs {
  big: number;
  reg: number;
  grape: number | null;
}

function probsFor(m: JugglerStandardV1Data, s: string): Probs {
  return {
    big: p(m.probabilities.big, s),
    reg: p(m.probabilities.reg, s),
    grape: m.probabilities.grape ? p(m.probabilities.grape, s) : null,
  };
}

/** ぶどうを計算に使うか */
function grapeUsed(m: JugglerStandardV1Data, obs: Observation, opts: LikelihoodOptions): boolean {
  return (
    m.probabilities.grape !== undefined &&
    opts.enabled.grape !== false &&
    obs.session !== null &&
    obs.session.counts.grape !== null &&
    obs.session.counts.grape !== undefined
  );
}

function sessionBonus(obs: Observation): { bw: number; rw: number } | null {
  const d = obs.session?.totalDelta;
  if (!d) return null;
  return { bw: d.big ?? 0, rw: d.reg ?? 0 };
}

/** 台データ（総回転数・BIG・REG）の対数尤度（§4.2） */
function logLikTotal(pr: Probs, N: number, b: number, r: number): number {
  const rest = N - b - r;
  if (rest < 0) return -Infinity;
  return (b === 0 ? 0 : b * Math.log(pr.big)) + (r === 0 ? 0 : r * Math.log(pr.reg)) + (rest === 0 ? 0 : rest * Math.log1p(-pr.big - pr.reg));
}

/**
 * 遊技区間のぶどう回数の対数確率（§4.3）。
 * 区間のボーナス回数が分かれば二項分布、分からなければ超幾何分布で周辺化する。
 */
function grapeLogPmfFactory(pr: Probs, obs: Observation): (g: number) => number {
  const q = pr.grape! / (1 - pr.big - pr.reg);
  const N = obs.total.games;
  const T = (obs.total.counts.big ?? 0) + (obs.total.counts.reg ?? 0);
  const n = obs.session!.games;
  const known = sessionBonus(obs);
  if (known) {
    const m = n - known.bw - known.rw;
    return (g) => logBinomPmf(g, m, q);
  }
  const kMin = Math.max(0, n - (N - T));
  const kMax = Math.min(n, T);
  const logHyp: number[] = [];
  for (let k = kMin; k <= kMax; k++) logHyp.push(logHypergeomPmf(k, N, T, n));
  return (g) => {
    const terms: number[] = [];
    for (let k = kMin; k <= Math.min(kMax, n - g); k++) {
      terms.push(logHyp[k - kMin]! + logBinomPmf(g, n - k, q));
    }
    return logSumExp(terms);
  };
}

function grapeMeanSd(pr: Probs, obs: Observation): { mean: number; sd: number; maxK: number } {
  const q = pr.grape! / (1 - pr.big - pr.reg);
  const N = obs.total.games;
  const T = (obs.total.counts.big ?? 0) + (obs.total.counts.reg ?? 0);
  const n = obs.session!.games;
  const known = sessionBonus(obs);
  const m = known ? n - known.bw - known.rw : n - (N > 0 ? (n * T) / N : 0);
  const mean = m * q;
  return { mean, sd: Math.sqrt(Math.max(mean * (1 - q), 0)), maxK: known ? n - known.bw - known.rw : n };
}

function binomSpec(setting: string, m: number, prob: number): SeriesSpec {
  const mean = m * prob;
  return { setting, mean, sd: Math.sqrt(mean * (1 - prob)), logPmf: (k) => logBinomPmf(k, m, prob) };
}

const GRAPE_NOTE = "3枚掛けで、区間で揃ったぶどうをすべて数えます。区間の回転数はデータカウンタの総回転数の差です。";

export const jugglerStandardV1: SettingModel<JugglerStandardV1Data> = {
  id: "juggler-standard-v1",
  version: "1.0.0",
  capabilities: { playMode: true, sessionBonusKnown: true },

  parseMachine,

  fields(m) {
    const fields: FieldDef[] = [
      { key: "big", label: "BIG", kind: "count", scope: "total", counterButton: true, optional: false },
      { key: "reg", label: "REG", kind: "count", scope: "total", counterButton: true, optional: false },
    ];
    if (m.probabilities.grape) {
      fields.push({
        key: "grape", label: "ぶどう", kind: "count", scope: "session", counterButton: true, optional: true,
        measurementNote: GRAPE_NOTE,
      });
    }
    return fields;
  },

  toggles(m) {
    return m.probabilities.grape ? [{ key: "grape", label: "ぶどうを計算に使う" }] : [];
  },

  validate(m, obs, opts) {
    const numeric = numericIssues(obs);
    if (numeric.length > 0) return numeric;
    const issues: Issue[] = [];
    const N = obs.total.games;
    const b = obs.total.counts.big ?? 0;
    const r = obs.total.counts.reg ?? 0;
    if (b + r > N) issues.push({ id: "V-02", level: "error", field: "big", message: "BIGとREGの合計が総回転数を超えています" });
    const s = obs.session;
    if (s) {
      if (s.games > N) issues.push({ id: "V-03", level: "error", field: "sessionGames", message: "遊技区間が総回転数を超えています" });
      const known = sessionBonus(obs);
      const g = s.counts.grape;
      if (known) {
        if (known.bw < 0 || known.rw < 0) {
          issues.push({ id: "V-11", level: "error", field: "big", message: "打ち始めの回数より少なくなっています" });
        } else if (known.bw + known.rw > s.games) {
          issues.push({ id: "V-12", level: "error", field: "big", message: "区間の回転数に対してボーナス回数が多すぎます" });
        } else if (g !== null && g !== undefined && g > s.games - known.bw - known.rw) {
          issues.push({ id: "V-12", level: "error", field: "grape", message: "区間の回転数に対して回数が多すぎます" });
        }
      }
      if (g !== null && g !== undefined && (g > s.games || g > N - b - r)) {
        issues.push({ id: "V-04", level: "error", field: "grape", message: "ぶどう回数が多すぎます（ボーナス以外のゲーム数を超えています）" });
      }
    }
    if (issues.some((i) => i.level === "error")) return issues;

    if (N > 12000) issues.push({ id: "V-06", level: "warning", field: "games", message: "1日の回転数としては多すぎます。前日分を足していませんか？" });
    if (N > 0 && N < 1000) issues.push({ id: "V-08", level: "warning", message: "まだ判断材料が少ないです。結果は大きくぶれます" });

    if (grapeUsed(m, obs, opts) && s && s.games > 0) {
      const g = s.counts.grape!;
      const unlikely = m.settings.every((setting) => {
        const pr = probsFor(m, setting);
        const ms = grapeMeanSd(pr, obs);
        const t = tailProbabilities({ setting, mean: ms.mean, sd: ms.sd, logPmf: grapeLogPmfFactory(pr, obs) }, ms.maxK, g);
        return t.lower < 0.001 || t.upper < 0.001;
      });
      if (unlikely) {
        issues.push({ id: "V-07", level: "warning", field: "grape", message: "ぶどう回数が、どの設定で考えても起こりにくい値です。数え間違い、数え方の違い、または機種データとの不一致の可能性があります" });
      }
    }
    return issues;
  },

  logLikelihood(m, obs, setting, opts) {
    const pr = probsFor(m, setting);
    const N = obs.total.games;
    const b = obs.total.counts.big ?? 0;
    const r = obs.total.counts.reg ?? 0;
    let ll = logLikTotal(pr, N, b, r);
    if (grapeUsed(m, obs, opts) && obs.session) {
      ll += grapeLogPmfFactory(pr, obs)(obs.session.counts.grape!);
    }
    return ll;
  },

  charts(m, obs, opts) {
    const N = obs.total.games;
    if (N <= 0) return [];
    const b = obs.total.counts.big ?? 0;
    const r = obs.total.counts.reg ?? 0;
    const make = (id: string, label: string, observed: number, probOf: (pr: Probs) => number, note?: string): ChartData => {
      const { series, discrete } = buildSeries(m.settings.map((s) => binomSpec(s, N, probOf(probsFor(m, s)))), N, observed);
      return { id, label, note, games: N, series, observed, discrete };
    };
    const charts = [
      make("big", "BIG", b, (pr) => pr.big),
      make("reg", "REG", r, (pr) => pr.reg),
      make("combined", "合算", b + r, (pr) => pr.big + pr.reg),
    ];
    if (grapeUsed(m, obs, opts) && obs.session && obs.session.games > 0) {
      const g = obs.session.counts.grape!;
      const specs = m.settings.map((setting) => {
        const pr = probsFor(m, setting);
        const ms = grapeMeanSd(pr, obs);
        return { spec: { setting, mean: ms.mean, sd: ms.sd, logPmf: grapeLogPmfFactory(pr, obs) }, maxK: ms.maxK };
      });
      const maxK = Math.max(...specs.map((x) => x.maxK));
      const { series, discrete } = buildSeries(specs.map((x) => x.spec), maxK, g);
      charts.push({
        id: "grape", label: "ぶどう", games: obs.session.games, series, observed: g, discrete,
        note: "台の BIG・REG 回数を踏まえたときの、遊技区間のぶどう回数の分布です",
      });
    }
    return charts;
  },

  compareRows(m, obs) {
    const N = obs.total.games;
    const b = obs.total.counts.big ?? 0;
    const r = obs.total.counts.reg ?? 0;
    const by = (f: (pr: Probs) => number) => Object.fromEntries(m.settings.map((s) => [s, 1 / f(probsFor(m, s))]));
    const rows: CompareRow[] = [
      { key: "big", label: "BIG", observedOneIn: b > 0 ? N / b : null, bySetting: by((pr) => pr.big), dataType: m.probabilities.big.dataType },
      { key: "reg", label: "REG", observedOneIn: r > 0 ? N / r : null, bySetting: by((pr) => pr.reg), dataType: m.probabilities.reg.dataType },
      {
        key: "combined", label: "合算", observedOneIn: b + r > 0 ? N / (b + r) : null,
        // 公表されている合算があればそれを表示する（BIG・REG の丸めた値から計算すると末尾がずれるため）
        bySetting: m.published?.combinedOneIn ? { ...m.published.combinedOneIn } : by((pr) => pr.big + pr.reg),
        dataType: m.probabilities.big.dataType,
      },
    ];
    if (m.probabilities.grape) {
      const s = obs.session;
      const g = s?.counts.grape;
      rows.push({
        key: "grape", label: "ぶどう",
        observedOneIn: s && g ? s.games / g : null,
        bySetting: by((pr) => pr.grape!),
        dataType: m.probabilities.grape.dataType,
      });
    }
    return rows;
  },

  usedEvidence(m, obs, opts) {
    return grapeUsed(m, obs, opts) ? ["BIG", "REG", "ぶどう"] : ["BIG", "REG"];
  },
};
