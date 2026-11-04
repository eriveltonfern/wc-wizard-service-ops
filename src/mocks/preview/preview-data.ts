// Dados de EXEMPLO do protótipo (rotas que a API real ainda não tem). Separados dos dados de teste:
// ficam em localStorage "wccheck.previewdb" e são gerados a partir dos contratos, banheiros e equipes do mock principal.
import type { MockDb, DbBathroom, DbContract } from "../data";

export type Answer = "ok" | "not_ok" | "na";
export type PvCleaning = {
  id: number; bathroom_id: number; contract_id: number; user_id: number; task_id: string | null;
  registered_at: string; client_finished_at: string; offline: boolean; out_of_shift: boolean; repeated_photo: boolean;
  photo_before: string | null; photo_after: string | null; // impressão digital da foto (para "Foto repetida")
  checklist: { item_id: number; label: string; answer: Answer; open_ticket: boolean }[];
  notes: string | null; latitude: number | null; longitude: number | null; accuracy: number | null;
  status: "valid" | "cancelled"; cancel_reason: string | null; idempotency_key: string | null;
};
export type PreviewDb = { version: number; generated_on: string; cleanings: PvCleaning[]; cancelled_tasks: string[] };

const KEY = "wccheck.previewdb";
const VERSION = 1;
let pdb: PreviewDb | null = null;

// ---------- datas e turnos (hora oficial = relógio deste "servidor") ----------
export const SHIFT_ORDER = ["manha", "tarde", "noite"] as const;
export type ShiftKey = (typeof SHIFT_ORDER)[number];
const SHIFT_HOURS: Record<ShiftKey, [number, number]> = { manha: [6, 12], tarde: [12, 18], noite: [18, 30] };
export const SHIFT_END_LABEL: Record<ShiftKey, string> = { manha: "11:59", tarde: "17:59", noite: "05:59" };

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const atHour = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y!, mo! - 1, d!, h, m);
};
export const addDays = (date: string, n: number) => { const x = atHour(date, 12); x.setDate(x.getDate() + n); return iso(x); };
/** Dia operacional: a noite (18:00–05:59) conta para o dia em que começou. */
export const opDate = (t: Date) => (t.getHours() < 6 ? addDays(iso(t), -1) : iso(t));
export const shiftWindow = (date: string, s: ShiftKey) => [atHour(date, SHIFT_HOURS[s][0]), atHour(date, SHIFT_HOURS[s][1])] as const;
export const dayClose = (date: string) => atHour(date, 30);
export const shiftAt = (t: Date): ShiftKey => { const h = t.getHours(); return h >= 6 && h < 12 ? "manha" : h >= 12 && h < 18 ? "tarde" : "noite"; };
const weekday = (date: string) => ((atHour(date, 12).getDay() + 6) % 7) + 1; // 1 = segunda ... 7 = domingo
const isCurrent = (r: { starts_on: string; ends_on: string | null }, on: string) => r.starts_on <= on && (r.ends_on === null || r.ends_on >= on);

// ---------- tarefas (calculadas do plano efetivo) ----------
export type RawTask = { id: string; bathroom: DbBathroom; contract: DbContract; date: string; shift: ShiftKey; n: number };

export function planOf(b: DbBathroom, c: DbContract) {
  return { per_day: b.cleanings_per_day ?? c.rules.default_cleanings_per_day, weekdays: b.weekdays ?? c.rules.default_weekdays };
}
export function tasksFor(d: MockDb, date: string, contractIds?: Set<number>): RawTask[] {
  const out: RawTask[] = [];
  for (const c of d.contracts) {
    if (c.status !== "active" || (contractIds && !contractIds.has(c.id))) continue;
    if (c.starts_on > date || (c.ends_on && c.ends_on < date)) continue;
    const shifts = SHIFT_ORDER.filter((s) => c.rules.shifts.includes(s));
    if (!shifts.length) continue;
    for (const b of d.bathrooms) {
      if (b.contract_id !== c.id || b.status !== "active") continue;
      const plan = planOf(b, c);
      if (!plan.weekdays.includes(weekday(date)) || plan.per_day < 1) continue;
      for (let i = 0; i < plan.per_day; i++) {
        const shift = shifts[Math.floor((i * shifts.length) / plan.per_day)]!;
        out.push({ id: `${b.id}-${date}-${i + 1}`, bathroom: b, contract: c, date, shift, n: i + 1 });
      }
    }
  }
  return out;
}
export function interdicted(d: MockDb, bathroomId: number, date: string) {
  return d.status_periods.some((p) => p.bathroom_id === bathroomId && p.starts_on <= date && p.ends_on >= date);
}
export function cleanersOf(d: MockDb, contractId: number, date: string) {
  const teams = d.teams.filter((t) => t.contract_id === contractId && t.kind === "limpeza" && t.status === "active").map((t) => t.id);
  return [...new Set(d.members.filter((m) => teams.includes(m.team_id) && isCurrent(m, date)).map((m) => m.user_id))];
}

// ---------- fotos de exemplo (SVG gerado aqui, nada da internet) ----------
export function photoSvg(label: "Foto antes" | "Foto depois") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
<rect width="480" height="360" fill="#D5DAE2"/>
<rect x="190" y="120" width="100" height="72" rx="10" fill="#8A94A6"/><rect x="215" y="108" width="50" height="16" rx="4" fill="#8A94A6"/>
<circle cx="240" cy="156" r="22" fill="#D5DAE2"/><circle cx="240" cy="156" r="13" fill="#8A94A6"/>
<text x="240" y="240" font-family="Inter,Arial,sans-serif" font-size="26" font-weight="700" fill="#4A5465" text-anchor="middle">${label}</text>
<text x="240" y="270" font-family="Inter,Arial,sans-serif" font-size="14" fill="#5B6577" text-anchor="middle">Imagem de exemplo</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------- geração de 30 dias de histórico ----------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const between = (r: () => number, a: Date, b: Date) => new Date(a.getTime() + Math.floor(r() * Math.max(0, b.getTime() - a.getTime())));
const CANCEL_REASONS = ["Foto não mostra o banheiro correto.", "Registro duplicado pela equipe.", "Banheiro estava interditado nesse horário."];
const BASE_POINT: Record<number, [number, number]> = { 1: [-19.619, -43.226], 2: [-19.631, -43.212], 3: [-19.921, -43.938] };

export function generate(d: MockDb, now = new Date()): PreviewDb {
  const today = opDate(now);
  const r = rng(Number(today.replace(/-/g, "")));
  const cleanings: PvCleaning[] = [];
  const cancelled: string[] = [];
  const checklistOf = (cid: number) => d.checklist.filter((i) => i.contract_id === cid && i.active).sort((a, b) => a.position - b.position);
  let fp = 0;
  const add = (t: { bathroom: DbBathroom; contract: DbContract }, user: number, when: Date, task: string | null, outOfShift: boolean) => {
    const offline = r() < 0.04;
    const repeated = r() < 0.025 && cleanings.length > 0;
    const prev = repeated ? cleanings[Math.floor(r() * cleanings.length)]! : null;
    const before = t.contract.rules.photo_before === "off" ? null : prev?.photo_before ?? `ex-${++fp}`;
    const after = t.contract.rules.photo_after === "off" || (t.contract.rules.photo_after === "optional" && r() < 0.15) ? null : `ex-${++fp}`;
    const hasLoc = t.contract.rules.capture_location && r() < 0.88;
    const base = BASE_POINT[t.contract.id] ?? [-19.9, -43.9];
    const cancelledByManager = r() < 0.015;
    const client = offline ? new Date(when.getTime() - (40 + Math.floor(r() * 140)) * 60000) : new Date(when.getTime() - Math.floor(r() * 50) * 1000);
    cleanings.push({
      id: cleanings.length + 1, bathroom_id: t.bathroom.id, contract_id: t.contract.id, user_id: user,
      task_id: cancelledByManager ? null : task, registered_at: when.toISOString(), client_finished_at: client.toISOString(),
      offline, out_of_shift: outOfShift, repeated_photo: repeated,
      photo_before: before, photo_after: after,
      checklist: checklistOf(t.contract.id).map((i) => ({ item_id: i.id, label: i.label, answer: r() < 0.05 ? "not_ok" : r() < 0.03 ? "na" : "ok", open_ticket: false })),
      notes: r() < 0.08 ? "Faltou papel toalha no dispenser." : null,
      latitude: hasLoc ? base[0] + (r() - 0.5) * 0.002 : null, longitude: hasLoc ? base[1] + (r() - 0.5) * 0.002 : null, accuracy: hasLoc ? Math.round(5 + r() * 25) : null,
      status: cancelledByManager ? "cancelled" : "valid", cancel_reason: cancelledByManager ? CANCEL_REASONS[Math.floor(r() * CANCEL_REASONS.length)]! : null, idempotency_key: null,
    });
  };

  for (let back = 30; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const t of tasksFor(d, date)) {
      const people = cleanersOf(d, t.contract.id, date);
      if (!people.length || interdicted(d, t.bathroom.id, date)) continue;
      const who = people[Math.floor(r() * people.length)]!;
      const [s, e] = shiftWindow(date, t.shift);
      const close = dayClose(date);
      if (close <= now) { // dia já fechado
        const x = r();
        if (x < 0.8) add(t, who, between(r, s, new Date(e.getTime() - 60000)), t.id, false);
        else if (x < 0.88) add(t, who, between(r, e, new Date(Math.min(close.getTime(), e.getTime() + 4 * 3600000) - 60000)), t.id, true);
        else if (x > 0.975) cancelled.push(t.id);
      } else if (e <= now) { // turno já passou hoje
        if (r() < 0.85) add(t, who, between(r, s, new Date(e.getTime() - 60000)), t.id, false);
      } else if (s <= now) { // turno atual
        if (r() < 0.35) add(t, who, between(r, s, now), t.id, false);
      }
    }
    // limpezas extras ocasionais
    if (back > 0) for (const c of d.contracts.filter((x) => x.status === "active")) {
      if (r() > 0.12) continue;
      const bs = d.bathrooms.filter((b) => b.contract_id === c.id && b.status === "active");
      const people = cleanersOf(d, c.id, date);
      if (!bs.length || !people.length) continue;
      add({ bathroom: bs[Math.floor(r() * bs.length)]!, contract: c }, people[Math.floor(r() * people.length)]!, atHour(date, 9 + Math.floor(r() * 8), Math.floor(r() * 60)), null, false);
    }
  }
  cleanings.sort((a, b) => a.registered_at.localeCompare(b.registered_at)).forEach((c, i) => (c.id = i + 1));
  return { version: VERSION, generated_on: today, cleanings, cancelled_tasks: cancelled };
}

export function loadPreview(d: MockDb): PreviewDb {
  const today = opDate(new Date());
  if (pdb && pdb.generated_on === today) return pdb;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as PreviewDb) : null;
    pdb = parsed && parsed.version === VERSION && parsed.generated_on === today ? parsed : generate(d);
  } catch {
    pdb = generate(d);
  }
  savePreview();
  return pdb;
}
export function savePreview() {
  if (pdb && typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(pdb));
}
export function clearPreview() {
  pdb = null;
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}
