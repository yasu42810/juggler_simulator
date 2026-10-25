export function pct(p: number): string {
  if (p > 0 && p < 0.001) return "<0.1%";
  if (p < 1 && p > 0.9995) return ">99.9%";
  return `${(p * 100).toFixed(1)}%`;
}

export function oneIn(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  return `1/${x >= 100 ? x.toFixed(1) : x.toFixed(2)}`;
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function timeAgo(iso: string, now = new Date()): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}

export function num(n: number): string {
  return n.toLocaleString("ja-JP");
}

export const DATA_TYPE_LABEL = { published: "公表値", analysis: "解析値", measured: "実戦値" } as const;
