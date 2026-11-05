// Parte 3/4 do protótipo: REGRA ÚNICA DE CÁLCULO (computeStats) usada por Painel, Pendências, Histórico, Relatórios e Fechamento.
// Só chamado por preview-handlers.ts.
import type { DbUser, MockDb } from "../data";
import {
  type PreviewDb, type PvCleaning, type PvClosing, SHIFT_END_LABEL, SHIFT_ORDER, type ShiftKey, addDays, dayClose, interdicted, iso, loadPreview,
  opDate, savePreview, shiftWindow, tasksFor,
} from "./preview-data";
import { type Body, type Res, cleaningView, err, num, ok, scope } from "./preview-handlers";

export type Totals = {
  expected: number; done: number; not_done: number; pending: number; late_pending: number; cancelled: number;
  extras: number; on_time: number; late_done: number; compliance: number | null;
};
const zero = (): Totals => ({ expected: 0, done: 0, not_done: 0, pending: 0, late_pending: 0, cancelled: 0, extras: 0, on_time: 0, late_done: 0, compliance: null });
const finish = (t: Totals) => ({ ...t, compliance: t.expected ? t.done / t.expected : null });

export type StatsFilter = { from: string; to: string; contractIds: Set<number>; bathroomId?: number | null; userId?: number | null };
export const cleaningDate = (c: PvCleaning) => opDate(new Date(c.client_finished_at));
/** Os dados de exemplo cobrem os últimos 30 dias. */
export const dataStart = (now: Date) => addDays(opDate(now), -30);

/**
 * Previsto = tarefas não canceladas · Realizado = tarefas feitas · Não feitas = dia passou sem limpeza ·
 * Extras = limpezas válidas sem tarefa (fora do %) · Cumprimento = realizado ÷ previsto.
 */
export function computeStats(d: MockDb, p: PreviewDb, f: StatsFilter, now = new Date()) {
  const today = opDate(now);
  const from = f.from < dataStart(now) ? dataStart(now) : f.from;
  const to = f.to > today ? today : f.to;
  const doneBy = new Map<string, PvCleaning>();
  for (const c of p.cleanings) if (c.status === "valid" && c.task_id) doneBy.set(c.task_id, c);
  const total = zero();
  const byContract = new Map<number, Totals>(), byBath = new Map<number, Totals>(), byDay = new Map<string, Totals>();
  const add = (m: Map<number | string, Totals>, k: number | string, fn: (t: Totals) => void) => { if (!m.has(k)) m.set(k, zero()); fn(m.get(k)!); };
  const bump = (cid: number, bid: number, date: string, fn: (t: Totals) => void) => {
    fn(total); add(byContract as never, cid, fn); add(byBath as never, bid, fn); add(byDay as never, date, fn);
  };
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const t of tasksFor(d, date, f.contractIds)) {
      if (f.bathroomId && t.bathroom.id !== f.bathroomId) continue;
      const done = doneBy.get(t.id);
      const cancelled = !done && (p.cancelled_tasks.includes(t.id) || interdicted(d, t.bathroom.id, date));
      bump(t.contract.id, t.bathroom.id, date, (x) => {
        if (cancelled) { x.cancelled++; return; }
        x.expected++;
        if (done) { x.done++; if (done.out_of_shift) x.late_done++; else x.on_time++; }
        else if (now >= dayClose(date)) x.not_done++;
        else { x.pending++; if (now >= shiftWindow(date, t.shift)[1]) x.late_pending++; }
      });
    }
  }
  const extras = p.cleanings.filter((c) => c.status === "valid" && !c.task_id && f.contractIds.has(c.contract_id)
    && (!f.bathroomId || c.bathroom_id === f.bathroomId) && cleaningDate(c) >= from && cleaningDate(c) <= to);
  for (const c of extras) bump(c.contract_id, c.bathroom_id, cleaningDate(c), (x) => x.extras++);

  // por pessoa: limpezas válidas que contaram como tarefa
  const people = new Map<number, { done: number; on_time: number }>();
  for (const c of p.cleanings) {
    if (c.status !== "valid" || !c.task_id || !f.contractIds.has(c.contract_id) || (f.bathroomId && c.bathroom_id !== f.bathroomId)) continue;
    if (f.userId && c.user_id !== f.userId) continue;
    const date = c.task_id.split("-").slice(1, 4).join("-");
    if (date < from || date > to) continue;
    const x = people.get(c.user_id) ?? { done: 0, on_time: 0 };
    x.done++; if (!c.out_of_shift) x.on_time++;
    people.set(c.user_id, x);
  }
  const contractRef = (id: number) => { const c = d.contracts.find((x) => x.id === id)!; return { id, code: c.code, name: c.name }; };
  const byCompany = new Map<number, Totals>();
  for (const [cid, t] of byContract) {
    const coid = d.contracts.find((x) => x.id === cid)!.company_id;
    if (!byCompany.has(coid)) byCompany.set(coid, zero());
    const acc = byCompany.get(coid)! as Record<string, number>;
    for (const [k, v] of Object.entries(t)) if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
  }
  return {
    from, to, totals: finish(total),
    by_company: [...byCompany].map(([id, t]) => ({ company: { id, name: d.companies.find((x) => x.id === id)?.name ?? "—" }, ...finish(t) }))
      .sort((a, b) => a.company.name.localeCompare(b.company.name, "pt-BR")),
    by_contract: [...byContract].map(([id, t]) => ({ contract: contractRef(id), ...finish(t) })).sort((a, b) => a.contract.code.localeCompare(b.contract.code)),
    by_bathroom: [...byBath].map(([id, t]) => {
      const b = d.bathrooms.find((x) => x.id === id)!;
      const c = d.contracts.find((x) => x.id === b.contract_id)!;
      const co = d.companies.find((x) => x.id === c.company_id);
      return { bathroom: { id, name: b.name }, location: d.locations.find((l) => l.id === b.location_id)?.name, contract: contractRef(c.id),
        company: { id: co?.id ?? 0, name: co?.name ?? "" }, ...finish(t) };
    }).sort((a, b) => (a.compliance ?? 1) - (b.compliance ?? 1) || a.bathroom.name.localeCompare(b.bathroom.name, "pt-BR")),
    by_day: [...byDay].map(([date, t]) => ({ date: date as string, expected: t.expected, done: t.done, not_done: t.not_done, extras: t.extras }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    by_person: [...people].map(([id, x]) => {
      const teams = d.teams.filter((t) => f.contractIds.has(t.contract_id) && d.members.some((m) => m.team_id === t.id && m.user_id === id)).map((t) => t.name);
      return { user: { id, name: d.users.find((u) => u.id === id)?.name ?? "—" }, teams: [...new Set(teams)], done: x.done, on_time: x.on_time };
    }).sort((a, b) => b.done - a.done),
  };
}

// ---------- períodos ----------
export const monthRange = (month: string, now = new Date()) => {
  const [y, m] = month.split("-").map(Number);
  const last = iso(new Date(y!, m!, 0));
  const today = opDate(now);
  return { from: `${month}-01`, to: last > today ? today : last, ended: last < today };
};
const isMonth = (v: string | null) => !!v && /^\d{4}-\d{2}$/.test(v);
export function isClosed(p: PreviewDb, contractId: number, date: string) {
  return p.closings.some((c) => c.contract_id === contractId && c.status === "closed" && date.startsWith(c.month));
}

function idsFor(d: MockDb, me: DbUser, q: URLSearchParams): Set<number> | Res {
  const ids = scope(d, me);
  const coid = num(q.get("company_id"));
  if (coid !== null) for (const id of [...ids]) if (d.contracts.find((c) => c.id === id)?.company_id !== coid) ids.delete(id);
  const cid = num(q.get("contract_id"));
  if (cid === null) return ids;
  if (!ids.has(cid)) return err(404, "not_found", "Cadastro não encontrado.");
  return new Set([cid]);
}
function period(q: URLSearchParams, now: Date): { from: string; to: string } | Res {
  const today = opDate(now);
  const month = q.get("month");
  if (isMonth(month)) return monthRange(month!, now);
  const from = q.get("from") || today, to = q.get("to") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return err(422, "validation_failed", "Confira os campos destacados.", { from: "Data inválida." });
  if (to < from) return err(422, "validation_failed", "Confira os campos destacados.", { to: "A data final deve ser igual ou posterior à inicial." });
  return { from, to };
}

const ENTITY: Record<string, string> = { contract: "Contrato", bathroom: "Banheiro", team: "Equipe", user: "Pessoa", company: "Empresa" };

function closingView(d: MockDb, me: DbUser, p: PreviewDb, contractId: number, month: string, now: Date) {
  const c = d.contracts.find((x) => x.id === contractId)!;
  const row = p.closings.find((x) => x.contract_id === contractId && x.month === month);
  const { from, to, ended } = monthRange(month, now);
  const closed = row?.status === "closed";
  const canManage = me.role === "admin" || (me.role === "gestor" && c.manager_id === me.id);
  const name = (id: number) => d.users.find((u) => u.id === id)?.name ?? "—";
  return {
    id: row?.id ?? null, contract_id: contractId, month, status: closed ? "closed" : "open", ended,
    totals: closed ? row!.totals : computeStats(d, p, { from, to, contractIds: new Set([contractId]) }, now).totals,
    closed_at: closed ? row!.closed_at : undefined, closed_by: closed ? { id: row!.closed_by, name: name(row!.closed_by) } : undefined,
    reopenings: (row?.reopenings ?? []).map((r) => ({ at: r.at, by: { id: r.by, name: name(r.by) }, reason: r.reason })),
    can: { close: canManage && !closed && ended, reopen: me.role === "admin" && closed },
  };
}

export function handleReports(method: string, path: string, q: URLSearchParams, body: Body, me: DbUser, d: MockDb): Res | null {
  const now = new Date();
  const field = me.role === "limpeza" || me.role === "manutencao";
  const deny = () => err(403, "forbidden", "Você não tem permissão para esta tela.");

  if (method === "GET" && path === "/stats") {
    if (field) return deny();
    const ids = idsFor(d, me, q); if ("status" in ids) return ids as Res;
    const per = period(q, now); if ("status" in per) return per as Res;
    return ok(computeStats(d, loadPreview(d), { ...per, contractIds: ids, bathroomId: num(q.get("bathroom_id")), userId: num(q.get("user_id")) }, now));
  }

  if (method === "GET" && path === "/pending-tasks") {
    if (field) return deny();
    const ids = idsFor(d, me, q); if ("status" in ids) return ids as Res;
    const shift = q.get("shift");
    const p = loadPreview(d);
    const doneIds = new Set(p.cleanings.filter((c) => c.status === "valid" && c.task_id).map((c) => c.task_id));
    const today = opDate(now);
    const rows = [];
    for (let back = 7; back >= 0; back--) {
      const date = addDays(today, -back);
      for (const t of tasksFor(d, date, ids)) {
        if (doneIds.has(t.id) || p.cancelled_tasks.includes(t.id) || interdicted(d, t.bathroom.id, date)) continue;
        if (shift && t.shift !== shift) continue;
        const end = shiftWindow(date, t.shift)[1];
        const kind = now >= dayClose(date) ? "not_done" : now >= end ? "late" : "pending";
        rows.push({
          id: t.id, date, shift: t.shift, shift_ends_at: SHIFT_END_LABEL[t.shift], kind, overdue_since: kind === "pending" ? null : end.toISOString(),
          bathroom: { id: t.bathroom.id, name: t.bathroom.name }, location: d.locations.find((l) => l.id === t.bathroom.location_id)?.name,
          contract: { id: t.contract.id, code: t.contract.code, name: t.contract.name },
        });
      }
    }
    rows.sort((a, b) => a.contract.code.localeCompare(b.contract.code) || a.bathroom.name.localeCompare(b.bathroom.name, "pt-BR")
      || b.date.localeCompare(a.date) || SHIFT_ORDER.indexOf(a.shift as ShiftKey) - SHIFT_ORDER.indexOf(b.shift as ShiftKey));
    return ok(rows, 200, { total: rows.length });
  }

  if (method === "GET" && path === "/history/cleanings") {
    if (field) return deny();
    const ids = idsFor(d, me, q); if ("status" in ids) return ids as Res;
    const per = period(q, now); if ("status" in per) return per as Res;
    const p = loadPreview(d);
    const bid = num(q.get("bathroom_id")), uid = num(q.get("user_id")), sit = q.get("situation");
    const stats = computeStats(d, p, { ...per, contractIds: ids, bathroomId: bid }, now);
    const rows = p.cleanings.filter((c) => ids.has(c.contract_id) && cleaningDate(c) >= stats.from && cleaningDate(c) <= stats.to
      && (!bid || c.bathroom_id === bid) && (!uid || c.user_id === uid)
      && (!sit || (sit === "on_time" ? c.status === "valid" && !!c.task_id && !c.out_of_shift
        : sit === "late" ? c.status === "valid" && c.out_of_shift
        : sit === "extra" ? c.status === "valid" && !c.task_id
        : sit === "cancelled" ? c.status === "cancelled" : true)))
      .sort((a, b) => b.registered_at.localeCompare(a.registered_at));
    return ok({ totals: stats.totals, rows: rows.slice(0, 300).map((c) => cleaningView(d, c)), total: rows.length, limit: 300 });
  }

  if (method === "GET" && path === "/audit") {
    if (field) return deny();
    const entity = q.get("entity");
    const ids = scope(d, me);
    const contractOf = (a: MockDb["audit"][number]): number | null => {
      if (a.entity === "contract") return a.entity_id;
      if (a.entity === "bathroom") return d.bathrooms.find((b) => b.id === a.entity_id)?.contract_id ?? null;
      if (a.entity === "team") return d.teams.find((t) => t.id === a.entity_id)?.contract_id ?? null;
      return null;
    };
    const visible = (a: MockDb["audit"][number]) => {
      if (me.role === "admin") return true;
      const cid = contractOf(a);
      if (cid !== null) return ids.has(cid);
      return me.role === "gestor" && a.entity === "user" && a.actor_id === me.id;
    };
    const nameOf = (a: MockDb["audit"][number]) => {
      const src = { contract: d.contracts, bathroom: d.bathrooms, team: d.teams, user: d.users, company: d.companies }[a.entity as "user"] as { id: number; name: string }[] | undefined;
      return src?.find((x) => x.id === a.entity_id)?.name;
    };
    const rows = d.audit.filter((a) => (!entity || a.entity === entity) && visible(a)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
      .map((a) => {
        const actor = a.actor_id ? d.users.find((u) => u.id === a.actor_id) : undefined;
        return { id: a.id, action: a.action, entity: a.entity, entity_label: ENTITY[a.entity] ?? a.entity, entity_id: a.entity_id, entity_name: nameOf(a),
          before: a.before ?? undefined, after: a.after ?? undefined, reason: a.reason ?? undefined, created_at: a.created_at,
          actor: actor ? { id: actor.id, name: actor.name } : undefined };
      });
    return ok(rows, 200, { total: rows.length });
  }

  const cl = path.match(/^\/contracts\/(\d+)\/closings$/);
  if (cl) {
    if (field) return deny();
    const cid = Number(cl[1]);
    if (!scope(d, me).has(cid)) return err(404, "not_found", "Cadastro não encontrado.");
    const p = loadPreview(d);
    if (method === "GET") {
      const cur = opDate(now).slice(0, 7);
      const prev = addDays(`${cur}-01`, -1).slice(0, 7);
      return ok([cur, prev].map((m) => closingView(d, me, p, cid, m, now)));
    }
    if (method === "POST") {
      const month = typeof body["month"] === "string" ? body["month"] : null;
      if (!isMonth(month)) return err(422, "validation_failed", "Confira os campos destacados.", { month: "Escolha o mês." });
      const v = closingView(d, me, p, cid, month!, now);
      if (v.status === "closed") return err(409, "conflict", "Este mês já está fechado.");
      if (!v.ended) return err(409, "conflict", "Só dá para fechar um mês que já terminou.");
      if (!v.can.close) return err(403, "forbidden", "Só o gestor do contrato ou a diretoria podem fechar o mês.");
      const existing = p.closings.find((x) => x.contract_id === cid && x.month === month);
      const row: PvClosing = existing ?? { id: p.closings.reduce((m, x) => Math.max(m, x.id), 0) + 1, contract_id: cid, month: month!, status: "closed", totals: v.totals, closed_at: "", closed_by: me.id, reopenings: [] };
      Object.assign(row, { status: "closed", totals: v.totals, closed_at: now.toISOString(), closed_by: me.id });
      if (!existing) p.closings.push(row);
      savePreview();
      return ok(closingView(d, me, p, cid, month!, now), 201);
    }
  }

  const ro = path.match(/^\/closings\/(\d+)\/reopen$/);
  if (method === "POST" && ro) {
    if (me.role !== "admin") return err(403, "forbidden", "Só a diretoria pode reabrir um mês.");
    const p = loadPreview(d);
    if (!p.closings.some((x) => x.id === Number(ro[1]) && scope(d, me).has(x.contract_id))) return err(404, "not_found", "Cadastro não encontrado.");
    const row = p.closings.find((x) => x.id === Number(ro[1]) && x.status === "closed");
    if (!row) return err(404, "not_found", "Cadastro não encontrado.");
    const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
    if (!reason) return err(422, "validation_failed", "Confira os campos destacados.", { reason: "Informe o motivo." });
    row.status = "open";
    row.reopenings.push({ at: now.toISOString(), by: me.id, reason });
    savePreview();
    return ok(closingView(d, me, p, row.contract_id, row.month, now));
  }
  return null;
}
