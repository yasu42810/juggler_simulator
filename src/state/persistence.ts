// localStorage の読み書き（内部設計 §6.2）。保存できない環境でも動作は止めない。

import type { SimpleInput } from "../core/observation";
import { isHallDay, type HallDay } from "./hallData";
import type { PlaySession } from "./playSession";

const PREFIX = "jsim:v1:";
export const HISTORY_LIMIT = 30;

export interface Prefs {
  machineId: string | null;
  mode: "simple" | "play";
  priorId: string;
  enabled: Record<string, boolean>;
}

export interface StoredInput {
  input: SimpleInput;
  updatedAt: string;
}

let failureListener: ((e: unknown) => void) | null = null;

export function onStorageFailure(fn: (e: unknown) => void): void {
  failureListener = fn;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string, check: (v: unknown) => v is T): T | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return check(v) ? v : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) throw new Error("localStorage を使えません");
    if (value === null) s.removeItem(PREFIX + key);
    else s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    failureListener?.(e);
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isPrefs(v: unknown): v is Prefs {
  return isObj(v) && (v.mode === "simple" || v.mode === "play") && typeof v.priorId === "string" && isObj(v.enabled);
}

function isStoredInput(v: unknown): v is StoredInput {
  return isObj(v) && typeof v.updatedAt === "string" && isObj(v.input) && typeof v.input.games === "string"
    && isObj(v.input.counts) && typeof v.input.sessionGames === "string" && isObj(v.input.sessionCounts);
}

function isSession(v: unknown): v is PlaySession {
  return isObj(v) && v.version === 1 && typeof v.id === "string" && typeof v.machineId === "string"
    && isObj(v.start) && isObj(v.current) && isObj(v.sessionCounts) && Array.isArray(v.snapshots) && Array.isArray(v.undo)
    && isObj(v.conditions);
}

function isSessionList(v: unknown): v is PlaySession[] {
  return Array.isArray(v) && v.every(isSession);
}

export const loadPrefs = () => read("prefs", isPrefs);
export const savePrefs = (p: Prefs) => write("prefs", p);

export const loadInput = (machineId: string) => read(`input:${machineId}`, isStoredInput);
export const saveInput = (machineId: string, input: SimpleInput, now = new Date()) =>
  write(`input:${machineId}`, { input, updatedAt: now.toISOString() } satisfies StoredInput);

export const loadHallDay = (machineId: string) => read(`hall:${machineId}`, isHallDay);
export const saveHallDay = (machineId: string, d: HallDay | null) => write(`hall:${machineId}`, d);

export const loadActivePlay = () => read("play:active", isSession);
export const saveActivePlay = (s: PlaySession | null) => write("play:active", s);

export const loadHistory = () => read("play:history", isSessionList) ?? [];
export function addHistory(s: PlaySession): boolean {
  const list = [s, ...loadHistory().filter((x) => x.id !== s.id)].slice(0, HISTORY_LIMIT);
  return write("play:history", list);
}
export function removeHistory(id: string): boolean {
  return write("play:history", loadHistory().filter((x) => x.id !== id));
}

export function clearAll(): void {
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch (e) {
    failureListener?.(e);
  }
}

/** 日付（端末のローカル時刻）が今日か */
export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
