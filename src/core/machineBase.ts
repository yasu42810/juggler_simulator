// 全モデル共通部分の機種データ検証（内部設計 §5.4 の D-01, D-05, D-06 の共通部分）。

import type { DataType, MachineDataBase, PriorPreset, SettingGroup, Source } from "./types";

export class MachineDataError extends Error {}

export function fail(id: string, message: string): never {
  throw new MachineDataError(`[${id}] ${message}`);
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function reqString(o: Record<string, unknown>, key: string, ctx: string): string {
  const v = o[key];
  if (typeof v !== "string" || v.length === 0) fail("D-01", `${ctx}.${key} は空でない文字列が必要です`);
  return v;
}

export function reqStringArray(o: Record<string, unknown>, key: string, ctx: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) fail("D-01", `${ctx}.${key} は文字列の配列が必要です`);
  return v as string[];
}

const DATA_TYPES: DataType[] = ["published", "analysis", "measured"];

export function reqDataType(o: Record<string, unknown>, key: string, ctx: string): DataType {
  const v = o[key];
  if (!DATA_TYPES.includes(v as DataType)) fail("D-01", `${ctx}.${key} は ${DATA_TYPES.join("/")} のどれかです`);
  return v as DataType;
}

/** 許可したキー以外があれば拒否（D-07） */
export function rejectUnknownKeys(o: Record<string, unknown>, allowed: readonly string[], ctx: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) fail("D-07", `${ctx} に未知の項目 "${k}" があります`);
  }
}

/** 設定ごとの数値の表。すべての設定がそろっていること（D-06） */
export function reqSettingNumbers(v: unknown, settings: string[], ctx: string): Record<string, number> {
  if (!isObject(v)) fail("D-01", `${ctx} は設定ごとの表が必要です`);
  rejectUnknownKeys(v, settings, ctx);
  const out: Record<string, number> = {};
  for (const s of settings) {
    const x = v[s];
    if (typeof x !== "number" || !Number.isFinite(x)) fail("D-06", `${ctx} に設定${s}の値がありません`);
    out[s] = x;
  }
  return out;
}

export const BASE_KEYS = [
  "schemaVersion", "model", "id", "name", "maker", "releaseDate", "aliases", "dataVersion",
  "status", "settings", "settingGroups", "payout", "priorPresets", "sources",
] as const;

export function parseMachineBase(json: unknown, extraKeys: readonly string[]): MachineDataBase {
  if (!isObject(json)) fail("D-01", "機種データがオブジェクトではありません");
  rejectUnknownKeys(json, [...BASE_KEYS, ...extraKeys], "machine");
  if (json.schemaVersion !== 1) fail("D-01", "schemaVersion は 1 です");
  const id = reqString(json, "id", "machine");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail("D-01", `id "${id}" は kebab-case にしてください`);
  const status = json.status;
  if (status !== "active" && status !== "draft") fail("D-01", "status は active か draft です");
  const settings = reqStringArray(json, "settings", "machine");
  if (settings.length < 2 || new Set(settings).size !== settings.length) fail("D-01", "settings は重複のない2つ以上の設定です");

  if (!Array.isArray(json.settingGroups)) fail("D-01", "settingGroups が必要です");
  const settingGroups: SettingGroup[] = json.settingGroups.map((g, i) => {
    if (!isObject(g)) fail("D-01", `settingGroups[${i}] が不正です`);
    const label = reqString(g, "label", `settingGroups[${i}]`);
    const ss = reqStringArray(g, "settings", `settingGroups[${i}]`);
    if (ss.some((s) => !settings.includes(s))) fail("D-06", `settingGroups[${i}] に存在しない設定があります`);
    return { label, settings: ss };
  });

  if (!Array.isArray(json.sources)) fail("D-01", "sources が必要です");
  const sources: Source[] = json.sources.map((s, i) => {
    if (!isObject(s)) fail("D-01", `sources[${i}] が不正です`);
    return {
      id: reqString(s, "id", `sources[${i}]`),
      title: reqString(s, "title", `sources[${i}]`),
      url: reqString(s, "url", `sources[${i}]`),
      accessed: reqString(s, "accessed", `sources[${i}]`),
    };
  });
  const sourceIds = new Set(sources.map((s) => s.id));

  const payoutRaw = json.payout;
  if (!isObject(payoutRaw)) fail("D-01", "payout が必要です");
  const payoutSourceIds = reqStringArray(payoutRaw, "sourceIds", "payout");
  checkSourceIds(payoutSourceIds, sourceIds, "payout");
  const payout = {
    values: reqSettingNumbers(payoutRaw.values, settings, "payout.values"),
    condition: reqString(payoutRaw, "condition", "payout"),
    dataType: reqDataType(payoutRaw, "dataType", "payout"),
    sourceIds: payoutSourceIds,
  };

  let priorPresets: PriorPreset[] | undefined;
  if (json.priorPresets !== undefined) {
    if (!Array.isArray(json.priorPresets)) fail("D-01", "priorPresets は配列です");
    priorPresets = json.priorPresets.map((p, i) => {
      if (!isObject(p)) fail("D-01", `priorPresets[${i}] が不正です`);
      return {
        id: reqString(p, "id", `priorPresets[${i}]`),
        label: reqString(p, "label", `priorPresets[${i}]`),
        weights: reqSettingNumbers(p.weights, settings, `priorPresets[${i}].weights`),
      };
    });
  }

  return {
    schemaVersion: 1,
    model: reqString(json, "model", "machine"),
    id,
    name: reqString(json, "name", "machine"),
    maker: reqString(json, "maker", "machine"),
    releaseDate: typeof json.releaseDate === "string" ? json.releaseDate : undefined,
    aliases: json.aliases === undefined ? undefined : reqStringArray(json, "aliases", "machine"),
    dataVersion: reqString(json, "dataVersion", "machine"),
    status,
    settings,
    settingGroups,
    payout,
    priorPresets,
    sources,
  };
}

export function checkSourceIds(ids: string[], known: Set<string>, ctx: string): void {
  for (const id of ids) {
    if (!known.has(id)) fail("D-05", `${ctx} の出典 "${id}" が sources にありません`);
  }
}
