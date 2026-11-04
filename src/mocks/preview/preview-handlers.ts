// Rotas propostas (docs/api-contrato-proposta.md) simuladas com dados de exemplo. Só chamado por src/mocks/index.ts.
import type { DbUser, MockDb } from "../data";
import { handleTicketsAndReview, suggestCategory } from "./preview-tickets";
import {
  type Answer, type PvCleaning, type RawTask, SHIFT_END_LABEL, SHIFT_ORDER, clearPreview, cleanersOf, dayClose, interdicted,
  iso, loadPreview, loadedPreview, opDate, photoSvg, savePreview, shiftAt, shiftWindow, tasksFor,
} from "./preview-data";

export type Body = Record<string, unknown>;
export type Res = { status: number; body: unknown };
export const ok = (data: unknown, status = 200, meta: unknown = null): Res => ({ status, body: { data, meta } });
export const err = (status: number, code: string, message: string, fields: Record<string, string> = {}): Res =>
  ({ status, body: { error: { code, message, fields } } });

export function resetPreviewDb() { clearPreview(); }

const isCur = (r: { starts_on: string; ends_on: string | null }, on: string) => r.starts_on <= on && (r.ends_on === null || r.ends_on >= on);
export function scope(d: MockDb, me: DbUser): Set<number> {
  const day = iso(new Date());
  if (me.role === "admin") return new Set(d.contracts.map((c) => c.id));
  if (me.role === "gestor") return new Set(d.contracts.filter((c) => c.manager_id === me.id).map((c) => c.id));
  if (me.role === "fiscal") return new Set(d.fiscal_links.filter((l) => l.user_id === me.id && isCur(l, day)).map((l) => l.contract_id));
  const teams = d.members.filter((m) => m.user_id === me.id && isCur(m, day)).map((m) => m.team_id);
  return new Set(d.teams.filter((t) => teams.includes(t.id) && t.status === "active").map((t) => t.contract_id));
}
/** Contratos em que a pessoa é membro atual de uma equipe de LIMPEZA. */
export function cleaningContracts(d: MockDb, me: DbUser) {
  const day = opDate(new Date());
  return new Set(d.contracts.filter((c) => cleanersOf(d, c.id, day).includes(me.id)).map((c) => c.id));
}

// ---------- tarefas com status ----------
function taskView(d: MockDb, t: RawTask, cleanings: PvCleaning[], cancelled: string[], now: Date) {
  const done = cleanings.find((c) => c.task_id === t.id && c.status === "valid");
  const [, end] = shiftWindow(t.date, t.shift);
  const status = done ? "done" : cancelled.includes(t.id) || interdicted(d, t.bathroom.id, t.date) ? "cancelled" : now >= dayClose(t.date) ? "not_done" : "pending";
  const loc = d.locations.find((l) => l.id === t.bathroom.location_id)?.name;
  return {
    id: t.id, date: t.date, shift: t.shift, shift_ends_at: SHIFT_END_LABEL[t.shift], status,
    late: status === "pending" && now >= end,
    bathroom: { id: t.bathroom.id, name: t.bathroom.name }, location: loc,
    contract: { id: t.contract.id, code: t.contract.code, name: t.contract.name },
    done_at: done?.registered_at, cleaning_id: done?.id,
  };
}
type TaskView = ReturnType<typeof taskView>;
const sortTasks = (a: TaskView, b: TaskView) =>
  SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift) || a.bathroom.name.localeCompare(b.bathroom.name, "pt-BR") || a.id.localeCompare(b.id);
function nextTask(tasks: TaskView[], now: Date) {
  const pend = tasks.filter((t) => t.status === "pending");
  const current = shiftAt(now);
  return pend.find((t) => t.late) ?? pend.find((t) => t.shift === current) ?? pend[0] ?? null;
}

// ---------- limpezas ----------
export function cleaningView(d: MockDb, c: PvCleaning) {
  const b = d.bathrooms.find((x) => x.id === c.bathroom_id);
  const ct = d.contracts.find((x) => x.id === c.contract_id);
  const u = d.users.find((x) => x.id === c.user_id);
  const shift = c.task_id ? (tasksFor(d, c.task_id.split("-").slice(1, 4).join("-")).find((t) => t.id === c.task_id)?.shift ?? null) : null;
  const marks: string[] = [];
  if (c.repeated_photo) marks.push("repeated_photo");
  if (c.offline) marks.push("offline");
  if (c.out_of_shift) marks.push("out_of_shift");
  if (c.latitude === null && ct?.rules.capture_location) marks.push("no_location");
  return {
    id: c.id,
    bathroom: { id: c.bathroom_id, name: b?.name ?? "—" },
    location: d.locations.find((l) => l.id === b?.location_id)?.name,
    contract: { id: c.contract_id, code: ct?.code ?? "", name: ct?.name ?? "" },
    user: { id: c.user_id, name: u?.name ?? "—" },
    link: c.task_id ? { kind: "task", task_id: c.task_id, shift: shift ?? undefined } : { kind: "extra" },
    registered_at: c.registered_at, client_finished_at: c.client_finished_at,
    marks, status: c.status, cancel_reason: c.cancel_reason ?? undefined,
    photo_before_url: c.photo_before ? photoSvg("Foto antes") : undefined,
    photo_after_url: c.photo_after ? photoSvg("Foto depois") : undefined,
    checklist: c.checklist, notes: c.notes ?? undefined,
    position: c.latitude !== null && c.longitude !== null ? { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy ?? undefined } : undefined,
    ticket_suggestions: c.checklist.filter((i) => i.open_ticket).map((i) => ({ item_id: i.item_id, label: i.label, category: suggestCategory(i.label), description: `Checklist: ${i.label} não OK` })),
    review: c.reviewed_by ? { by: { id: c.reviewed_by, name: d.users.find((x) => x.id === c.reviewed_by)?.name ?? "—" }, at: c.reviewed_at ?? "", outcome: c.review_outcome ?? "ok" } : undefined,
    repeated_with: c.repeated_photo ? pvRepeatedWith(c) : undefined,
    cancel_effect: c.status === "valid" ? cancelEffect(c) : undefined,
  };
}

export function fingerprint(v: unknown): string | null {
  if (typeof Blob !== "undefined" && v instanceof Blob) return v.size > 0 ? `${v.type}:${v.size}` : null;
  if (typeof v === "string" && v.length > 0) return `s:${v.length}:${v.slice(-40)}`;
  return null;
}
export const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function bathroomForCleaning(d: MockDb, me: DbUser, id: number): Res | { b: MockDb["bathrooms"][number]; c: MockDb["contracts"][number] } {
  const b = d.bathrooms.find((x) => x.id === id);
  if (!b || !scope(d, me).has(b.contract_id)) return err(404, "not_found", "Cadastro não encontrado.");
  if (me.role !== "limpeza" || !cleaningContracts(d, me).has(b.contract_id))
    return err(403, "forbidden", "Só quem está numa equipe de limpeza deste contrato pode registrar a limpeza.");
  const c = d.contracts.find((x) => x.id === b.contract_id)!;
  if (b.status !== "active" || c.status !== "active") return err(409, "conflict", "Este banheiro não está ativo. Fale com o seu gestor.");
  return { b, c };
}

export function handlePreview(method: string, path: string, query: URLSearchParams, body: Body, me: DbUser, d: MockDb): Res | null {
  const now = new Date();
  const pv = () => loadPreview(d);

  if (method === "GET" && path === "/me/today") {
    const p = pv();
    const date = opDate(now);
    const ids = me.role === "limpeza" ? cleaningContracts(d, me) : scope(d, me);
    const tasks = tasksFor(d, date, ids).map((t) => taskView(d, t, p.cleanings, p.cancelled_tasks, now)).sort(sortTasks);
    const counted = tasks.filter((t) => t.status !== "cancelled");
    return ok({
      date, now: now.toISOString(), first_name: me.name.split(" ")[0],
      contracts: d.contracts.filter((c) => ids.has(c.id) && c.status === "active").map((c) => ({ id: c.id, code: c.code, name: c.name })),
      summary: { done: counted.filter((t) => t.status === "done").length, total: counted.length },
      next: nextTask(tasks, now), tasks,
    });
  }

  if (method === "GET" && path === "/tasks") {
    const p = pv();
    const date = query.get("date") || opDate(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(422, "validation_failed", "Confira os campos destacados.", { date: "Data inválida." });
    const ids = scope(d, me);
    const cid = num(query.get("contract_id"));
    if (cid !== null) { if (!ids.has(cid)) return err(404, "not_found", "Cadastro não encontrado."); ids.clear(); ids.add(cid); }
    const rows = tasksFor(d, date, ids).map((t) => taskView(d, t, p.cleanings, p.cancelled_tasks, now)).sort(sortTasks);
    return ok(rows, 200, { total: rows.length });
  }

  const form = path.match(/^\/bathrooms\/(\d+)\/cleaning-form$/);
  if (method === "GET" && form) {
    const r = bathroomForCleaning(d, me, Number(form[1]));
    if ("status" in r) return r;
    const { b, c } = r;
    const p = pv();
    const tasks = tasksFor(d, opDate(now), new Set([c.id])).filter((t) => t.bathroom.id === b.id)
      .map((t) => taskView(d, t, p.cleanings, p.cancelled_tasks, now)).sort(sortTasks);
    const current = shiftAt(now);
    const pending = tasks.find((t) => t.status === "pending" && (t.late || t.shift === current)) ?? null;
    return ok({
      bathroom: { id: b.id, name: b.name, location: d.locations.find((l) => l.id === b.location_id)?.name, status: b.status },
      contract: { id: c.id, code: c.code, name: c.name },
      rules: { photo_before: c.rules.photo_before, photo_after: c.rules.photo_after, capture_location: c.rules.capture_location },
      checklist: d.checklist.filter((i) => i.contract_id === c.id && i.active).sort((a, z) => a.position - z.position).map((i) => ({ id: i.id, label: i.label })),
      pending_task: pending,
    });
  }

  if (method === "POST" && path === "/cleanings") {
    const p = pv();
    const key = typeof body["idempotency_key"] === "string" ? body["idempotency_key"] : null;
    if (key) {
      const dup = p.cleanings.find((c) => c.idempotency_key === key);
      if (dup) return ok({ cleaning: cleaningView(d, dup), next: null });
    }
    const bid = num(body["bathroom_id"]);
    if (bid === null) return err(422, "validation_failed", "Confira os campos destacados.", { bathroom_id: "Campo obrigatório." });
    const r = bathroomForCleaning(d, me, bid);
    if ("status" in r) return r;
    const { b, c } = r;
    const fields: Record<string, string> = {};
    const before = c.rules.photo_before === "off" ? null : fingerprint(body["photo_before"]);
    const after = c.rules.photo_after === "off" ? null : fingerprint(body["photo_after"]);
    if (c.rules.photo_before === "required" && !before) fields["photo_before"] = "Tire a foto antes da limpeza. Neste contrato ela é obrigatória.";
    if (c.rules.photo_after === "required" && !after) fields["photo_after"] = "Tire a foto depois da limpeza. Neste contrato ela é obrigatória.";
    const items = d.checklist.filter((i) => i.contract_id === c.id && i.active);
    let answers: { item_id: number; answer: Answer; open_ticket?: boolean }[] = [];
    try {
      const raw = typeof body["checklist"] === "string" ? JSON.parse(body["checklist"]) : body["checklist"];
      if (Array.isArray(raw)) answers = raw as typeof answers;
    } catch { /* inválido = vazio */ }
    const valid = (a: unknown) => a === "ok" || a === "not_ok" || a === "na";
    if (items.some((i) => !answers.some((a) => a.item_id === i.id && valid(a.answer)))) fields["checklist"] = "Responda todos os itens do checklist.";
    if (Object.keys(fields).length) return err(422, "validation_failed", "Confira os campos destacados.", fields);

    // hora oficial = servidor; o vínculo usa a hora em que a pessoa terminou (se for plausível)
    const clientRaw = typeof body["client_finished_at"] === "string" ? new Date(body["client_finished_at"]) : null;
    const client = clientRaw && !Number.isNaN(clientRaw.getTime()) && clientRaw <= now && now.getTime() - clientRaw.getTime() < 24 * 3600000 ? clientRaw : now;
    const offline = body["queued"] === "1" || body["queued"] === true || now.getTime() - client.getTime() > 5 * 60000;
    const date = opDate(client);
    const shiftNow = shiftAt(client);
    const pending = tasksFor(d, date, new Set([c.id])).filter((t) => t.bathroom.id === b.id)
      .map((t) => taskView(d, t, p.cleanings, p.cancelled_tasks, client))
      .filter((t) => t.status === "pending" && (t.shift === shiftNow || t.late)).sort(sortTasks);
    const task = pending.find((t) => t.shift === shiftNow) ?? pending[0] ?? null;
    const prints = p.cleanings.flatMap((x) => [x.photo_before, x.photo_after]).filter(Boolean);
    const repeated = (before !== null && prints.includes(before)) || (after !== null && prints.includes(after)) || (before !== null && before === after);
    const lat = num(body["latitude"]); const lng = num(body["longitude"]);
    const row: PvCleaning = {
      id: p.cleanings.reduce((m, x) => Math.max(m, x.id), 0) + 1, bathroom_id: b.id, contract_id: c.id, user_id: me.id,
      task_id: task?.id ?? null, registered_at: now.toISOString(), client_finished_at: client.toISOString(),
      offline, out_of_shift: !!task && task.shift !== shiftNow, repeated_photo: repeated,
      photo_before: before, photo_after: after,
      checklist: items.sort((a, z) => a.position - z.position).map((i) => {
        const a = answers.find((x) => x.item_id === i.id)!;
        return { item_id: i.id, label: i.label, answer: a.answer, open_ticket: a.answer === "not_ok" && !!a.open_ticket };
      }),
      notes: typeof body["notes"] === "string" && body["notes"].trim() ? body["notes"].trim() : null,
      latitude: lat !== null && lng !== null ? lat : null, longitude: lat !== null && lng !== null ? lng : null,
      accuracy: lat !== null && lng !== null ? num(body["accuracy"]) : null,
      status: "valid", cancel_reason: null, idempotency_key: key, reviewed_by: null, reviewed_at: null, review_outcome: null,
    };
    p.cleanings.push(row);
    savePreview();
    const ids = cleaningContracts(d, me);
    const today = tasksFor(d, opDate(now), ids).map((t) => taskView(d, t, p.cleanings, p.cancelled_tasks, now)).sort(sortTasks);
    return ok({ cleaning: cleaningView(d, row), next: nextTask(today, now) }, 201);
  }

  if (method === "GET" && path === "/me/cleanings") {
    const p = pv();
    const rows = p.cleanings.filter((c) => c.user_id === me.id).sort((a, b) => b.registered_at.localeCompare(a.registered_at)).slice(0, 100);
    return ok(rows.map((c) => cleaningView(d, c)), 200, { total: rows.length });
  }

  const one = path.match(/^\/cleanings\/(\d+)$/);
  if (method === "GET" && one) {
    const c = pv().cleanings.find((x) => x.id === Number(one[1]));
    const visible = c && (me.role === "limpeza" ? c.user_id === me.id || cleaningContracts(d, me).has(c.contract_id) : scope(d, me).has(c.contract_id));
    if (!c || !visible) return err(404, "not_found", "Cadastro não encontrado.");
    return ok(cleaningView(d, c));
  }
  return handleTicketsAndReview(method, path, query, body, me, d);
}

/** Outra limpeza com a mesma foto (para "Foto repetida"). */
function pvRepeatedWith(c: PvCleaning) {
  const p = loadedPreview();
  if (!p) return undefined;
  const prints = [c.photo_before, c.photo_after].filter(Boolean);
  return p.cleanings.find((x) => x.id !== c.id && [x.photo_before, x.photo_after].some((f) => f && prints.includes(f)))?.id;
}
/** O que acontece com a tarefa se a limpeza for cancelada. */
function cancelEffect(c: PvCleaning) {
  if (!c.task_id) return { kind: "extra" as const };
  const date = c.task_id.split("-").slice(1, 4).join("-");
  return { kind: new Date() >= dayClose(date) ? ("not_done" as const) : ("pending" as const), task_date: date };
}
