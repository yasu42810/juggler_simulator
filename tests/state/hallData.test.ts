import { describe, expect, it } from "vitest";
import { HallFileError, isHallDay, parseHallFile } from "../../src/state/hallData";
import { machine, model } from "../helpers";

const file = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  source: { hall: "テスト店", machine: "マイジャグラーV" },
  fetchedAt: "2026-10-25T18:58:00+09:00",
  rows,
  ...extra,
});

describe("店のデータの読み込み", () => {
  it("台ごとの総回転数・BIG・REG を読み込む", () => {
    const d = parseHallFile(file([{ unit: "661", totalGames: 5646, big: 22, reg: 17, currentStart: 550 }]), model, machine);
    expect(d.hall).toBe("テスト店");
    expect(d.units).toEqual([{ unit: "661", obs: { total: { games: 5646, counts: { big: 22, reg: 17 } }, session: null } }]);
    expect(d.warnings).toEqual([]);
    expect(isHallDay(d)).toBe(true);
  });
  it("不正な行・重複した台は読み飛ばして理由を残す", () => {
    const d = parseHallFile(file([
      { unit: "1", totalGames: 5000, big: 20, reg: 15 },
      { unit: "1", totalGames: 5000, big: 20, reg: 15 },
      { unit: "2", totalGames: 10, big: 8, reg: 8 },
      { unit: "3", totalGames: "abc", big: 1, reg: 1 },
    ]), model, machine);
    expect(d.units.map((u) => u.unit)).toEqual(["1"]);
    expect(d.skipped.map((x) => x.unit)).toEqual(["1", "2", "3"]);
  });
  it("機種名が違えば警告", () => {
    const d = parseHallFile({ ...file([{ unit: "1", totalGames: 5000, big: 20, reg: 15 }]), source: { machine: "アイムジャグラーEX" } }, model, machine);
    expect(d.warnings[0]).toContain("アイムジャグラーEX");
  });
  it("形式が違うファイルや、読める台がないファイルはエラー", () => {
    expect(() => parseHallFile({ foo: 1 }, model, machine)).toThrow(HallFileError);
    expect(() => parseHallFile(file([{ unit: "1" }]), model, machine)).toThrow(HallFileError);
    expect(() => parseHallFile({ rows: [] }, model, machine)).toThrow(/日時/);
  });
});
