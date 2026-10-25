// モデル共通の型。画面・保存・事前分布はここに書かれた型だけを見る（内部設計 §4.7, §5.2）。

export type DataType = "published" | "analysis" | "measured";

export interface Source {
  id: string;
  title: string;
  url: string;
  accessed: string;
}

export interface SettingGroup {
  label: string;
  settings: string[];
}

export interface PriorPreset {
  id: string;
  label: string;
  description?: string;
  weights: Record<string, number>;
}

/** 全モデル共通の機種データ */
export interface MachineDataBase {
  schemaVersion: 1;
  model: string;
  id: string;
  name: string;
  maker: string;
  releaseDate?: string;
  aliases?: string[];
  dataVersion: string;
  status: "active" | "draft";
  settings: string[];
  settingGroups: SettingGroup[];
  payout: {
    values: Record<string, number>;
    condition: string;
    dataType: DataType;
    sourceIds: string[];
  };
  priorPresets?: PriorPreset[];
  sources: Source[];
}

export type IssueLevel = "error" | "warning" | "notice";

export interface Issue {
  id: string; // V-01 など
  level: IssueLevel;
  message: string;
  field?: string;
}

/** 検証済みの入力（observation.ts だけが作る） */
export interface Observation {
  total: { games: number; counts: Record<string, number> };
  session: null | {
    games: number;
    counts: Record<string, number | null>; // null = 未計測
    totalDelta: Record<string, number> | null; // 区間の total 項目の回数（分からなければ null）
  };
}

export interface FieldDef {
  key: string;
  label: string;
  kind: "count";
  /** total: カウンタで見える回数（実戦モードでは台全体の増分 = 区間の回数）/ session: 区間だけで数える回数 */
  scope: "total" | "session";
  counterButton: boolean;
  optional: boolean;
  max?: number;
  measurementNote?: string;
}

export interface ModelCapabilities {
  playMode: boolean;
  sessionBonusKnown: boolean;
}

export interface ChartSeries {
  setting: string;
  points: { k: number; p: number }[];
}

export interface ChartData {
  id: string;
  label: string;
  note?: string;
  /** 横軸の回数のもとになるゲーム数（1/○○ 換算用） */
  games: number;
  series: ChartSeries[];
  observed: number | null;
  /** 期待回数が小さく、線より棒で描くべきとき */
  discrete: boolean;
}

export interface CompareRow {
  key: string;
  label: string;
  observedOneIn: number | null;
  bySetting: Record<string, number>; // 設定 → 1/x の x
  dataType: DataType;
}

export interface Toggle {
  key: string;
  label: string;
}

export interface LikelihoodOptions {
  enabled: Record<string, boolean>;
}

export interface SettingModel<M extends MachineDataBase = MachineDataBase> {
  id: string;
  version: string;
  capabilities: ModelCapabilities;
  /** 機種データの検証。不正なら例外 */
  parseMachine(json: unknown): M;
  fields(machine: M): FieldDef[];
  toggles(machine: M): Toggle[];
  /** モデル固有の入力チェック（矛盾・警告） */
  validate(machine: M, obs: Observation, opts: LikelihoodOptions): Issue[];
  logLikelihood(machine: M, obs: Observation, setting: string, opts: LikelihoodOptions): number;
  charts(machine: M, obs: Observation, opts: LikelihoodOptions): ChartData[];
  compareRows(machine: M, obs: Observation): CompareRow[];
  /** 前提表示用: 計算に使った判別要素の名前 */
  usedEvidence(machine: M, obs: Observation, opts: LikelihoodOptions): string[];
}
