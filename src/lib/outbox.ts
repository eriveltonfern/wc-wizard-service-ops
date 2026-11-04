// Fila de limpezas guardadas no aparelho enquanto não há internet. Envia pelo endpoints.ts quando a conexão volta.
import { useSyncExternalStore } from "react";
import { ApiError } from "./api";
import { createCleaning } from "./endpoints";
import type { CleaningInput } from "./types";

const KEY = "wccheck.outbox";
const SIM_KEY = "wccheck.simOffline";
const EVT = "wccheck-outbox";

export type QueuedCleaning = Omit<CleaningInput, "photo_before" | "photo_after" | "queued"> & {
  bathroom_name: string; photo_before?: string | undefined; photo_after?: string | undefined; // fotos em data URL
};

function read(): QueuedCleaning[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedCleaning[]; } catch { return []; }
}
function write(items: QueuedCleaning[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVT));
}
export const isSimulatedOffline = () => typeof window !== "undefined" && localStorage.getItem(SIM_KEY) === "1";
export const isOffline = () => typeof navigator !== "undefined" && (!navigator.onLine || isSimulatedOffline());
export function setSimulatedOffline(on: boolean) {
  if (on) localStorage.setItem(SIM_KEY, "1"); else localStorage.removeItem(SIM_KEY);
  window.dispatchEvent(new Event(EVT));
  if (!on) void flushOutbox();
}
export function enqueueCleaning(item: QueuedCleaning) { write([...read(), item]); }

export function dataUrlToBlob(url: string): Blob {
  const [head, data] = url.split(",");
  const mime = head?.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bin = atob(data ?? "");
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
export const toInput = (q: QueuedCleaning, queued: boolean): CleaningInput => {
  const { bathroom_name: _n, photo_before, photo_after, ...rest } = q;
  return { ...rest, photo_before: photo_before ? dataUrlToBlob(photo_before) : null, photo_after: photo_after ? dataUrlToBlob(photo_after) : null, queued };
};

let flushing = false;
type FlushResult = { sent: number; failed: { name: string; message: string }[] };
const listeners = new Set<(r: FlushResult) => void>();
export const onFlushed = (fn: (r: FlushResult) => void) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Tenta enviar a fila. Erros do servidor (4xx) tiram o item da fila e são avisados; falha de rede para e tenta depois. */
export async function flushOutbox() {
  if (flushing || isOffline() || read().length === 0) return;
  flushing = true;
  const result: FlushResult = { sent: 0, failed: [] };
  try {
    for (const item of read()) {
      if (isOffline()) break;
      try {
        await createCleaning(toInput(item, true));
        result.sent++;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) result.failed.push({ name: item.bathroom_name, message: e.message });
        else break;
      }
      write(read().filter((x) => x.idempotency_key !== item.idempotency_key));
    }
  } finally {
    flushing = false;
  }
  if (result.sent || result.failed.length) listeners.forEach((fn) => fn(result));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    window.removeEventListener("storage", cb);
  };
}
const snap = () => `${localStorage.getItem(KEY) ?? "[]"}|${isOffline() ? 1 : 0}`;
export function useOutbox() {
  const s = useSyncExternalStore(subscribe, snap, () => "[]|0");
  const items = (() => { try { return JSON.parse(s.split("|")[0] ?? "[]") as QueuedCleaning[]; } catch { return []; } })();
  return { items, count: items.length, offline: s.endsWith("|1"), simulated: typeof window !== "undefined" && isSimulatedOffline() };
}
