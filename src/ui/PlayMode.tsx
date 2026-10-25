// 実戦モード（外部設計 §11）: 打ちながらタップで数え、総回転数を入れ直すたびに推定と推移を更新する。

import { useEffect, useMemo, useState } from "preact/hooks";
import { TrendChart, type TrendPoint } from "../charts/TrendChart";
import { parseCount } from "../core/observation";
import type { FieldDef, Issue } from "../core/types";
import { sessionCountsSinceLastSnapshot, type PlaySession } from "../state/playSession";
import {
  activePlay, conditionsOutdated, continueWithNewData, discardPlay, entry, fields, finishPlay, playEntry, playLatest, prior, recomputeTrend,
  stalePlayDate, startPlay, tap, undo, updatePlay,
} from "../state/store";
import { Card, IssueList, themeKey } from "./common";
import { dateLabel, num, timeAgo } from "./format";
import { NumberField } from "./NumberField";
import { CompareTable, DistributionPanel, PosteriorSummary } from "./Results";

const UPDATE_REMINDER = 30;

export function PlayMode() {
  const s = activePlay.value;
  if (!s) return <PlayStart />;
  return <PlayCounter session={s} />;
}

function PlayStart() {
  const e = entry.value;
  const p = prior.value;
  const [games, setGames] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [memo, setMemo] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  if (!e || !p) return null;
  if (!e.model.capabilities.playMode) {
    return <Card title="実戦モード"><p>この機種は実戦モードに対応していません。かんたん入力を使ってください。</p></Card>;
  }
  const totalFields = fields.value.filter((f) => f.scope === "total");
  const submit = () => {
    const all: [string, string][] = [["games", games], ...totalFields.map((f): [string, string] => [f.key, counts[f.key] ?? ""])];
    const errs: Issue[] = [];
    const values: Record<string, number> = {};
    for (const [k, raw] of all) {
      const v = parseCount(raw === "" ? "0" : raw);
      if (v === null || Number.isNaN(v)) errs.push({ id: "V-01", level: "error", field: k, message: "0以上の整数で入力してください" });
      else values[k] = v;
    }
    if (errs.length > 0) return setIssues(errs);
    const { games: g, ...rest } = values;
    setIssues(startPlay({ games: g!, counts: rest }, memo.trim() || undefined));
  };
  return (
    <Card title="打ち始め">
      <p class="lead">台のデータカウンタの今の値を入れてください。空き台で 0 のときはそのまま始められます。</p>
      <div class="fields">
        <NumberField id="games" label="総回転数" unit="G" value={games} onInput={setGames} placeholder="0" issues={issues} />
        {totalFields.map((f) => (
          <NumberField key={f.key} id={f.key} label={f.label} stepper value={counts[f.key] ?? ""} onInput={(v) => setCounts((c) => ({ ...c, [f.key]: v }))} placeholder="0" issues={issues} />
        ))}
        <div class="field">
          <label for="memo">台番号メモ（任意）</label>
          <input id="memo" value={memo} maxLength={20} onInput={(ev) => setMemo((ev.target as HTMLInputElement).value)} />
        </div>
      </div>
      <IssueList issues={issues} />
      {fields.value.filter((f) => f.scope === "session" && f.measurementNote).map((f) => <p key={f.key} class="note">{f.label}: {f.measurementNote}</p>)}
      <p class="premise">事前分布＝{p.label}（打ち始めの時点の設定で固定されます）</p>
      <button class="btn primary block" onClick={submit}>打ち始める</button>
    </Card>
  );
}

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

function vibrate() {
  try {
    navigator.vibrate?.(15);
  } catch {
    // 振動に対応しない端末では何もしない
  }
}

function PlayCounter({ session: s }: { session: PlaySession }) {
  const e = playEntry.value;
  const [dialog, setDialog] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState<null | "finish" | "discard">(null);
  const [trendStyle, setTrendStyle] = useState<"stack" | "line">("stack");
  const [trendSource, setTrendSource] = useState<"recorded" | "current">("recorded");
  useWakeLock(true);
  const outdated = conditionsOutdated(s);
  const recomputed = useMemo(() => (outdated && trendSource === "current" ? recomputeTrend(s) : null), [s, outdated, trendSource]);
  if (!e) return <Card title="実戦モード"><p>この記録の機種データが見つかりません。</p><button class="btn" onClick={discardPlay}>記録を破棄</button></Card>;

  const flds = e.model.fields(e.machine).filter((f) => f.counterButton);
  const sessionBtns = flds.filter((f) => f.scope === "session");
  const totalBtns = flds.filter((f) => f.scope === "total");
  const last = s.snapshots[s.snapshots.length - 1]!;
  const latest = playLatest.value;
  const since = sessionCountsSinceLastSnapshot(s);
  const sessionGames = last.games - s.start.games;
  const grapeRate = sessionBtns[0] && last.sessionCounts[sessionBtns[0].key] ? sessionGames / last.sessionCounts[sessionBtns[0].key]! : null;
  const points: TrendPoint[] = recomputed ?? s.snapshots.map((x) => ({ games: x.games, posterior: x.posterior, concentration: x.concentration }));

  const countOf = (f: FieldDef) => (f.scope === "total" ? s.current.counts[f.key] ?? 0 : s.sessionCounts[f.key] ?? 0);

  return (
    <>
      {stalePlayDate.value && (
        <div class="banner">
          前回（{dateLabel(stalePlayDate.value)}）の実戦です。
          <div class="banner-actions">
            <button class="btn" onClick={finishPlay}>終了して履歴に残す</button>
            <button class="btn ghost" onClick={() => (stalePlayDate.value = null)}>続ける</button>
          </div>
        </div>
      )}
      {outdated && (
        <div class="banner warn" role="status">
          この実戦は以前の機種データ（データ版 {s.conditions.dataVersion}）で始まりました。今の機種データは データ版 {e.machine.dataVersion} です。
          これまでの点は記録当時の結果のまま残ります。続ける場合、これからの更新は新しいデータで計算します。
          <div class="banner-actions">
            <button class="btn primary" onClick={continueWithNewData}>新しいデータで続ける</button>
            <button class="btn" onClick={finishPlay}>終了して履歴に残す</button>
          </div>
        </div>
      )}
      <section class="card play-status">
        <div class="status-line">
          <strong>総回転数 {num(last.games)}G</strong>
          <span class="muted">（更新: {timeAgo(last.t)}）</span>
        </div>
        <div class="status-line">
          {totalBtns.map((f) => <span key={f.key}>{f.label} {countOf(f)}</span>)}
          {sessionBtns.map((f) => <span key={f.key}>{f.label} {countOf(f)}</span>)}
        </div>
        <div class="status-line muted">
          区間 {num(sessionGames)}G{grapeRate ? ` ／ ${sessionBtns[0]!.label} 1/${grapeRate.toFixed(2)}（前回更新時点）` : ""}
          {s.memo ? ` ／ ${s.memo}` : ""}
        </div>
        {latest && (
          <PosteriorSummary machine={e.machine} est={latest.estimate} priorLabel={s.conditions.prior.label} priorIsUniform={s.conditions.prior.id === "uniform"} compact />
        )}
      </section>

      {since >= UPDATE_REMINDER && (
        <div class="banner warn" role="status">
          前回の更新から{sessionBtns[0]?.label ?? "回数"}が{since}回増えました。総回転数を更新してください（推定は更新した時点の値で計算します）。
        </div>
      )}

      {!outdated && <section class="counter" aria-label="カウンター">
        {sessionBtns.map((f) => (
          <button key={f.key} class="counter-btn big" disabled={dialog} onClick={() => { tap(f.key); vibrate(); }}>
            <span class="counter-label">{f.label} +1</span>
            <span class="counter-value">{countOf(f)}</span>
          </button>
        ))}
        <div class="counter-row">
          {totalBtns.map((f) => (
            <button key={f.key} class="counter-btn" disabled={dialog} onClick={() => { tap(f.key); vibrate(); }}>
              <span class="counter-label">{f.label} +1</span>
              <span class="counter-value">{countOf(f)}</span>
            </button>
          ))}
        </div>
        <div class="counter-row">
          <button class="btn" disabled={s.undo.length === 0 || dialog} onClick={undo}>
            ↶ 戻す{s.undo.length > 0 ? `（${s.undo[s.undo.length - 1]!.label}）` : ""}
          </button>
          <button class="btn primary" onClick={() => setDialog(true)}>総回転数を更新</button>
        </div>
      </section>}

      {dialog && <UpdateDialog session={s} fields={e.model.fields(e.machine)} onClose={() => setDialog(false)} />}

      <Card
        title="推定の推移"
        actions={
          <div class="seg">
            <button class={trendStyle === "stack" ? "chip active" : "chip"} onClick={() => setTrendStyle("stack")}>積み上げ</button>
            <button class={trendStyle === "line" ? "chip active" : "chip"} onClick={() => setTrendStyle("line")}>折れ線</button>
          </div>
        }
      >
        {outdated && (
          <div class="seg spaced">
            <button class={trendSource === "recorded" ? "chip active" : "chip"} onClick={() => setTrendSource("recorded")}>記録当時の条件</button>
            <button class={trendSource === "current" ? "chip active" : "chip"} onClick={() => setTrendSource("current")}>今の条件で再計算</button>
          </div>
        )}
        {points.length < 2 ? (
          <p class="muted">総回転数を更新するたびに、ここに点が増えていきます。</p>
        ) : (
          <TrendChart points={points} settings={e.machine.settings} style={trendStyle} theme={themeKey.value} />
        )}
        {s.snapshots.some((x) => x.corrected) && (
          <p class="note">
            訂正を含む点: {s.snapshots.filter((x) => x.corrected).map((x) => `${num(x.games)}G`).join("、")}（この点で回数を減らす訂正をしました。直前の点は誤った回数で計算されている可能性があります）
          </p>
        )}
        {(s.conditionChanges ?? []).map((c) => (
          <p class="note" key={c.t}>{num(c.games)}G 以降は 新しい機種データ（データ版 {c.to.dataVersion}）で計算しています。</p>
        ))}
        <p class="note">
          回すにつれて帯が寄っていく様子で、推定の変化を見られます。集中度は推定がどれだけ1つの設定に集まっているかで、正しい設定に近づいたことや当たりやすさを示すものではありません。ボーナスの偏りで下がることもあります。
        </p>
      </Card>

      {latest && (
        <details class="card">
          <summary class="card-head"><h2>分布と比較表（前回更新時点）</h2></summary>
          <DistributionPanel charts={latest.charts} settings={e.machine.settings} />
          <CompareTable rows={latest.rows} settings={e.machine.settings} />
        </details>
      )}

      <section class="card end-actions">
        {confirmEnd === null && (
          <div class="counter-row">
            <button class="btn" onClick={() => setConfirmEnd("finish")}>打ち終わる</button>
            <button class="btn ghost danger" onClick={() => setConfirmEnd("discard")}>記録を破棄</button>
          </div>
        )}
        {confirmEnd === "finish" && (
          <div>
            <p>打ち終わって、この記録を履歴に残しますか？</p>
            <div class="counter-row">
              <button class="btn primary" onClick={() => { setConfirmEnd(null); finishPlay(); }}>打ち終わる</button>
              <button class="btn ghost" onClick={() => setConfirmEnd(null)}>やめる</button>
            </div>
          </div>
        )}
        {confirmEnd === "discard" && (
          <div>
            <p>この実戦の記録を破棄します。元に戻せません。</p>
            <div class="counter-row">
              <button class="btn danger" onClick={() => { setConfirmEnd(null); discardPlay(); }}>破棄する</button>
              <button class="btn ghost" onClick={() => setConfirmEnd(null)}>やめる</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function UpdateDialog({ session: s, fields: flds, onClose }: { session: PlaySession; fields: FieldDef[]; onClose: () => void }) {
  const totalFields = flds.filter((f) => f.scope === "total");
  const sessionFields = flds.filter((f) => f.scope === "session");
  const [games, setGames] = useState(String(s.current.games));
  const [counts, setCounts] = useState<Record<string, string>>(Object.fromEntries(totalFields.map((f) => [f.key, String(s.current.counts[f.key] ?? 0)])));
  const [sCounts, setSCounts] = useState<Record<string, string>>(Object.fromEntries(sessionFields.map((f) => [f.key, String(s.sessionCounts[f.key] ?? 0)])));
  const [issues, setIssues] = useState<Issue[]>([]);
  const decreased = [
    ...totalFields.filter((f) => (parseCount(counts[f.key]) ?? 0) < (s.current.counts[f.key] ?? 0)),
    ...sessionFields.filter((f) => (parseCount(sCounts[f.key]) ?? 0) < (s.sessionCounts[f.key] ?? 0)),
  ];
  const submit = () => {
    const errs: Issue[] = [];
    const read = (raw: string | undefined, field: string): number | null => {
      const v = parseCount(raw);
      if (v === null || Number.isNaN(v)) {
        errs.push({ id: "V-01", level: "error", field, message: "0以上の整数で入力してください" });
        return null;
      }
      return v;
    };
    const g = read(games, "games");
    const values = Object.fromEntries(totalFields.map((f) => [f.key, read(counts[f.key], f.key)]));
    const sValues = Object.fromEntries(sessionFields.map((f) => [f.key, read(sCounts[f.key], f.key)]));
    if (errs.length > 0) return setIssues(errs);
    const result = updatePlay({ games: g!, counts: values as Record<string, number>, sessionCounts: sValues as Record<string, number> });
    if (result.length > 0) return setIssues(result);
    onClose();
  };
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="総回転数の更新" onClick={(ev) => ev.stopPropagation()}>
        <header class="sheet-head">
          <h2>総回転数の更新</h2>
          <button class="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </header>
        <div class="sheet-body">
          <p class="lead">データカウンタの今の値を入れてください。BIG・REG・{sessionFields.map((f) => f.label).join("・")}は、数え間違いがあればここで直せます。</p>
          <div class="fields">
            <NumberField id="games" label="総回転数" unit="G" value={games} onInput={setGames} issues={issues} large />
            {totalFields.map((f) => (
              <NumberField key={f.key} id={f.key} label={f.label} stepper value={counts[f.key] ?? ""} onInput={(v) => setCounts((c) => ({ ...c, [f.key]: v }))} issues={issues} />
            ))}
            {sessionFields.map((f) => (
              <NumberField key={f.key} id={f.key} label={`${f.label}（区間）`} stepper value={sCounts[f.key] ?? ""} onInput={(v) => setSCounts((c) => ({ ...c, [f.key]: v }))} issues={issues} />
            ))}
          </div>
          {decreased.length > 0 && (
            <p class="issue warning">{decreased.map((f) => f.label).join("・")}を減らす訂正になります。カウンタの表示や数えた回数と合っているか確かめてください（推移グラフでは訂正を含む点として示します）。</p>
          )}
          <IssueList issues={issues} />
          <button class="btn primary block" onClick={submit}>確定</button>
        </div>
      </div>
    </div>
  );
}
