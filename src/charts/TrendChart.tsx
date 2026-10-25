// 推移グラフ（外部設計 §11.4）: スナップショットごとの事後確率の積み上げ（または折れ線）と、集中度。

import { useEffect, useRef } from "preact/hooks";
import { Swatch } from "../ui/common";
import { pct } from "../ui/format";
import { Chart, chrome, DASHES, settingColor, withAlpha } from "./chartTheme";

export interface TrendPoint {
  games: number;
  posterior: Record<string, number>;
  concentration: number;
}

interface Props {
  points: TrendPoint[];
  settings: string[];
  style: "stack" | "line";
  theme: string;
}

export function TrendChart({ points, settings, style, theme }: Props) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const concRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!mainRef.current || !concRef.current) return;
    const c = chrome();
    const stacked = style === "stack";
    const xs = points.map((p) => p.games);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs, xMin + 1);
    const xScale = {
      type: "linear" as const,
      min: xMin,
      max: xMax,
      grid: { color: c.grid },
      border: { color: c.axis },
      ticks: { color: c.muted, maxRotation: 0, autoSkipPadding: 12, callback: (v: string | number) => `${Number(v).toLocaleString("ja-JP")}` },
    };

    const main = new Chart(mainRef.current, {
      type: "line",
      data: {
        datasets: settings.map((s, i) => {
          const color = settingColor(i);
          return {
            label: `設定${s}`,
            data: points.map((p) => ({ x: p.games, y: (p.posterior[s] ?? 0) * 100 })),
            borderColor: stacked ? c.surface : color,
            borderWidth: 2,
            borderDash: stacked ? [] : DASHES[i],
            backgroundColor: stacked ? withAlpha(color, 0.85) : color,
            fill: stacked ? (i === 0 ? "origin" : "-1") : false,
            pointRadius: stacked ? 0 : 3,
            pointHoverRadius: 4,
            tension: 0,
          };
        }),
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { ...xScale, title: { display: true, text: "総回転数（G）", color: c.muted } },
          y: {
            stacked,
            min: 0,
            max: 100,
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, stepSize: 25, callback: (v) => `${v}%` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
            callbacks: {
              title: (items) => `${Number(items[0]?.parsed.x).toLocaleString("ja-JP")}G`,
              label: (item) => ` ${item.dataset.label}: ${pct(((points[item.dataIndex]?.posterior[settings[item.datasetIndex]!]) ?? 0))}`,
            },
          },
        },
      },
    });

    const conc = new Chart(concRef.current, {
      type: "line",
      data: {
        datasets: [{
          label: "集中度",
          data: points.map((p) => ({ x: p.games, y: p.concentration * 100 })),
          borderColor: c.ink2,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: c.ink2,
          tension: 0,
        }],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: xScale,
          y: { min: 0, max: 100, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.muted, stepSize: 50, callback: (v) => `${v}%` } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => `${Number(items[0]?.parsed.x).toLocaleString("ja-JP")}G`, label: (item) => ` 集中度 ${Math.round(item.parsed.y as number)}%` } },
        },
      },
    });
    return () => {
      main.destroy();
      conc.destroy();
    };
  }, [points, settings, style, theme]);

  return (
    <div>
      <div class="chart-box" role="img" aria-label="事後確率の推移">
        <canvas ref={mainRef} />
      </div>
      <div class="legend static" aria-label="凡例">
        {settings.map((s, i) => (
          <span key={s} class="legend-item"><Swatch index={i} line={style === "line"} />設{s}</span>
        ))}
      </div>
      <p class="chart-caption">集中度（推定がどれだけ1つの設定に集まっているか）</p>
      <div class="chart-box small" role="img" aria-label="集中度の推移">
        <canvas ref={concRef} />
      </div>
    </div>
  );
}
