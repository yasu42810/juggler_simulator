// 性能（NFR-04 の計算部分）: 重い入力でも、事後確率と分布グラフの計算が十分速いこと
import { describe, expect, it } from "vitest";
import { estimate } from "../../src/core/posterior";
import { machine, model, obs, ON, standard } from "../helpers";

describe("performance", () => {
  it("N=20,000・ボーナス270回・ぶどう（区間ボーナス不明）でも 100ms 以内", () => {
    const o = obs(20000, 150, 120, { n: 20000, g: 3450 });
    estimate(model, machine, o, standard, ON); // ln(k!) の表を作る初回分を除く
    const t0 = performance.now();
    estimate(model, machine, o, standard, ON);
    model.validate(machine, o, ON);
    model.charts(machine, o, ON);
    const ms = performance.now() - t0;
    console.log(`heavy input: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(100);
  });
});
