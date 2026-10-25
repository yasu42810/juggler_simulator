// かんたん入力（UC-1, UC-3）: データカウンタの値を入れて、すぐ結果を見る。

import {
  entry, fields, prior, resetSimple, setSimpleField, simpleCharts, simpleInput, simpleResult, staleInputDate, staleResult,
} from "../state/store";
import { Card, IssueList } from "./common";
import { dateLabel } from "./format";
import { NumberField } from "./NumberField";
import { CompareTable, DistributionPanel, PosteriorSummary } from "./Results";

export function SimpleMode() {
  const e = entry.value;
  const p = prior.value;
  if (!e || !p) return null;
  const input = simpleInput.value;
  const r = simpleResult.value;
  const stale = staleResult.value;
  const totalFields = fields.value.filter((f) => f.scope === "total");
  const sessionFields = fields.value.filter((f) => f.scope === "session");
  const shown = r.estimate ? r : stale?.view ?? null;

  return (
    <>
      {staleInputDate.value && (
        <div class="banner">
          前回（{dateLabel(staleInputDate.value)}）の入力です。
          <div class="banner-actions">
            <button class="btn" onClick={resetSimple}>リセット</button>
            <button class="btn ghost" onClick={() => (staleInputDate.value = null)}>このまま使う</button>
          </div>
        </div>
      )}

      <Card title="台データ（データカウンタ）" actions={<button class="btn ghost small" onClick={resetSimple}>リセット</button>}>
        <div class="fields">
          <NumberField id="games" label="総回転数" unit="G" value={input.games} onInput={(v) => setSimpleField("games", v)} issues={r.issues} placeholder="例: 3000" />
          {totalFields.map((f) => (
            <NumberField key={f.key} id={f.key} label={f.label} stepper value={input.counts[f.key] ?? ""} onInput={(v) => setSimpleField("counts", v, f.key)} issues={r.issues} placeholder="0" />
          ))}
        </div>
      </Card>

      {sessionFields.length > 0 && (
        <details class="card" open={input.sessionGames !== "" || sessionFields.some((f) => (input.sessionCounts[f.key] ?? "") !== "")}>
          <summary class="card-head"><h2>自分の遊技区間（任意）</h2></summary>
          <div class="fields">
            <NumberField id="sessionGames" label="区間の回転数" unit="G" value={input.sessionGames} onInput={(v) => setSimpleField("sessionGames", v)} issues={r.issues} placeholder="カウンタの差" />
            {sessionFields.map((f) => (
              <NumberField key={f.key} id={f.key} label={f.label} stepper value={input.sessionCounts[f.key] ?? ""} onInput={(v) => setSimpleField("sessionCounts", v, f.key)} issues={r.issues} />
            ))}
          </div>
          {sessionFields.map((f) => f.measurementNote && <p key={f.key} class="note">{f.measurementNote}</p>)}
        </details>
      )}

      <Card title="推定結果">
        <IssueList issues={r.issues} />
        {shown?.estimate ? (
          <>
            {!r.estimate && <p class="stale-note">入力エラーのため未更新（前回の有効な入力での結果）</p>}
            <PosteriorSummary machine={e.machine} est={shown.estimate} priorLabel={p.label} priorIsUniform={p.id === "uniform"} stale={!r.estimate} />
          </>
        ) : (
          !r.issues.some((i) => i.level !== "notice") && <p class="muted">総回転数を入れると、設定ごとの確率が表示されます</p>
        )}
      </Card>

      {r.estimate && (
        <Card title="分布（各設定での出方のばらつき）">
          <DistributionPanel charts={simpleCharts.value} settings={e.machine.settings} />
        </Card>
      )}

      {r.rows.length > 0 && (
        <Card title="実測と設定ごとの確率">
          <CompareTable rows={r.rows} settings={e.machine.settings} />
        </Card>
      )}
    </>
  );
}
