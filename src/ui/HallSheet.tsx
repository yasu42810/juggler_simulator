// 店のその日のデータ（FR-32）: ファイルの読み込み、その日の配分の推定、台の選択。

import { useState } from "preact/hooks";
import {
  clearHallDay, entry, HALL_PRIOR_ID, hallDay, hallEstimate, loadHallFile, priorId, selectHallUnit, sheet, targetUnit,
} from "../state/store";
import { isToday } from "../state/persistence";
import { Sheet } from "./common";
import { dateLabel, num, oneIn, pct } from "./format";

const close = () => (sheet.value = null);

export function HallSheet() {
  const e = entry.value;
  const d = hallDay.value;
  const est = hallEstimate.value;
  const [message, setMessage] = useState<string | null>(null);

  const onFile = async (ev: Event) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const json: unknown = JSON.parse(await file.text());
      const r = loadHallFile(json);
      setMessage(r.ok ? null : r.message);
    } catch {
      setMessage("JSON ファイルとして読めませんでした");
    }
  };

  if (!e) return null;
  return (
    <Sheet title="店のその日のデータ" onClose={close}>
      <p class="note">
        同じ店・同じ日の台ごとのデータ（総回転数・BIG・REG）から、その日の設定の入り方を推定して、事前分布に使います。
        設定は日ごとに入れ替わるので、その日のデータだけを使ってください。データはこの端末の中だけに保存します。
      </p>
      <label class="btn block file-btn">
        ファイルを読み込む（JSON）
        <input type="file" accept="application/json,.json" onChange={onFile} />
      </label>
      {message && <p class="issue error">{message}</p>}

      {d && est && (
        <>
          <h3>{d.hall}・{d.machineName}</h3>
          <p class="muted small-text">
            {dateLabel(d.date)}のデータ・{d.units.length}台
            {!isToday(d.date) && "（今日のデータではありません）"}
          </p>
          {d.warnings.map((w) => <p key={w} class="issue warning">{w}</p>)}
          {d.skipped.length > 0 && (
            <p class="issue warning">読み込めなかった台: {d.skipped.map((x) => `${x.unit}（${x.reason}）`).join("、")}</p>
          )}

          <h3>その日の設定の入り方（推定）</h3>
          <div class="groups">
            {est.groups.map((g) => (
              <div class="group" key={g.label}>
                <span class="group-label">{g.label}</span>
                <span class="group-value">{pct(g.mean)}</span>
                <span class="group-range">{pct(g.lo)}〜{pct(g.hi)}</span>
              </div>
            ))}
          </div>
          <details class="inline-details">
            <summary>設定ごとの推定（幅が広く、参考程度）</summary>
            <ul class="plain">
              {est.perSetting.map((p) => <li key={p.label}>{p.label}: {pct(p.mean)}（90%の範囲 {pct(p.lo)}〜{pct(p.hi)}）</li>)}
            </ul>
          </details>
          <p class="note">
            {est.excluded ? `見ている台（${est.excluded}番）を除いた${est.unitCount}台から推定しています。` : `${est.unitCount}台から推定しています。`}
            範囲は90%の幅です。ジャグラーは設定差が小さいため、1日分では設定ごとの割合はあまり絞り込めません。
          </p>
          {priorId.value !== HALL_PRIOR_ID && (
            <button class="btn primary block" onClick={() => (priorId.value = HALL_PRIOR_ID)}>この推定を事前分布に使う</button>
          )}

          <h3>台を選ぶ</h3>
          <p class="note">台を選ぶと、かんたん入力にその台の値が入り、その台を除いた推定を事前分布にして計算します。</p>
          <UnitTable />
          <button class="btn ghost danger small" onClick={clearHallDay}>店のデータを消す</button>
        </>
      )}
    </Sheet>
  );
}

function UnitTable() {
  const d = hallDay.value!;
  return (
    <div class="table-scroll">
      <table class="compare units">
        <thead>
          <tr><th scope="col">台番号</th><th scope="col">総回転数</th><th scope="col">BIG</th><th scope="col">REG</th><th scope="col">合算</th><th scope="col"></th></tr>
        </thead>
        <tbody>
          {d.units.map((u) => {
            const b = u.obs.total.counts.big ?? 0;
            const r = u.obs.total.counts.reg ?? 0;
            const selected = targetUnit.value === u.unit;
            return (
              <tr key={u.unit} class={selected ? "selected" : ""}>
                <th scope="row">{u.unit}</th>
                <td>{num(u.obs.total.games)}</td>
                <td>{b}</td>
                <td>{r}</td>
                <td>{oneIn(b + r > 0 ? u.obs.total.games / (b + r) : null)}</td>
                <td>
                  <button class="btn small" onClick={() => { selectHallUnit(u.unit); close(); }} aria-label={`${u.unit}番台を見る`}>
                    {selected ? "見ている台" : "この台を見る"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
