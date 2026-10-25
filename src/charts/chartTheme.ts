// グラフの色・線種。色は CSS 変数（styles.css）から読む。設定は色＋線種＋ラベルで区別する（色だけに頼らない）。

import {
  BarController, BarElement, CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, LinearScale, CategoryScale, Filler, Tooltip);

export const DASHES: number[][] = [[], [6, 3], [2, 3], [8, 3, 2, 3], [4, 4], [1, 2]];

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function settingColor(index: number): string {
  return cssVar(`--set-${(index % 6) + 1}`);
}

export function chrome() {
  return {
    ink: cssVar("--ink-1"),
    ink2: cssVar("--ink-2"),
    muted: cssVar("--ink-3"),
    grid: cssVar("--grid"),
    axis: cssVar("--axis"),
    surface: cssVar("--surface"),
  };
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export { Chart };
