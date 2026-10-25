import { useState } from "preact/hooks";
import { DistributionChart } from "../charts/DistributionChart";
import type { Estimate } from "../core/posterior";
import type { ChartData, CompareRow, MachineDataBase } from "../core/types";
import { Swatch, themeKey } from "./common";
import { DATA_TYPE_LABEL, oneIn, pct } from "./format";

interface SummaryProps {
  machine: MachineDataBase;
  est: Estimate;
  priorLabel: string;
  priorIsUniform: boolean;
  stale?: boolean;
  compact?: boolean;
}

/** 事後確率の横棒・設定グループ・機械割・前提（SC-03） */
export function PosteriorSummary({ machine, est, priorLabel, priorIsUniform, stale, compact }: SummaryProps) {
  const max = Math.max(...machine.settings.map((s) => est.posterior[s]!));
  return (
    <div class={`summary ${stale ? "stale" : ""}`}>
      <ul class="bars" aria-label="設定ごとの推定確率">
        {machine.settings.map((s, i) => {
          const p = est.posterior[s]!;
          return (
            <li key={s} class="bar-row">
              <span class="bar-label"><Swatch index={i} />設定{s}</span>
              <span class="bar-track">
                <span class="bar-fill" style={{ width: `${max > 0 ? (p / max) * 100 : 0}%`, background: `var(--set-${i + 1})` }} />
              </span>
              <span class="bar-value">{pct(p)}</span>
            </li>
          );
        })}
      </ul>
      <div class="groups">
        {est.groups.map((g) => (
          <div class="group" key={g.label}>
            <span class="group-label">{g.label}</span>
            <span class="group-value">{pct(g.p)}</span>
          </div>
        ))}
      </div>
      {!compact && (
        <dl class="facts">
          <div>
            <dt>機械割（加重平均）</dt>
            <dd>{est.payoutMean.toFixed(1)}% <span class="muted">参考</span></dd>
          </div>
          <div>
            <dt>集中度</dt>
            <dd>{Math.round(est.concentration * 100)}%</dd>
          </div>
        </dl>
      )}
      <p class="premise">
        前提: 事前分布＝{priorLabel} ／ 使った情報: {est.evidence.join("・")} ／ データ版 {machine.dataVersion}
      </p>
      {!priorIsUniform && (
        <p class="compare-uniform">
          比較: 事前分布が均等なら {est.uniformGroups.map((g) => `${g.label} ${pct(g.p)}`).join("・")}
        </p>
      )}
      {!compact && (
        <p class="note">
          機械割の加重平均は、公表されている機械割を推定した確率で重み付けした参考値です。この先の収支を示すものではありません。
        </p>
      )}
    </div>
  );
}

/** 分布グラフ（SC-04） */
export function DistributionPanel({ charts, settings }: { charts: ChartData[]; settings: string[] }) {
  const [tab, setTab] = useState("big");
  const [highlight, setHighlight] = useState<string | null>(null);
  if (charts.length === 0) return <p class="muted">回転数を入れると表示されます</p>;
  const current = charts.find((c) => c.id === tab) ?? charts[0]!;
  return (
    <div>
      <div class="tabs" role="tablist">
        {charts.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === current.id} class={c.id === current.id ? "tab active" : "tab"} onClick={() => setTab(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <DistributionChart data={current} settings={settings} highlight={highlight} theme={themeKey.value} />
      <div class="legend" aria-label="凡例（タップでその設定を強調）">
        <button class={highlight === null ? "chip active" : "chip"} onClick={() => setHighlight(null)}>全設定</button>
        {settings.map((s, i) => (
          <button key={s} class={highlight === s ? "chip active" : "chip"} onClick={() => setHighlight(highlight === s ? null : s)}>
            <Swatch index={i} line />設{s}
          </button>
        ))}
      </div>
      <p class="note">
        この図は、各設定だと仮定したときの「出方のばらつき」です。設定の確率ではありません。縦線（実測）がどの設定の山に近いかの目安として見てください。
        {current.note && <><br />{current.note}</>}
      </p>
    </div>
  );
}

/** 比較表（SC-05） */
export function CompareTable({ rows, settings }: { rows: CompareRow[]; settings: string[] }) {
  return (
    <div class="table-scroll">
      <table class="compare">
        <thead>
          <tr>
            <th scope="col"></th>
            <th scope="col">実測</th>
            {settings.map((s, i) => (
              <th scope="col" key={s}><Swatch index={i} />設{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">
                {r.label}
                {r.dataType !== "published" && <span class="badge">{DATA_TYPE_LABEL[r.dataType]}</span>}
              </th>
              <td class="observed">{oneIn(r.observedOneIn)}</td>
              {settings.map((s) => <td key={s}>{oneIn(r.bySetting[s] ?? null)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
