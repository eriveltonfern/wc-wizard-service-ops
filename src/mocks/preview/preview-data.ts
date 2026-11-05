// Dados de EXEMPLO do protótipo (rotas que a API real ainda não tem). Separados dos dados de teste:
// ficam em localStorage "wccheck.previewdb" e são gerados a partir dos contratos, banheiros e equipes do mock principal.
import type { MockDb, DbBathroom, DbContract } from "../data";

export type Answer = "ok" | "not_ok" | "na";
export type PvCleaning = {
  id: number; bathroom_id: number; contract_id: number; user_id: number; task_id: string | null;
  registered_at: string; client_finished_at: string; offline: boolean; out_of_shift: boolean; repeated_photo: boolean;
  photo_before: string | null; photo_after: string | null; // impressão digital da foto (para "Foto repetida")
  checklist: { item_id: number; label: string; answer: Answer; open_ticket: boolean }[];
  notes: string | null;
  status: "valid" | "cancelled"; cancel_reason: string | null; idempotency_key: string | null;
  reviewed_by: number | null; reviewed_at: string | null; review_outcome: "ok" | "cancelled" | null;
  photo_deleted_at?: string | null;
};
export type TicketCategory = "hidraulica" | "eletrica" | "estrutura" | "abastecimento" | "outros";
export type TicketPriority = "baixa" | "normal" | "urgente";
export type TicketStatus = "open" | "in_progress" | "done" | "cancelled";
export type TicketEventKind = "opened" | "assigned" | "taken" | "started" | "done" | "cancelled" | "comment" | "priority";
export type PvTicket = {
  id: number; contract_id: number; bathroom_id: number; category: TicketCategory; priority: TicketPriority; status: TicketStatus;
  description: string; opened_by: number; opened_at: string; assignee_id: number | null; started_at: string | null;
  done_at: string | null; done_note: string | null; cancel_reason: string | null; cleaning_id: number | null;
  photo_open: string | null; photo_done: string | null; idempotency_key: string | null; photo_deleted_at?: string | null;
  events: { id: number; kind: TicketEventKind; actor_id: number; at: string; text: string | null }[];
};
export type PvClosing = {
  id: number; contract_id: number; month: string; status: "closed" | "open"; totals: import("./preview-reports").Totals;
  closed_at: string; closed_by: number; reopenings: { at: string; by: number; reason: string }[];
};
export type RatingProblem = "sujo" | "sem_papel" | "sem_sabonete" | "mau_cheiro" | "lixo_cheio" | "vazamento" | "outro";
export type PvRating = { id: number; bathroom_id: number; score: number; problems: RatingProblem[]; comment: string | null; created_at: string; device_key: string };
export type PreviewDb = { version: number; generated_on: string; cleanings: PvCleaning[]; cancelled_tasks: string[]; tickets: PvTicket[]; closings: PvClosing[]; ratings: PvRating[] };

/** Dias de histórico nos dados de exemplo e prazo de guarda das fotos. */
export const HISTORY_DAYS = 90;
export const PHOTO_DAYS = 60;

const KEY = "wccheck.previewdb";
const VERSION = 4;
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
/**
 * Quem pode limpar este banheiro (regra do contrato):
 * "all" = qualquer pessoa ativa da limpeza que esteja numa equipe de limpeza do contrato; "assigned" = só as pessoas marcadas no banheiro.
 */
export function canClean(d: MockDb, userId: number, b: DbBathroom, c: DbContract) {
  const u = d.users.find((x) => x.id === userId);
  if (!u || u.role !== "limpeza" || u.status !== "active") return false;
  if (c.rules.cleaning_access === "assigned") return (d.bathroom_cleaners ?? []).some((x) => x.bathroom_id === b.id && x.user_id === userId);
  return cleanersOf(d, c.id, opDate(new Date())).includes(userId);
}
/** Pessoas que limpam o banheiro nos dados de exemplo (equipe do contrato, filtrada pela regra de acesso). */
function workersFor(d: MockDb, b: DbBathroom, c: DbContract, date: string) {
  const team = cleanersOf(d, c.id, date);
  if (c.rules.cleaning_access !== "assigned") return team;
  return (d.bathroom_cleaners ?? []).filter((x) => x.bathroom_id === b.id).map((x) => x.user_id);
}
/** Rotina diária do servidor: apaga os arquivos de foto com mais de 60 dias e grava photo_deleted_at. */
export function purgePhotos(p: PreviewDb, now = new Date()) {
  const limit = now.getTime() - PHOTO_DAYS * 86400000;
  for (const c of p.cleanings) if (!c.photo_deleted_at && new Date(c.registered_at).getTime() < limit && (c.photo_before || c.photo_after)) c.photo_deleted_at = now.toISOString();
  for (const t of p.tickets) if (!t.photo_deleted_at && new Date(t.opened_at).getTime() < limit && (t.photo_open || t.photo_done)) t.photo_deleted_at = now.toISOString();
}
/** Data até quando as fotos ficam disponíveis. */
export const photosUntil = (registeredAt: string) => iso(new Date(new Date(registeredAt).getTime() + PHOTO_DAYS * 86400000));

// ---------- fotos de exemplo (SVG gerado aqui, nada da internet) ----------
export function photoSvg(label: string) {
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

export function generate(d: MockDb, now = new Date()): PreviewDb {
  const today = opDate(now);
  const r = rng(Number(today.replace(/-/g, "")));
  const cleanings: PvCleaning[] = [];
  const cancelled: string[] = [];
  const checklistOf = (cid: number) => d.checklist.filter((i) => i.contract_id === cid && i.active).sort((a, b) => a.position - b.position);
  let fp = 0;
  const add = (t: { bathroom: DbBathroom; contract: DbContract }, user: number, when: Date, task: string | null, outOfShift: boolean) => {
    const offline = r() < 0.04;
    const same = cleanings.filter((x) => x.contract_id === t.contract.id && x.photo_before);
    const repeated = r() < 0.025 && same.length > 0;
    const prev = repeated ? same[Math.floor(r() * same.length)]! : null;
    const before = t.contract.rules.photo_before === "optional" && r() < 0.15 ? null : prev?.photo_before ?? `ex-${++fp}`;
    const after = t.contract.rules.photo_after === "optional" && r() < 0.15 ? null : `ex-${++fp}`;
    const cancelledByManager = r() < 0.015;
    const client = offline ? new Date(when.getTime() - (40 + Math.floor(r() * 140)) * 60000) : new Date(when.getTime() - Math.floor(r() * 50) * 1000);
    cleanings.push({
      id: cleanings.length + 1, bathroom_id: t.bathroom.id, contract_id: t.contract.id, user_id: user,
      task_id: cancelledByManager ? null : task, registered_at: when.toISOString(), client_finished_at: client.toISOString(),
      offline, out_of_shift: outOfShift, repeated_photo: repeated,
      photo_before: before, photo_after: after,
      checklist: checklistOf(t.contract.id).map((i) => ({ item_id: i.id, label: i.label, answer: r() < 0.05 ? "not_ok" : r() < 0.03 ? "na" : "ok", open_ticket: false })),
      notes: r() < 0.08 ? "Faltou papel toalha no dispenser." : null,
      status: cancelledByManager ? "cancelled" : "valid", cancel_reason: cancelledByManager ? CANCEL_REASONS[Math.floor(r() * CANCEL_REASONS.length)]! : null, idempotency_key: null,
      reviewed_by: null, reviewed_at: null, review_outcome: null,
    });
  };

  for (let back = HISTORY_DAYS; back >= 0; back--) {
    const date = addDays(today, -back);
    for (const t of tasksFor(d, date)) {
      const people = workersFor(d, t.bathroom, t.contract, date);
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
      const bx = bs[Math.floor(r() * Math.max(1, bs.length))];
      const people = bx ? workersFor(d, bx, c, date) : [];
      if (!bx || !people.length) continue;
      add({ bathroom: bx, contract: c }, people[Math.floor(r() * people.length)]!, atHour(date, 9 + Math.floor(r() * 8), Math.floor(r() * 60)), null, false);
    }
  }
  cleanings.sort((a, b) => a.registered_at.localeCompare(b.registered_at)).forEach((c, i) => (c.id = i + 1));
  markReviews(d, cleanings);
  const out: PreviewDb = { version: VERSION, generated_on: today, cleanings, cancelled_tasks: cancelled, tickets: genTickets(d, now, r), closings: [], ratings: genRatings(d, now, r) };
  purgePhotos(out, now);
  return out;
}

/** Deixa ~8 limpezas com marca para conferir (espalhadas por contrato e marca); as demais já foram conferidas pelo gestor. */
function markReviews(d: MockDb, cleanings: PvCleaning[]) {
  const flagOf = (c: PvCleaning) => (c.repeated_photo ? "r" : c.offline ? "o" : c.out_of_shift ? "s" : null);
  const marked = cleanings.filter((c) => c.status === "valid" && flagOf(c)).reverse();
  const buckets = new Map<string, PvCleaning[]>();
  for (const c of marked) { const k = `${c.contract_id}-${flagOf(c)}`; buckets.set(k, [...(buckets.get(k) ?? []), c]); }
  const keep = new Set<number>();
  for (let round = 0; keep.size < 8 && round < 10; round++)
    for (const list of buckets.values()) { if (keep.size >= 8) break; const c = list[round]; if (c) keep.add(c.id); }
  for (const c of marked) {
    if (keep.has(c.id)) continue;
    c.reviewed_by = d.contracts.find((x) => x.id === c.contract_id)?.manager_id ?? 1;
    c.reviewed_at = new Date(new Date(c.registered_at).getTime() + 20 * 3600000).toISOString();
    c.review_outcome = "ok";
  }
}

const TICKET_SAMPLES: [TicketCategory, TicketPriority, string][] = [
  ["hidraulica", "urgente", "Vaso sanitário entupido."],
  ["estrutura", "urgente", "Porta da cabine não tranca."],
  ["eletrica", "normal", "Lâmpada queimada sobre a pia."],
  ["abastecimento", "normal", "Dispenser de papel toalha quebrado."],
  ["hidraulica", "normal", "Torneira da pia pingando sem parar."],
  ["outros", "urgente", "Mau cheiro forte vindo do ralo."],
  ["estrutura", "baixa", "Azulejo solto atrás do vaso."],
  ["eletrica", "baixa", "Tomada do secador de mãos sem energia."],
  ["abastecimento", "normal", "Saboneteira sem refil há dois dias."],
  ["outros", "baixa", "Espelho riscado."],
  ["hidraulica", "normal", "Descarga não para de correr água."],
  ["estrutura", "normal", "Trinco da porta principal solto."],
  ["eletrica", "urgente", "Fio exposto perto do interruptor."],
  ["hidraulica", "baixa", "Ralo do piso escoando devagar."],
  ["abastecimento", "baixa", "Lixeira sem tampa."],
];
const DONE_NOTES = ["Troquei a peça e testei. Funcionando.", "Desentupido com sonda. Banheiro liberado.", "Lâmpada trocada por LED.", "Ajustei o trinco e lubrifiquei a dobradiça."];

/** Chamados de exemplo: abertos, em andamento, concluídos nos últimos 7 dias e um cancelado. */
function genTickets(d: MockDb, now: Date, r: () => number): PvTicket[] {
  const today = iso(now);
  const maint = (cid: number) => {
    const teams = d.teams.filter((t) => t.contract_id === cid && t.kind === "manutencao" && t.status === "active").map((t) => t.id);
    return d.members.filter((m) => teams.includes(m.team_id) && isCurrent(m, today)).map((m) => m.user_id);
  };
  // [contrato, status, horas atrás]
  const plan: [number, TicketStatus, number][] = [
    [1, "open", 1.2], [1, "open", 5], [3, "open", 3], [2, "open", 26], [1, "open", 50],
    [1, "in_progress", 3.5], [3, "in_progress", 7], [1, "in_progress", 22],
    [1, "done", 30], [1, "done", 70], [3, "done", 52], [3, "done", 120], [1, "done", 150],
    [1, "cancelled", 40], [1, "done", 240], [3, "done", 24 * 75],
  ];
  const out: PvTicket[] = [];
  plan.forEach(([cid, status, hoursAgo], i) => {
    const c = d.contracts.find((x) => x.id === cid && x.status === "active");
    const bs = d.bathrooms.filter((b) => b.contract_id === cid && b.status === "active");
    if (!c || !bs.length) return;
    const [category, priority, description] = TICKET_SAMPLES[i % TICKET_SAMPLES.length]!;
    const cleaners = cleanersOf(d, cid, today);
    const opener = i % 3 === 2 || !cleaners.length ? c.manager_id ?? 1 : cleaners[i % cleaners.length]!;
    const techs = maint(cid);
    const tech = techs.length ? techs[i % techs.length]! : null;
    const t0 = new Date(now.getTime() - hoursAgo * 3600000);
    const at = (h: number) => new Date(t0.getTime() + h * 3600000).toISOString();
    let ev = 0;
    const events: PvTicket["events"] = [{ id: ++ev, kind: "opened", actor_id: opener, at: t0.toISOString(), text: null }];
    const tk: PvTicket = {
      id: i + 1, contract_id: cid, bathroom_id: bs[(i * 7) % bs.length]!.id, category, priority, status, description,
      opened_by: opener, opened_at: t0.toISOString(), assignee_id: null, started_at: null, done_at: null, done_note: null,
      cancel_reason: null, cleaning_id: null, photo_open: r() < 0.75 ? `tk-open-${i}` : null, photo_done: null, idempotency_key: null, events,
    };
    if ((status === "in_progress" || status === "done") && tech) {
      const s = Math.min(hoursAgo * 0.3, 2);
      if (i % 2 === 0 && c.manager_id) events.push({ id: ++ev, kind: "assigned", actor_id: c.manager_id, at: at(s * 0.5), text: d.users.find((u) => u.id === tech)?.name ?? null });
      else events.push({ id: ++ev, kind: "taken", actor_id: tech, at: at(s * 0.9), text: null });
      events.push({ id: ++ev, kind: "started", actor_id: tech, at: at(s), text: null });
      tk.assignee_id = tech; tk.started_at = at(s);
      if (status === "done") {
        const dur = 0.8 + r() * 6;
        tk.done_at = at(s + dur); tk.done_note = DONE_NOTES[i % DONE_NOTES.length]!; tk.photo_done = `tk-done-${i}`;
        events.push({ id: ++ev, kind: "done", actor_id: tech, at: tk.done_at, text: tk.done_note });
      }
    } else if (status === "in_progress" || status === "done") {
      tk.status = "open";
    }
    if (status === "open" && i === 1 && c.manager_id) events.push({ id: ++ev, kind: "comment", actor_id: c.manager_id, at: at(0.5), text: "Prioridade para antes da troca de turno." });
    if (status === "cancelled") {
      tk.cancel_reason = "Problema já resolvido pela equipe do cliente.";
      events.push({ id: ++ev, kind: "cancelled", actor_id: c.manager_id ?? 1, at: at(3), text: tk.cancel_reason });
    }
    out.push(tk);
  });
  return out;
}

const PROBLEMS: RatingProblem[] = ["sujo", "sem_papel", "sem_sabonete", "mau_cheiro", "lixo_cheio", "vazamento", "outro"];
const COMMENTS = ["Faltou papel na cabine do meio.", "Piso molhado perto da pia.", "Cheiro forte no fim da tarde.", "Torneira vazando.", "Lixeira transbordando."];
/** ~200 avaliações do cliente espalhadas nos últimos 90 dias, nos banheiros de contratos ativos. */
function genRatings(d: MockDb, now: Date, r: () => number): PvRating[] {
  const bs = d.bathrooms.filter((b) => b.status === "active" && d.contracts.find((c) => c.id === b.contract_id)?.status === "active");
  if (!bs.length) return [];
  const out: PvRating[] = [];
  for (let i = 0; i < 200; i++) {
    const b = bs[Math.floor(r() * bs.length)]!;
    // alguns banheiros têm nota pior, para o ranking fazer sentido
    const bias = b.id % 4 === 2 ? -1.3 : b.id % 5 === 0 ? -0.6 : 0;
    const score = Math.max(1, Math.min(5, Math.round(4.1 + bias + (r() - 0.5) * 3)));
    const problems = score <= 3 ? PROBLEMS.filter(() => r() < 0.22).slice(0, 3) : [];
    if (score <= 3 && !problems.length) problems.push(PROBLEMS[Math.floor(r() * 5)]!);
    const hoursAgo = i < 4 ? 2 + i * 4 : r() * HISTORY_DAYS * 24;
    out.push({ id: 0, bathroom_id: b.id, score: i < 4 ? 1 + (i % 2) : score, problems: i < 4 ? [i % 2 ? "vazamento" : "sujo"] : problems,
      comment: r() < 0.3 || i < 4 ? (score >= 4 && i >= 4 ? "Muito limpo, parabéns!" : COMMENTS[Math.floor(r() * COMMENTS.length)]!) : null,
      created_at: new Date(now.getTime() - hoursAgo * 3600000).toISOString(), device_key: `ex-${i}` });
  }
  return out.sort((a, z) => a.created_at.localeCompare(z.created_at)).map((x, i) => ({ ...x, id: i + 1 }));
}

export const loadedPreview = () => pdb;

export function loadPreview(d: MockDb): PreviewDb {
  const today = opDate(new Date());
  if (pdb && pdb.generated_on === today) return pdb;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as PreviewDb) : null;
    pdb = parsed && parsed.version === VERSION && parsed.generated_on === today ? parsed : { ...generate(d), closings: parsed?.version === VERSION ? parsed.closings : [] };
  } catch {
    pdb = generate(d);
  }
  pdb.ratings ??= [];
  purgePhotos(pdb);
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
