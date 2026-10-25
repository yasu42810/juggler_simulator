// 事前分布の部品（内部設計 §4.10）。Phase 2 で手入力、Phase 4 で店ごとの推定を足す。

import type { MachineDataBase } from "../types";

export interface PriorSpec {
  id: string;
  label: string;
  version: string;
  /** 設定 → 重み（合計1に正規化済み） */
  weights: Record<string, number>;
}

export interface PriorProvider {
  id: string;
  label: string;
  description?: string;
  weights(machine: MachineDataBase): Record<string, number>;
}
