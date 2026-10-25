// かんたん入力（UC-1, UC-3）: データカウンタの値を入れて、すぐ結果を見る。

import {
  entry, fields, HALL_PRIOR_ID, hallDay, prior, resetSimple, selectHallUnit, sheet, targetUnit, setSimpleField, simpleCharts, simpleInput, simpleResult, staleInputDate, staleResult,
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
  // 入力が店のデータの未選択の台と同じ値なら、その台を選ぶよう促す
  const duplicate = hallDay.value && !targetUnit.value && r.obs
    ? hallDay.value.units.find((u) => u.obs.total.games === r.obs!.total.games
        && Object.entries(u.obs.total.counts).every(([k, v]) => r.obs!.total.counts[k] === v))?.unit ?? null
    : null;

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

      {hallDay.value && (
        <div class="banner">
          店のデータ: {hallDay.value.hall}・{dateLabel(hallDay.value.date)}・{hallDay.value.units.length}台
          {targetUnit.value ? `／ 見ている台: ${targetUnit.value}番（推定から除外）` : ""}
          {p.id !== HALL_PRIOR_ID && "（事前分布には使っていません）"}
          {p.id === HALL_PRIOR_ID && duplicate && (
            <p class="issue warning">
              入力が一覧の{duplicate}番台と同じ値です。その台を見ているなら「この台を見る」で選んでください（選ばないと、同じデータを推定と入力の両方に使ってしまいます）。
              <button class="btn small" onClick={() => selectHallUnit(duplicate)}>{duplicate}番台を選ぶ</button>
            </p>
          )}
          <div class="banner-actions">
            <button class="btn small" onClick={() => (sheet.value = "hall")}>台を選ぶ・推定を見る</button>
            {targetUnit.value && <button class="btn ghost small" onClick={() => selectHallUnit(null)}>台の選択を外す</button>}
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
