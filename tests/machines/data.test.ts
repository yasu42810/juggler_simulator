// 機種データテスト（D-01〜D-07）。data/*.json を足すと自動で対象になる。
import { describe, expect, it } from "vitest";
import { jugglerStandardV1 } from "../../src/core/models/jugglerStandardV1";
import { registerModel } from "../../src/core/models";
import { loadMachines, registry } from "../../src/machines/registry";
import type { MachineDataBase, SettingModel } from "../../src/core/types";
import { parseMachineBase } from "../../src/core/machineBase";
import data from "../../src/machines/data/my-juggler-v.json";

const files = import.meta.glob("../../src/machines/data/*.json", { eager: true, import: "default" });

describe("機種データ", () => {
  it("すべての機種データが読み込める", () => {
    const r = loadMachines(files, { includeDraft: true });
    expect(r.errors).toEqual([]);
    expect(r.entries.length).toBe(Object.keys(files).length);
    expect(registry.errors).toEqual([]);
  });

  const broken = (mutate: (d: any) => void) => {
    const d = structuredClone(data) as any;
    mutate(d);
    return () => jugglerStandardV1.parseMachine(d);
  };
  it("D-01: 未知のモデル・必須項目", () => {
    expect(loadMachines({ "x/my-juggler-v.json": { ...data, model: "unknown" } }, { includeDraft: true }).errors[0]!.message).toContain("D-01");
    expect(broken((d) => delete d.name)).toThrow(/D-01/);
    expect(loadMachines({ "x/other.json": data }, { includeDraft: true }).errors[0]!.message).toContain("ファイル名");
  });
  it("D-02: 確率の範囲と和", () => {
    expect(broken((d) => (d.probabilities.grape.values["1"] = { oneIn: 1.005 }))).toThrow(/D-02/);
    expect(broken((d) => (d.probabilities.big.values["1"] = { oneIn: 0.5 }))).toThrow(/D-02/);
  });
  it("D-03: REG 内訳はそろえる・和が合う", () => {
    const solo = { values: Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((s) => [s, { oneIn: 600 }])), dataType: "analysis", measurement: "-", sourceIds: ["S4"] };
    expect(broken((d) => (d.probabilities.regSolo = solo))).toThrow(/D-03/);
    expect(broken((d) => { d.probabilities.regSolo = solo; d.probabilities.regCherry = solo; })).toThrow(/D-03/);
  });
  it("D-04: 合算の公表値の照合", () => {
    expect(broken((d) => (d.published.combinedOneIn["1"] = 170))).toThrow(/D-04/);
  });
  it("D-05: 出典の参照", () => {
    expect(broken((d) => (d.probabilities.big.sourceIds = ["S99"]))).toThrow(/D-05/);
  });
  it("D-06: 設定の値がそろう", () => {
    expect(broken((d) => delete d.probabilities.reg.values["3"])).toThrow(/D-06/);
    expect(broken((d) => delete d.payout.values["6"])).toThrow(/D-06/);
  });
  it("D-07: 未知の項目は拒否", () => {
    expect(broken((d) => (d.extra = 1))).toThrow(/D-07/);
    expect(broken((d) => (d.probabilities.cherry = d.probabilities.grape))).toThrow(/D-07/);
  });
  it("draft は本番では出さない", () => {
    const r = loadMachines({ "x/my-juggler-v.json": { ...data, status: "draft" } }, { includeDraft: false });
    expect(r.entries).toEqual([]);
    expect(r.errors).toEqual([]);
  });
});

describe("ダミーモデル（A-18 の計算側）", () => {
  // 判別要素が違い、実戦モードに対応しない架空のモデル
  const dummy: SettingModel<MachineDataBase> = {
    id: "dummy-v1",
    version: "0",
    capabilities: { playMode: false, sessionBonusKnown: false },
    parseMachine: (json) => parseMachineBase(json, []),
    fields: () => [{ key: "bell", label: "ベル", kind: "count", scope: "total", counterButton: false, optional: false }],
    toggles: () => [],
    validate: () => [],
    logLikelihood: (_m, o, s) => (o.total.counts.bell ?? 0) * Math.log(Number(s) / 10),
    charts: () => [],
    compareRows: () => [],
    usedEvidence: () => ["ベル"],
  };
  it("登録すると、モデルのモジュールだけで機種として読み込める", () => {
    registerModel(dummy);
    const json = { ...structuredClone(data), model: "dummy-v1", id: "dummy-machine", name: "ダミー機" } as any;
    delete json.probabilities;
    delete json.published;
    const r = loadMachines({ "x/dummy-machine.json": json }, { includeDraft: true });
    expect(r.errors).toEqual([]);
    expect(r.entries[0]!.model.fields(r.entries[0]!.machine).map((f) => f.key)).toEqual(["bell"]);
    expect(r.entries[0]!.model.capabilities.playMode).toBe(false);
  });
});
