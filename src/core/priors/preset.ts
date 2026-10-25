import presetsJson from "./presets.json";
import type { MachineDataBase, PriorPreset } from "../types";
import type { PriorProvider, PriorSpec } from "./types";

export const DEFAULT_PRIOR_ID = "standard";
export const UNIFORM_PRIOR_ID = "uniform";
export const PRESETS_VERSION: string = presetsJson.version;
export const PRESETS_NOTE: string = presetsJson.note;

function normalize(weights: Record<string, number>, settings: string[]): Record<string, number> {
  const total = settings.reduce((a, s) => a + (weights[s] ?? 0), 0);
  if (!(total > 0)) throw new Error("事前分布の重みの合計が 0 です");
  return Object.fromEntries(settings.map((s) => [s, (weights[s] ?? 0) / total]));
}

function sharedPresets(machine: MachineDataBase): PriorPreset[] {
  const all = presetsJson.presets as PriorPreset[];
  // 共通プリセットは設定1〜6の機種向け。それ以外の機種は uniform だけを自動で作る
  const six = ["1", "2", "3", "4", "5", "6"];
  const isSix = machine.settings.length === 6 && machine.settings.every((s, i) => s === six[i]);
  if (isSix) return all;
  return [{ id: UNIFORM_PRIOR_ID, label: "均等", weights: Object.fromEntries(machine.settings.map((s) => [s, 1])) }];
}

/** 機種で使えるプリセット（機種データの priorPresets が同じ id を上書きする） */
export function presetsFor(machine: MachineDataBase): PriorProvider[] {
  const byId = new Map<string, PriorPreset>();
  for (const p of sharedPresets(machine)) byId.set(p.id, p);
  for (const p of machine.priorPresets ?? []) byId.set(p.id, p);
  return [...byId.values()].map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    weights: (m) => normalize(p.weights, m.settings),
  }));
}

export function resolvePrior(machine: MachineDataBase, id: string): PriorSpec {
  const list = presetsFor(machine);
  const provider = list.find((p) => p.id === id) ?? list.find((p) => p.id === DEFAULT_PRIOR_ID) ?? list[0]!;
  return { id: provider.id, label: provider.label, version: PRESETS_VERSION, weights: provider.weights(machine) };
}
