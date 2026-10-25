// 分布グラフ（外部設計 §6.2）: 各設定で「今の回転数なら何回出るか」の確率分布と、実測値の縦線。

import { useEffect, useRef } from "preact/hooks";
import type { ChartData } from "../core/types";
import { pct } from "../ui/format";
import { Chart, chrome, DASHES, settingColor, withAlpha } from "./chartTheme";
import type { ChartConfiguration, ChartOptions, Plugin } from "chart.js";

interface Props {
  data: ChartData;
  settings: string[];
  highlight: string | null;
  theme: string;
}

export function DistributionChart({ data, settings, highlight, theme }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const c = chrome();
    const ks = data.series[0]?.points.map((p) => p.k) ?? [];
    const observed = data.observed;
    const games = data.games;
    const kToOneIn = (k: number) => (k > 0 ? `1/${(games / k).toFixed(games / k >= 100 ? 0 : 1)}` : "");

    const datasets = data.series.map((s, i) => {
      const color = settingColor(settings.indexOf(s.setting));
      const dim = highlight !== null && highlight !== s.setting;
      const stroke = dim ? withAlpha(color, 0.2) : color;
      return data.discrete
        ? {
            type: "bar" as const,
            label: `設定${s.setting}`,
            data: s.points.map((p) => p.p),
            backgroundColor: stroke,
            borderRadius: 4,
            maxBarThickness: 24,
            categoryPercentage: 0.9,
            barPercentage: 0.9,
          }
        : {
            type: "line" as const,
            label: `設定${s.setting}`,
            data: s.points.map((p) => ({ x: p.k, y: p.p })),
            borderColor: stroke,
            borderWidth: dim ? 1.5 : 2,
            borderDash: DASHES[i % DASHES.length],
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: false,
            order: dim ? 2 : 1,
          };
    });

    // 実測値の縦線と、山頂付近の設定ラベル（実測ラベルや他のラベルとぶつかるものは描かない）
    const overlay: Plugin = {
      id: "overlay",
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const xScale = chart.scales.x!;
        ctx.save();
        ctx.font = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";
        type Box = { x0: number; x1: number; y0: number; y1: number };
        const boxes: Box[] = [];
        const hits = (b: Box) => boxes.some((q) => b.x0 < q.x1 + 4 && b.x1 > q.x0 - 4 && b.y0 < q.y1 + 2 && b.y1 > q.y0 - 2);

        if (observed !== null) {
          const x = data.discrete ? xScale.getPixelForValue(ks.indexOf(observed)) : xScale.getPixelForValue(observed);
          if (x >= chartArea.left - 1 && x <= chartArea.right + 1) {
            ctx.strokeStyle = c.ink;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            const text = `実測 ${observed}回`;
            const w = ctx.measureText(text).width + 8;
            const right = x > (chartArea.left + chartArea.right) / 2;
            const x0 = right ? x - w - 2 : x + 2;
            const y = chartArea.top + 2;
            ctx.fillStyle = c.surface;
            ctx.fillRect(x0, y, w, 16);
            ctx.fillStyle = c.ink;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(text, x0 + 4, y + 2);
            boxes.push({ x0, x1: x0 + w, y0: y, y1: y + 16 });
          }
        }

        ctx.fillStyle = c.ink2;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        chart.data.datasets.forEach((_, di) => {
          const s = data.series[di]!;
          if (highlight !== null && highlight !== s.setting) return;
          let best = 0;
          s.points.forEach((p, j) => {
            if (p.p > s.points[best]!.p) best = j;
          });
          const el = chart.getDatasetMeta(di).data[best];
          if (!el) return;
          const text = `設${s.setting}`;
          const w = ctx.measureText(text).width;
          const y = Math.max(chartArea.top + 14, el.y - 4);
          const box = { x0: el.x - w / 2, x1: el.x + w / 2, y0: y - 14, y1: y };
          if (hits(box)) return;
          boxes.push(box);
          ctx.fillText(text, el.x, y);
        });
        ctx.restore();
      },
    };

    const options: ChartOptions<"line"> = {
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            type: (data.discrete ? "category" : "linear") as "linear",
            min: data.discrete ? undefined : ks[0],
            max: data.discrete ? undefined : ks[ks.length - 1],
            grid: { color: c.grid },
            border: { color: c.axis },
            ticks: {
              color: c.muted,
              maxRotation: 0,
              autoSkipPadding: 12,
              includeBounds: false,
              callback(value) {
                const k = data.discrete ? Number(this.getLabelForValue(value as number)) : Number(value);
                if (!Number.isInteger(k)) return "";
                const sub = kToOneIn(k);
                return sub ? [String(k), sub] : String(k);
              },
            },
            title: { display: true, text: `${data.label}の回数（下段は 1/○○ 換算）`, color: c.muted },
          },
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, callback: (v) => `${Math.round(Number(v) * 1000) / 10}%` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                const k = data.discrete ? Number(items[0]?.label) : Number(items[0]?.parsed.x);
                const sub = kToOneIn(k);
                return `${k}回${sub ? `（${sub}）` : ""}`;
              },
              label(item) {
                return ` ${item.dataset.label}: ${pct(item.parsed.y as number)}`;
              },
            },
          },
        },
      };
    const config = {
      type: data.discrete ? "bar" : "line",
      data: data.discrete ? { labels: ks.map(String), datasets } : { datasets },
      options,
      plugins: [overlay],
    } as unknown as ChartConfiguration;
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
  }, [data, settings, highlight, theme]);

  return (
    <div class="chart-box" role="img" aria-label={`${data.label}の回数の分布。実測 ${data.observed ?? "—"} 回`}>
      <canvas ref={ref} />
    </div>
  );
}
