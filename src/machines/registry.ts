// data/*.json を自動で読み込み、対応するモデルで検証して登録する（内部設計 §5.1）。

import { getModel } from "../core/models";
import type { MachineDataBase, SettingModel } from "../core/types";

export interface MachineEntry {
  machine: MachineDataBase;
  model: SettingModel<MachineDataBase>;
}

export interface LoadResult {
  entries: MachineEntry[];
  errors: { file: string; message: string }[];
}

export function loadMachines(files: Record<string, unknown>, opts: { includeDraft: boolean }): LoadResult {
  const entries: MachineEntry[] = [];
  const errors: LoadResult["errors"] = [];
  const seen = new Set<string>();
  for (const [file, json] of Object.entries(files)) {
    try {
      const modelId = (json as { model?: unknown })?.model;
      const model = typeof modelId === "string" ? getModel(modelId) : undefined;
      if (!model) throw new Error(`[D-01] 未対応のモデル "${String(modelId)}"`);
      const machine = model.parseMachine(json);
      const base = file.split("/").pop()!.replace(/\.json$/, "");
      if (machine.id !== base) throw new Error(`[D-01] id "${machine.id}" がファイル名 "${base}" と一致しません`);
      if (seen.has(machine.id)) throw new Error(`[D-01] id "${machine.id}" が重複しています`);
      seen.add(machine.id);
      if (machine.status === "draft" && !opts.includeDraft) continue;
      entries.push({ machine, model });
    } catch (e) {
      errors.push({ file, message: e instanceof Error ? e.message : String(e) });
    }
  }
  entries.sort((a, b) => a.machine.name.localeCompare(b.machine.name, "ja"));
  return { entries, errors };
}

const files = import.meta.glob("./data/*.json", { eager: true, import: "default" });

export const registry: LoadResult = loadMachines(files, { includeDraft: !import.meta.env.PROD });

for (const e of registry.errors) console.error(`機種データの読み込みに失敗: ${e.file}: ${e.message}`);

export function findMachine(id: string | null | undefined): MachineEntry | undefined {
  return registry.entries.find((e) => e.machine.id === id);
}
