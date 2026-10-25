// 補助のシート: 機種情報（SC-06）、設定（SC-07）、ヘルプ（SC-08）、実戦の履歴。

import { useState } from "preact/hooks";
import { PRESETS_NOTE } from "../core/priors/preset";
import { toProbability, type ProbValue } from "../core/probability";
import type { JugglerStandardV1Data } from "../core/models/jugglerStandardV1";
import { clearAllData, deleteHistory, enabled, entry, playHistory, priorId, priorOptions, sheet } from "../state/store";
import { TrendChart } from "../charts/TrendChart";
import { Sheet, Swatch, themeKey } from "./common";
import { DATA_TYPE_LABEL, dateLabel, num, oneIn, pct } from "./format";
import { findMachine } from "../machines/registry";

const close = () => (sheet.value = null);

export function Sheets() {
  switch (sheet.value) {
    case "machine":
      return <MachineSheet />;
    case "settings":
      return <SettingsSheet />;
    case "help":
      return <HelpSheet />;
    case "history":
      return <HistorySheet />;
    default:
      return null;
  }
}

const PROB_LABELS: Record<string, string> = { big: "BIG", reg: "REG", regSolo: "単独REG", regCherry: "チェリー重複REG", grape: "ぶどう" };

function MachineSheet() {
  const e = entry.value;
  if (!e) return null;
  const m = e.machine;
  const probs = (m as Partial<JugglerStandardV1Data>).probabilities;
  const src = new Map(m.sources.map((s) => [s.id, s]));
  return (
    <Sheet title={`${m.name} の機種データ`} onClose={close}>
      <p class="muted">データ版 {m.dataVersion} ／ 計算モデル {e.model.id}</p>
      <div class="table-scroll">
        <table class="compare">
          <thead>
            <tr><th scope="col"></th>{m.settings.map((s, i) => <th scope="col" key={s}><Swatch index={i} />設{s}</th>)}</tr>
          </thead>
          <tbody>
            {probs && Object.entries(probs).map(([k, t]) => t && (
              <tr key={k}>
                <th scope="row">{PROB_LABELS[k] ?? k}<span class="badge">{DATA_TYPE_LABEL[t.dataType]}</span></th>
                {m.settings.map((s) => <td key={s}>{oneIn(1 / toProbability(t.values[s] as ProbValue))}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row">機械割<span class="badge">{DATA_TYPE_LABEL[m.payout.dataType]}</span></th>
              {m.settings.map((s) => <td key={s}>{m.payout.values[s]!.toFixed(1)}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {probs && (
        <ul class="plain">
          {Object.entries(probs).map(([k, t]) => t && (
            <li key={k}>
              <strong>{PROB_LABELS[k] ?? k}</strong>: {t.measurement}
              {t.basis && <>。{t.basis}</>}
              {"（出典: "}{t.sourceIds.map((id) => src.get(id)?.title ?? id).join("、")}{"）"}
            </li>
          ))}
          <li><strong>機械割</strong>: {m.payout.condition}</li>
        </ul>
      )}
      <h3>出典</h3>
      <ul class="plain">
        {m.sources.map((s) => (
          <li key={s.id}>
            {s.id}: <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>（{s.accessed} 参照）
          </li>
        ))}
      </ul>
      <p class="note">ぶどうなどの解析値は非公式の値で、出典によって違います。メーカーのロゴ等は使用していません。本アプリはメーカーとは関係ありません。</p>
    </Sheet>
  );
}

function SettingsSheet() {
  const e = entry.value;
  const toggles = e ? e.model.toggles(e.machine) : [];
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <Sheet title="設定" onClose={close}>
      <h3>事前分布（店の設定の入れ方の想定）</h3>
      <p class="note">{PRESETS_NOTE.replace(/根拠は.*$/, "")}事前分布で結果は大きく変わります。</p>
      <div class="radio-list" role="radiogroup">
        {priorOptions.value.map((p) => {
          const w = e ? p.weights(e.machine) : {};
          return (
            <label key={p.id} class={`radio ${priorId.value === p.id ? "checked" : ""}`}>
              <input type="radio" name="prior" checked={priorId.value === p.id} onChange={() => (priorId.value = p.id)} />
              <span>
                <strong>{p.label}</strong>
                <span class="muted small-text">{e?.machine.settings.map((s) => `設${s} ${pct(w[s] ?? 0)}`).join(" / ")}</span>
                {p.description && <span class="muted small-text">{p.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p class="note">実戦モードでは、打ち始めた時点の事前分布で計算します（途中で変えても、進行中の実戦には反映されません）。</p>

      {toggles.length > 0 && <h3>計算に使う情報</h3>}
      {toggles.map((t) => (
        <label key={t.key} class="switch">
          <input type="checkbox" checked={enabled.value[t.key] !== false} onChange={(ev) => (enabled.value = { ...enabled.value, [t.key]: (ev.target as HTMLInputElement).checked })} />
          {t.label}
        </label>
      ))}

      <h3>データ</h3>
      {!confirmClear ? (
        <button class="btn ghost danger" onClick={() => setConfirmClear(true)}>この端末に保存したデータをすべて消す</button>
      ) : (
        <div>
          <p>入力・実戦の記録・履歴をすべて消します。元に戻せません。</p>
          <div class="counter-row">
            <button class="btn danger" onClick={() => { clearAllData(); setConfirmClear(false); close(); }}>すべて消す</button>
            <button class="btn ghost" onClick={() => setConfirmClear(false)}>やめる</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function HelpSheet() {
  return (
    <Sheet title="使い方と注意" onClose={close}>
      <h3>このアプリについて</h3>
      <p>データカウンタの総回転数・BIG・REG と、自分で数えたぶどう回数から、台が設定1〜6のどれである確率がどのくらいかを計算します。計算はすべてこの端末の中で行い、入力した値は外部に送りません。</p>
      <h3>結果の見方</h3>
      <ul class="plain">
        <li><strong>設定ごとの確率</strong>: 「事前分布（店の設定の入れ方の想定）」と実測の値を組み合わせた推定です。想定が変わると結果も大きく変わります。</li>
        <li><strong>分布のグラフ</strong>: 各設定だと仮定したとき、今の回転数で何回出るかのばらつきです。縦線（実測）がどの設定の山に近いかの目安になります。設定の確率そのものではありません。</li>
        <li><strong>集中度</strong>: 推定がどれだけ1つの設定に集まっているかです。正しい設定に近づいたことを示すものではありません。</li>
      </ul>
      <h3>ぶどうの数え方</h3>
      <ul class="plain">
        <li>区間の回転数は、打ち始めと今のデータカウンタの総回転数の差です。</li>
        <li>区間中は3枚掛けで打ち、揃ったぶどうをすべて数えます（ボーナス成立後に1枚掛けでぶどうを取る打ち方をすると、出方が変わります）。</li>
        <li>ボーナスやぶどうの出方を見て、区間の始まりや終わりを決めないでください。</li>
        <li>ぶどうの確率は非公式の解析値です。設定シートで計算から外せます。</li>
      </ul>
      <h3>実戦モード</h3>
      <p>打ち始めにカウンタの値を入れ、ぶどう・BIG・REG をボタンで数えます。ときどき「総回転数を更新」でカウンタの値を入れると、その時点の推定が計算され、推移グラフに点が増えます。押し間違いは「戻す」で取り消せます。</p>
      <h3>注意</h3>
      <ul class="plain">
        <li>結果は推定です。設定を確定・保証するものではなく、勝ちを保証するものでもありません。</li>
        <li>ホールの規則（スマートフォンの使用など）に従ってご利用ください。</li>
        <li>本アプリはメーカー・ホールとは関係ありません。</li>
      </ul>
    </Sheet>
  );
}

function HistorySheet() {
  const [open, setOpen] = useState<string | null>(null);
  const list = playHistory.value;
  return (
    <Sheet title="実戦の履歴" onClose={close}>
      {list.length === 0 && <p class="muted">まだ履歴はありません。</p>}
      <ul class="history">
        {list.map((h) => {
          const m = findMachine(h.machineId)?.machine;
          const last = h.snapshots[h.snapshots.length - 1];
          const p4 = last && m ? m.settingGroups[0] : undefined;
          return (
            <li key={h.id}>
              <button class="history-head" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
                <span>{dateLabel(h.startedAt)} {m?.name ?? h.machineId}{h.memo ? `（${h.memo}）` : ""}</span>
                <span class="muted">
                  {last ? `${num(last.games)}G` : ""}
                  {last && p4 ? ` ／ ${p4.label} ${pct(p4.settings.reduce((a, s) => a + (last.posterior[s] ?? 0), 0))}` : ""}
                </span>
              </button>
              {open === h.id && m && (
                <div class="history-body">
                  <p class="muted small-text">事前分布＝{h.conditions.prior.label} ／ データ版 {h.conditions.dataVersion}（記録当時の条件）</p>
                  {h.snapshots.length >= 2 ? (
                    <TrendChart points={h.snapshots} settings={m.settings} style="stack" theme={themeKey.value} />
                  ) : (
                    <p class="muted">推移の点が足りません。</p>
                  )}
                  <button class="btn ghost danger small" onClick={() => deleteHistory(h.id)}>この履歴を消す</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
