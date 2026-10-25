// モデルの登録（id → 実装）。新しいモデルはここに1行足す（内部設計 §4.7）。

import type { MachineDataBase, SettingModel } from "../types";
import { jugglerStandardV1 } from "./jugglerStandardV1";

const models = new Map<string, SettingModel<MachineDataBase>>();

export function registerModel<M extends MachineDataBase>(model: SettingModel<M>): void {
  models.set(model.id, model as unknown as SettingModel<MachineDataBase>);
}

export function getModel(id: string): SettingModel<MachineDataBase> | undefined {
  return models.get(id);
}

registerModel(jugglerStandardV1);
