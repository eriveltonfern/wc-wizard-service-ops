// Chamados e Conferência (rotas propostas). Só chamado por preview-handlers.ts.
import type { DbUser, MockDb } from "../data";
import {
  type PvTicket, type TicketCategory, type TicketPriority,
  addDays, iso, loadPreview, opDate, photoSvg, savePreview,
} from "./preview-data";
import { isClosed } from "./preview-reports";
import { type Body, type Res, cleaningContracts, cleaningView, err, fingerprint, num, ok, scope } from "./preview-handlers";

const CATEGORIES: TicketCategory[] = ["hidraulica", "eletrica", "estrutura", "abastecimento", "outros"];
const PRIORITIES: TicketPriority[] = ["baixa", "normal", "urgente"];
const PRIORITY_LABEL: Record<TicketPriority, string> = { baixa: "Baixa", normal: "Normal", urgente: "Urgente" };
const DAY = 24 * 3600000;

/** Categoria sugerida a partir do item do checklist. */
export function suggestCategory(label: string): TicketCategory {
  const l = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/papel|sabonete|alcool|toalha|refil/.test(l)) return "abastecimento";
  if (/pia|vaso|torneira|descarga|ralo|mictorio/.test(l)) return "hidraulica";
  if (/lampada|luz|tomada|energia/.test(l)) return "eletrica";
  if (/porta|piso|parede|azulejo|teto/.test(l)) return "estrutura";
  return "outros";
}

const today = () => iso(new Date());
const isCur = (r: { starts_on: string; ends_on: string | null }, on: string) => r.starts_on <= on && (r.ends_on === null || r.ends_on >= on);
function maintMembers(d: MockDb, cid: number) {
  const teams = d.teams.filter((t) => t.contract_id === cid && t.kind === "manutencao" && t.status === "active").map((t) => t.id);
  return [...new Set(d.members.filter((m) => teams.includes(m.team_id) && isCur(m, today())).map((m) => m.user_id))];
}
function maintContracts(d: MockDb, me: DbUser) {
  return new Set(d.contracts.filter((c) => maintMembers(d, c.id).includes(me.id)).map((c) => c.id));
}
function ticketScope(d: MockDb, me: DbUser) {
  if (me.role === "manutencao") return maintContracts(d, me);
  if (me.role === "limpeza") return cleaningContracts(d, me);
  return scope(d, me);
}
const isManager = (me: DbUser) => me.role === "admin" || me.role === "gestor";
const active = (t: PvTicket) => t.status === "open" || t.status === "in_progress";
function visible(d: MockDb, me: DbUser, t: PvTicket) {
  if (me.role === "limpeza") return t.opened_by === me.id;
  return ticketScope(d, me).has(t.contract_id);
}

function ticketView(d: MockDb, me: DbUser, t: PvTicket, withAssignable = false) {
  const b = d.bathrooms.find((x) => x.id === t.bathroom_id);
  const c = d.contracts.find((x) => x.id === t.contract_id);
  const co = d.companies.find((x) => x.id === c?.company_id);
  const user = (id: number | null) => {
    const u = id === null ? undefined : d.users.find((x) => x.id === id);
    return u ? { id: u.id, name: u.name, role: u.role } : undefined;
  };
  const manage = isManager(me) && scope(d, me).has(t.contract_id) && active(t);
  const tech = me.role === "manutencao" && maintContracts(d, me).has(t.contract_id);
  return {
    id: t.id, code: `CH-${String(t.id).padStart(4, "0")}`,
    contract: { id: t.contract_id, code: c?.code ?? "", name: c?.name ?? "" },
    company: { id: co?.id ?? 0, name: co?.name ?? "" },
    bathroom: { id: t.bathroom_id, name: b?.name ?? "—" },
    location: d.locations.find((l) => l.id === b?.location_id)?.name,
    category: t.category, priority: t.priority, status: t.status, description: t.description,
    opened_by: user(t.opened_by)!, opened_at: t.opened_at,
    assignee: user(t.assignee_id), started_at: t.started_at ?? undefined, done_at: t.done_at ?? undefined,
    done_note: t.done_note ?? undefined, cancel_reason: t.cancel_reason ?? undefined, cleaning_id: t.cleaning_id ?? undefined,
    photo_open_url: t.photo_open && !t.photo_deleted_at ? photoSvg("Foto do problema") : undefined,
    photo_done_url: t.photo_done && !t.photo_deleted_at ? photoSvg("Foto do reparo") : undefined,
    photo_deleted_at: t.photo_deleted_at ?? undefined,
    events: t.events.map((e) => ({ id: e.id, kind: e.kind, actor: user(e.actor_id) ?? { id: e.actor_id, name: "—", role: "admin" }, at: e.at, text: e.text ?? undefined })),
    can: {
      start: tech && t.status === "open",
      done: tech && t.status === "in_progress" && t.assignee_id === me.id,
      assign: manage, cancel: manage, priority: manage,
      comment: me.role !== "fiscal" && active(t) && (isManager(me) ? manage : true),
    },
    ...(withAssignable && manage ? { assignable: maintMembers(d, t.contract_id).map((id) => ({ id, name: d.users.find((u) => u.id === id)?.name ?? "—" })) } : {}),
  };
}
const sortTickets = (a: PvTicket, b: PvTicket) =>
  Number(active(b)) - Number(active(a)) ||
  (active(a) ? PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) : 0) ||
  (b.done_at ?? b.opened_at).localeCompare(a.done_at ?? a.opened_at);

function filtered(d: MockDb, me: DbUser, tickets: PvTicket[], q: URLSearchParams) {
  const cid = num(q.get("contract_id")); const bid = num(q.get("bathroom_id"));
  const cat = q.get("category"); const pri = q.get("priority");
  return tickets.filter((t) => visible(d, me, t) && (cid === null || t.contract_id === cid) && (bid === null || t.bathroom_id === bid)
    && (!cat || t.category === cat) && (!pri || t.priority === pri));
}
const event = (t: PvTicket, kind: PvTicket["events"][number]["kind"], actor: number, text: string | null = null) =>
  t.events.push({ id: t.events.reduce((m, e) => Math.max(m, e.id), 0) + 1, kind, actor_id: actor, at: new Date().toISOString(), text });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function handleTicketsAndReview(method: string, path: string, query: URLSearchParams, body: Body, me: DbUser, d: MockDb): Res | null {
  const pv = () => loadPreview(d);
  const now = Date.now();

  // ---------- Chamados ----------
  if (method === "GET" && path === "/tickets") {
    const status = query.get("status");
    const mine = query.get("mine") === "1";
    const rows = filtered(d, me, pv().tickets, query).filter((t) => {
      if (mine && t.assignee_id !== me.id) return false;
      if (status === "active") return active(t);
      if (status) return t.status === status;
      return active(t) || now - new Date(t.done_at ?? t.events.at(-1)!.at).getTime() <= 7 * DAY; // padrão: ativos + encerrados nos últimos 7 dias
    }).sort(sortTickets);
    return ok(rows.map((t) => ticketView(d, me, t)), 200, { total: rows.length });
  }
  if (method === "GET" && path === "/tickets/summary") {
    if (me.role === "limpeza") return err(403, "forbidden", "Você não tem permissão para ver este resumo.");
    const rows = filtered(d, me, pv().tickets, query);
    const done7 = rows.filter((t) => t.status === "done" && t.done_at && now - new Date(t.done_at).getTime() <= 7 * DAY);
    const avg = done7.length ? Math.round(done7.reduce((s, t) => s + (new Date(t.done_at!).getTime() - new Date(t.opened_at).getTime()), 0) / done7.length / 60000) : null;
    return ok({
      open: rows.filter((t) => t.status === "open").length,
      urgent: rows.filter((t) => active(t) && t.priority === "urgente").length,
      in_progress: rows.filter((t) => t.status === "in_progress").length,
      done_7d: done7.length, avg_resolution_minutes: avg,
    });
  }
  if (method === "POST" && path === "/tickets") {
    const p = pv();
    const key = str(body["idempotency_key"]) || null;
    if (key) { const dup = p.tickets.find((t) => t.idempotency_key === key); if (dup) return ok(ticketView(d, me, dup)); }
    if (!(isManager(me) || me.role === "limpeza")) return err(403, "forbidden", "Você não tem permissão para abrir chamados.");
    const bid = num(body["bathroom_id"]);
    const b = bid === null ? undefined : d.bathrooms.find((x) => x.id === bid);
    const fields: Record<string, string> = {};
    if (!b) fields["bathroom_id"] = "Escolha o banheiro.";
    else if (!ticketScope(d, me).has(b.contract_id)) return err(404, "not_found", "Cadastro não encontrado.");
    const category = str(body["category"]) as TicketCategory;
    const priority = (str(body["priority"]) || "normal") as TicketPriority;
    const description = str(body["description"]);
    if (!CATEGORIES.includes(category)) fields["category"] = "Escolha a categoria.";
    if (!PRIORITIES.includes(priority)) fields["priority"] = "Escolha a prioridade.";
    if (description.length < 3) fields["description"] = "Descreva o problema.";
    if (Object.keys(fields).length) return err(422, "validation_failed", "Confira os campos destacados.", fields);
    const cleaningId = num(body["cleaning_id"]);
    const t: PvTicket = {
      id: p.tickets.reduce((m, x) => Math.max(m, x.id), 0) + 1, contract_id: b!.contract_id, bathroom_id: b!.id, category, priority,
      status: "open", description, opened_by: me.id, opened_at: new Date().toISOString(), assignee_id: null, started_at: null,
      done_at: null, done_note: null, cancel_reason: null,
      cleaning_id: cleaningId !== null && p.cleanings.some((c) => c.id === cleaningId && c.user_id === me.id) ? cleaningId : null,
      photo_open: fingerprint(body["photo"]), photo_done: null, idempotency_key: key, events: [],
    };
    event(t, "opened", me.id);
    p.tickets.push(t);
    savePreview();
    return ok(ticketView(d, me, t), 201);
  }

  const tm = path.match(/^\/tickets\/(\d+)(?:\/(assign|start|done|cancel|comments|priority))?$/);
  if (tm) {
    const p = pv();
    const t = p.tickets.find((x) => x.id === Number(tm[1]));
    if (!t || !visible(d, me, t)) return err(404, "not_found", "Cadastro não encontrado.");
    const action = tm[2];
    if (method === "GET" && !action) return ok(ticketView(d, me, t, true));
    if (method !== "POST" || !action) return null;
    const v = ticketView(d, me, t);
    const closed = () => err(409, "conflict", "Este chamado já foi encerrado.");

    if (action === "start") {
      if (t.status === "in_progress" && t.assignee_id === me.id) return ok(ticketView(d, me, t)); // repetido (fila sem internet)
      if (me.role !== "manutencao" || !maintContracts(d, me).has(t.contract_id)) return err(403, "forbidden", "Só a equipe de manutenção deste contrato pode iniciar.");
      if (t.status !== "open") return t.status === "in_progress" ? err(409, "conflict", "Este chamado já está com outra pessoa.") : closed();
      if (t.assignee_id !== me.id) event(t, "taken", me.id);
      t.assignee_id = me.id; t.status = "in_progress"; t.started_at = new Date().toISOString();
      event(t, "started", me.id);
    } else if (action === "done") {
      if (t.status === "done" && t.assignee_id === me.id && str(body["idempotency_key"]) && str(body["idempotency_key"]) === t.idempotency_key) return ok(ticketView(d, me, t));
      if (!v.can.done) return t.status === "done" || t.status === "cancelled" ? closed() : err(403, "forbidden", "Só quem está atendendo o chamado pode concluir.");
      const photo = fingerprint(body["photo"]); const note = str(body["note"]);
      const fields: Record<string, string> = {};
      if (!photo) fields["photo"] = "Tire a foto do reparo. Ela é obrigatória.";
      if (!note) fields["note"] = "Escreva uma nota sobre o reparo.";
      if (Object.keys(fields).length) return err(422, "validation_failed", "Confira os campos destacados.", fields);
      t.status = "done"; t.done_at = new Date().toISOString(); t.done_note = note; t.photo_done = photo;
      if (str(body["idempotency_key"])) t.idempotency_key = str(body["idempotency_key"]);
      event(t, "done", me.id, note);
    } else if (action === "assign") {
      if (!isManager(me)) return err(403, "forbidden", "Só o gestor ou a diretoria podem atribuir.");
      if (!active(t)) return closed();
      const uid = num(body["user_id"]);
      if (uid === null || !maintMembers(d, t.contract_id).includes(uid))
        return err(422, "validation_failed", "Confira os campos destacados.", { user_id: "Escolha alguém da equipe de manutenção deste contrato." });
      t.assignee_id = uid;
      event(t, "assigned", me.id, d.users.find((u) => u.id === uid)?.name ?? null);
    } else if (action === "priority") {
      if (!isManager(me)) return err(403, "forbidden", "Só o gestor ou a diretoria podem mudar a prioridade.");
      if (!active(t)) return closed();
      const pr = str(body["priority"]) as TicketPriority;
      if (!PRIORITIES.includes(pr)) return err(422, "validation_failed", "Confira os campos destacados.", { priority: "Escolha a prioridade." });
      if (pr !== t.priority) { t.priority = pr; event(t, "priority", me.id, PRIORITY_LABEL[pr]); }
    } else if (action === "cancel") {
      if (!isManager(me)) return err(403, "forbidden", "Só o gestor ou a diretoria podem cancelar.");
      if (!active(t)) return closed();
      const reason = str(body["reason"]);
      if (!reason) return err(422, "validation_failed", "Confira os campos destacados.", { reason: "Informe o motivo." });
      t.status = "cancelled"; t.cancel_reason = reason;
      event(t, "cancelled", me.id, reason);
    } else if (action === "comments") {
      if (!v.can.comment) return err(403, "forbidden", "Você não pode comentar neste chamado.");
      const text = str(body["text"]);
      if (!text) return err(422, "validation_failed", "Confira os campos destacados.", { text: "Escreva o comentário." });
      event(t, "comment", me.id, text);
    }
    savePreview();
    return ok(ticketView(d, me, t, true));
  }

  // ---------- Conferência ----------
  if (method === "GET" && path === "/review") {
    if (!isManager(me)) return err(403, "forbidden", "Você não tem permissão para a Conferência.");
    const ids = scope(d, me);
    const cid = num(query.get("contract_id"));
    const flag = query.get("flag");
    const reviewed = query.get("reviewed") === "1";
    const since = addDays(opDate(new Date()), -30);
    const base = pv().cleanings.filter((c) => ids.has(c.contract_id) && (cid === null || c.contract_id === cid)
      && (c.repeated_photo || c.offline || c.out_of_shift));
    const pending = base.filter((c) => c.status === "valid" && !c.reviewed_by);
    const has = (c: (typeof base)[number]) => !flag || (flag === "repeated_photo" ? c.repeated_photo : flag === "offline" ? c.offline : flag === "out_of_shift" ? c.out_of_shift : true);
    const rows = (reviewed ? base.filter((c) => c.reviewed_by && (c.reviewed_at ?? "") >= since) : pending).filter(has)
      .sort((a, b) => (reviewed ? (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "") : b.registered_at.localeCompare(a.registered_at)));
    return ok({
      rows: rows.slice(0, 100).map((c) => cleaningView(d, c)),
      counts: {
        total: pending.length,
        repeated_photo: pending.filter((c) => c.repeated_photo).length,
        offline: pending.filter((c) => c.offline).length,
        out_of_shift: pending.filter((c) => c.out_of_shift).length,
      },
    });
  }
  const rv = path.match(/^\/cleanings\/(\d+)\/(review|cancel)$/);
  if (method === "POST" && rv) {
    if (!isManager(me)) return err(403, "forbidden", "Você não tem permissão para a Conferência.");
    const p = pv();
    const c = p.cleanings.find((x) => x.id === Number(rv[1]));
    if (!c || !scope(d, me).has(c.contract_id)) return err(404, "not_found", "Cadastro não encontrado.");
    if (c.status !== "valid") return err(409, "conflict", "Esta limpeza já foi cancelada.");
    if (rv[2] === "cancel" && isClosed(p, c.contract_id, opDate(new Date(c.client_finished_at)))) return err(409, "conflict", "O mês desta limpeza já foi fechado. Não dá para cancelar.");
    if (rv[2] === "review") {
      if (c.reviewed_by) return err(409, "conflict", "Esta limpeza já foi conferida.");
      c.reviewed_by = me.id; c.reviewed_at = new Date().toISOString(); c.review_outcome = "ok";
      savePreview();
      return ok(cleaningView(d, c));
    }
    const reason = str(body["reason"]);
    if (!reason) return err(422, "validation_failed", "Confira os campos destacados.", { reason: "Informe o motivo." });
    const effect = cleaningView(d, c).cancel_effect;
    c.status = "cancelled"; c.cancel_reason = reason;
    c.reviewed_by = me.id; c.reviewed_at = new Date().toISOString(); c.review_outcome = "cancelled";
    savePreview();
    return ok({ cleaning: cleaningView(d, c), effect });
  }
  return null;
}
