// その日の店のデータ（台ごとの総回転数・BIG・REG）のファイル読み込み（FR-32）。
// 形式は local-data/hall-logs/*.json と同じ: { source: {hall, machine, ...}, fetchedAt, rows: [{unit, totalGames, big, reg, ...}] }

import { numericIssues } from "../core/observation";
import type { HallUnit } from "../core/priors/hallEstimate";
import type { FieldDef, MachineDataBase, Observation, SettingModel } from "../core/types";

export interface HallDay {
  hall: string;
  machineName: string;
  /** データの日時（ISO）。ファイルの fetchedAt */
  date: string;
  units: HallUnit[];
  /** 読み込めなかった行（台番号と理由） */
  skipped: { unit: string; reason: string }[];
  warnings: string[];
}

export class HallFileError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseHallFile<M extends MachineDataBase>(json: unknown, model: SettingModel<M>, machine: M): HallDay {
  if (!isObj(json) || !Array.isArray(json.rows)) throw new HallFileError("店のデータの形式ではありません（rows がありません）");
  const source = isObj(json.source) ? json.source : {};
  const date = typeof json.fetchedAt === "string" && !Number.isNaN(Date.parse(json.fetchedAt)) ? json.fetchedAt : null;
  if (!date) throw new HallFileError("データの日時（fetchedAt）がありません");
  const totalFields: FieldDef[] = model.fields(machine).filter((f) => f.scope === "total");

  const units: HallUnit[] = [];
  const skipped: HallDay["skipped"] = [];
  const seen = new Set<string>();
  json.rows.forEach((row, i) => {
    if (!isObj(row)) return skipped.push({ unit: `${i + 1}行目`, reason: "形式が不正" });
    const unit = row.unit === undefined ? `${i + 1}行目` : String(row.unit);
    if (seen.has(unit)) return skipped.push({ unit, reason: "同じ台番号が重複" });
    const counts: Record<string, number> = {};
    for (const f of totalFields) counts[f.key] = row[f.key] as number;
    const obs: Observation = { total: { games: row.totalGames as number, counts }, session: null };
    const errors = [...numericIssues(obs), ...model.validate(machine, obs, { enabled: {} })].filter((x) => x.level === "error");
    if (errors.length > 0) return skipped.push({ unit, reason: errors[0]!.message });
    seen.add(unit);
    units.push({ unit, obs });
  });
  if (units.length === 0) throw new HallFileError("読み込める台がありませんでした");

  const warnings: string[] = [];
  const machineName = typeof source.machine === "string" ? source.machine : "";
  const names = [machine.name, ...(machine.aliases ?? [])];
  if (machineName && !names.includes(machineName)) {
    warnings.push(`ファイルの機種「${machineName}」は、選んでいる機種「${machine.name}」と違います`);
  }
  return {
    hall: typeof source.hall === "string" ? source.hall : "（店名なし）",
    machineName: machineName || machine.name,
    date,
    units,
    skipped,
    warnings,
  };
}

const isHallUnit = (v: unknown): v is HallUnit =>
  isObj(v) && typeof v.unit === "string" && isObj(v.obs) && isObj(v.obs.total) && typeof v.obs.total.games === "number";

export function isHallDay(v: unknown): v is HallDay {
  return isObj(v) && typeof v.hall === "string" && typeof v.date === "string" && Array.isArray(v.units)
    && v.units.every(isHallUnit) && Array.isArray(v.skipped) && Array.isArray(v.warnings);
}
