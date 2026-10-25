import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import type { Issue } from "../core/types";
import { settingColor } from "../charts/chartTheme";

// 端末のライト/ダーク切り替えでグラフを描き直すための値
const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
export const themeKey = signal(mq?.matches ? "dark" : "light");
mq?.addEventListener("change", (e) => {
  themeKey.value = e.matches ? "dark" : "light";
});

export function IssueList({ issues, field }: { issues: Issue[]; field?: string }) {
  const list = field === undefined ? issues.filter((i) => !i.field) : issues.filter((i) => i.field === field);
  if (list.length === 0) return null;
  return (
    <ul class="issues">
      {list.map((i) => (
        <li key={i.id + i.message} class={`issue ${i.level}`} role={i.level === "error" ? "alert" : undefined}>
          <span class="issue-icon" aria-hidden="true">{i.level === "error" ? "✕" : i.level === "warning" ? "!" : "i"}</span>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export function Swatch({ index, line }: { index: number; line?: boolean }) {
  const dashes = ["", "6 3", "2 3", "8 3 2 3", "4 4", "1 2"];
  if (line) {
    return (
      <svg class="swatch-line" width="22" height="8" aria-hidden="true">
        <line x1="0" y1="4" x2="22" y2="4" stroke={settingColor(index)} stroke-width="2.5" stroke-dasharray={dashes[index % 6]} />
      </svg>
    );
  }
  return <span class="swatch" style={{ background: `var(--set-${(index % 6) + 1})` }} aria-hidden="true" />;
}

export function Card({ title, children, actions }: { title: string; children: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <section class="card">
      <header class="card-head">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header class="sheet-head">
          <h2>{title}</h2>
          <button class="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
