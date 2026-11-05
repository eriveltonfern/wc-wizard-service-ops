// Fila de limpezas guardadas no aparelho enquanto não há internet. Envia pelo endpoints.ts quando a conexão volta.
import { useSyncExternalStore } from "react";
import { ApiError, USE_MOCKS } from "./api";
import { createCleaning, finishTicket, startTicket } from "./endpoints";
import type { CleaningInput } from "./types";

const KEY = "wccheck.outbox";
const SIM_KEY = "wccheck.simOffline";
const EVT = "wccheck-outbox";

export type QueuedCleaning = Omit<CleaningInput, "photo_before" | "photo_after" | "queued"> & {
  kind?: "cleaning" | undefined;
  bathroom_name: string; photo_before?: string | undefined; photo_after?: string | undefined; // fotos em data URL
};
/** Ações de chamado da manutenção guardadas sem internet. */
export type QueuedTicket = {
  kind: "ticket_start" | "ticket_done"; ticket_id: number; label: string; idempotency_key: string; client_at: string;
  note?: string | undefined; photo?: string | undefined;
};
export type QueuedItem = QueuedCleaning | QueuedTicket;
export const isQueuedCleaning = (x: QueuedItem): x is QueuedCleaning => x.kind === undefined || x.kind === "cleaning";

// Guardado em IndexedDB (API nativa). A lista fica num cache em memória para a interface ler de forma síncrona.
const DB_NAME = "wccheck";
const STORE = "outbox";
export const STORAGE_ERROR = "Não foi possível guardar no celular. Libere espaço ou conecte à internet para enviar.";
export class OutboxStorageError extends Error { constructor() { super(STORAGE_ERROR); } }

let cache: QueuedItem[] = [];
let version = 0;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("sem IndexedDB");
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "idempotency_key" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
    } catch (e) { reject(e); }
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r ? r.result : undefined);
    t.onerror = () => reject(t.error ?? new Error("IndexedDB"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB"));
  }));
}
function changed() {
  version++;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}
/** Recarrega o cache do IndexedDB e migra os itens do localStorage antigo. */
async function load() {
  try {
    const legacy = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedItem[]; } catch { return []; } })();
    if (legacy.length) {
      await tx("readwrite", (st) => { legacy.forEach((x) => st.put(x)); });
      localStorage.removeItem(KEY);
    }
    const all = (await tx<QueuedItem[]>("readonly", (st) => st.getAll() as IDBRequest<QueuedItem[]>)) ?? [];
    all.sort((a, b) => (("client_finished_at" in a ? a.client_finished_at : a.client_at) ?? "").localeCompare(("client_finished_at" in b ? b.client_finished_at : b.client_at) ?? ""));
    cache = all;
  } catch { /* sem IndexedDB: a fila fica vazia e enqueue avisa o erro */ }
  changed();
}
const ready: Promise<void> = typeof window === "undefined" ? Promise.resolve() : load();
const read = () => cache;

async function add(item: QueuedItem) {
  try { await tx("readwrite", (st) => { st.put(item); }); }
  catch { throw new OutboxStorageError(); }
  cache = [...cache.filter((x) => x.idempotency_key !== item.idempotency_key), item];
  changed();
}
async function remove(key: string) {
  try { await tx("readwrite", (st) => { st.delete(key); }); } catch { /* tenta de novo no próximo envio */ return; }
  cache = cache.filter((x) => x.idempotency_key !== key);
  changed();
}

export const isSimulatedOffline = () => USE_MOCKS && typeof window !== "undefined" && localStorage.getItem(SIM_KEY) === "1";
export const isOffline = () => typeof navigator !== "undefined" && (!navigator.onLine || isSimulatedOffline());
export function setSimulatedOffline(on: boolean) {
  if (on) localStorage.setItem(SIM_KEY, "1"); else localStorage.removeItem(SIM_KEY);
  changed();
  if (!on) void flushOutbox();
}
/** Guarda no aparelho. Se não der para gravar, rejeita com OutboxStorageError (mensagem STORAGE_ERROR). */
export function enqueueCleaning(item: QueuedCleaning) { return add(item); }
export function enqueueTicketAction(item: QueuedTicket) { return add(item); }

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
  await ready;
  if (flushing || isOffline() || read().length === 0) return;
  flushing = true;
  const result: FlushResult = { sent: 0, failed: [] };
  try {
    for (const item of [...read()]) {
      if (isOffline()) break;
      try {
        if (isQueuedCleaning(item)) await createCleaning(toInput(item, true));
        else if (item.kind === "ticket_start") await startTicket(item.ticket_id, item.idempotency_key);
        else await finishTicket(item.ticket_id, { note: item.note ?? "", photo: item.photo ? dataUrlToBlob(item.photo) : null, idempotency_key: item.idempotency_key });
        result.sent++;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) result.failed.push({ name: isQueuedCleaning(item) ? item.bathroom_name : item.label, message: e.message });
        else break;
      }
      await remove(item.idempotency_key);
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
const snap = () => `${version}|${isOffline() ? 1 : 0}`;
export function useOutbox() {
  const s = useSyncExternalStore(subscribe, snap, () => "0|0");
  const items = typeof window === "undefined" ? [] : cache;
  return { items, count: items.length, offline: s.endsWith("|1"), simulated: typeof window !== "undefined" && isSimulatedOffline() };
}
