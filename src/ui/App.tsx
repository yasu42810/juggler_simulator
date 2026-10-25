import { signal } from "@preact/signals";
import { registry } from "../machines/registry";
import { activePlay, entry, machineId, mode, sheet, storageError } from "../state/store";
import { PlayMode } from "./PlayMode";
import { Sheets } from "./Sheets";
import { SimpleMode } from "./SimpleMode";

/** Service Worker の更新待ち（main.tsx から設定） */
export const updateReady = signal<null | (() => void)>(null);

export function App() {
  const e = entry.value;
  const playing = activePlay.value !== null;
  return (
    <div class="app">
      <header class="app-head">
        <div class="title-row">
          <h1>スロ設定ナビ</h1>
          <div class="head-actions">
            <button class="icon-btn" onClick={() => (sheet.value = "hall")} aria-label="店のその日のデータ">店</button>
            <button class="icon-btn" onClick={() => (sheet.value = "history")} aria-label="実戦の履歴">履歴</button>
            <button class="icon-btn" onClick={() => (sheet.value = "settings")} aria-label="設定">設定</button>
            <button class="icon-btn" onClick={() => (sheet.value = "help")} aria-label="使い方と注意">？</button>
          </div>
        </div>
        <div class="machine-row">
          <label for="machine" class="visually-hidden">機種</label>
          <select
            id="machine"
            value={machineId.value}
            disabled={playing && mode.value === "play"}
            onChange={(ev) => (machineId.value = (ev.target as HTMLSelectElement).value)}
          >
            {registry.entries.map((x) => <option key={x.machine.id} value={x.machine.id}>{x.machine.name}</option>)}
          </select>
          <button class="btn ghost small" onClick={() => (sheet.value = "machine")}>機種データ</button>
        </div>
        <nav class="mode-tabs" role="tablist" aria-label="モード">
          <button role="tab" aria-selected={mode.value === "simple"} class={mode.value === "simple" ? "tab active" : "tab"} onClick={() => (mode.value = "simple")}>かんたん入力</button>
          <button role="tab" aria-selected={mode.value === "play"} class={mode.value === "play" ? "tab active" : "tab"} onClick={() => (mode.value = "play")}>
            実戦モード{playing ? " ●" : ""}
          </button>
        </nav>
      </header>

      {updateReady.value && (
        <div class="banner">
          新しい版があります。
          <div class="banner-actions">
            <button class="btn primary" onClick={() => updateReady.value?.()}>タップで再読み込み</button>
          </div>
        </div>
      )}
      {storageError.value && (
        <div class="banner warn" role="status">
          {storageError.value}
          <div class="banner-actions"><button class="btn ghost" onClick={() => (storageError.value = null)}>閉じる</button></div>
        </div>
      )}
      {registry.errors.length > 0 && (
        <div class="banner warn">機種データの一部を読み込めませんでした（{registry.errors.length}件）。</div>
      )}

      <main>
        {!e ? <p>機種データがありません。</p> : mode.value === "simple" ? <SimpleMode /> : <PlayMode />}
      </main>

      <footer class="disclaimer">
        結果は推定であり、設定を確定・保証するものではありません。ホールの規則に従ってご利用ください。本アプリはメーカー・ホールとは関係ありません。
      </footer>
      <Sheets />
    </div>
  );
}
