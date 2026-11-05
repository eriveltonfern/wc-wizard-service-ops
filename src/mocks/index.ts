// Servidor simulado em memória (persistido em localStorage "wccheck.mockdb").
// Implementa docs/api-contract.md com o mesmo comportamento da API real. Só importado por src/lib/api.ts.
import type {
  ActivationMissing, AuditEvent, Bathroom, BathroomDetail, Company, CompanyDetail, Contract, ContractDetail,
  FiscalLink, Location, Member, Membership, Team, User,
} from "../lib/types";
import {
  seed, SEED_VERSION, defaultRules, DEFAULT_CHECKLIST, type DbBathroom, type DbContract, type DbMember, type DbTeam, type DbUser, type MockDb,
} from "./data";
import { handlePreview, resetPreviewDb } from "./preview/preview-handlers";
import { handlePublic } from "./preview/preview-ratings";
import { canClean } from "./preview/preview-data";

const DB_KEY = "wccheck.mockdb";
type MockResponse = { status: number; body: unknown };
type Body = Record<string, unknown>;

// ---------- persistência ----------
let db: MockDb | null = null;
function load(): MockDb {
  if (db) return db;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DB_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as MockDb) : null;
    // Dados salvos de uma versão anterior do mock são recriados.
    db = parsed && parsed.version === SEED_VERSION ? parsed : seed();
    db.bathroom_cleaners ??= [];
  } catch {
    db = seed();
  }
  return db;
}
function save() {
  if (db && typeof localStorage !== "undefined") localStorage.setItem(DB_KEY, JSON.stringify(db));
}
export function resetMockDb() {
  db = seed();
  save();
  resetPreviewDb();
}

// ---------- respostas ----------
class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}, public extra: Body = {}) {
    super(message);
  }
}
const ok = (data: unknown, status = 200, meta: unknown = null): MockResponse => ({ status, body: { data, meta } });
const list = (data: unknown[]): MockResponse => ok(data, 200, { total: data.length });
const noContent = (): MockResponse => ({ status: 204, body: null });
const MSG = {
  required: "Campo obrigatório.",
  email: "E-mail inválido.",
  option: "Escolha uma opção válida.",
  dateOrder: "A data final deve ser igual ou posterior à inicial.",
  emailTaken: "Já existe uma pessoa com este e-mail.",
  codeTaken: "Já existe um contrato com este código.",
  bathroomTaken: "Já existe um banheiro com este nome no contrato.",
  history: "Este cadastro tem histórico. Você pode inativá-lo.",
};
const notFound = () => new HttpError(404, "not_found", "Cadastro não encontrado.");
const forbidden = () => new HttpError(403, "forbidden", "Você não tem permissão para esta ação.");
const conflict = (message: string, extra: Body = {}) => new HttpError(409, "conflict", message, {}, extra);
function hasHistory(counts: Record<string, number>) {
  return new HttpError(409, "has_history", MSG.history, {}, { counts });
}

// ---------- validação ----------
class V {
  fields: Record<string, string> = {};
  constructor(public b: Body) {}
  has(k: string) { return Object.prototype.hasOwnProperty.call(this.b, k); }
  str(k: string, required = false): string | null {
    const v = this.b[k];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      if (required) this.fields[k] = MSG.required;
      return null;
    }
    return String(v).trim();
  }
  email(k: string) {
    const v = this.str(k, true);
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) this.fields[k] = MSG.email;
    return v?.toLowerCase() ?? null;
  }
  oneOf<T extends string>(k: string, opts: readonly T[], required = false): T | null {
    const v = this.str(k, required);
    if (v === null) return null;
    if (!opts.includes(v as T)) { this.fields[k] = MSG.option; return null; }
    return v as T;
  }
  date(k: string, required = false) {
    const v = this.str(k, required);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { this.fields[k] = "Data inválida."; return null; }
    return v;
  }
  int(k: string, required = false, min = 0) {
    const v = this.b[k];
    if (v === undefined || v === null || v === "") { if (required) this.fields[k] = MSG.required; return null; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) { this.fields[k] = MSG.option; return null; }
    return n;
  }
  bool(k: string) { const v = this.b[k]; return v === undefined || v === null ? null : Boolean(v); }
  order(startKey: string, endKey: string, start: string | null, end: string | null) {
    if (start && end && end < start && !this.fields[endKey] && !this.fields[startKey]) this.fields[endKey] = MSG.dateOrder;
  }
  fail(k: string, msg: string) { if (!this.fields[k]) this.fields[k] = msg; }
  done() {
    if (Object.keys(this.fields).length) throw new HttpError(422, "validation_failed", "Confira os campos destacados.", this.fields);
  }
}

// ---------- utilitários ----------
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const QR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomFrom(alphabet: string, n: number) {
  let s = "";
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < n; i++) s += alphabet[bytes[i]! % alphabet.length];
  return s;
}
function newQrToken(d: MockDb) {
  let t: string;
  do t = randomFrom(QR_ALPHABET, 12); while (d.bathrooms.some((b) => b.qr_token === t));
  return t;
}
const tempPassword = () => [0, 1, 2, 3].map(() => randomFrom(QR_ALPHABET, 4)).join("-");
const isCurrent = (r: { starts_on: string; ends_on: string | null }, on = today()) => r.starts_on <= on && (r.ends_on === null || r.ends_on >= on);
const opt = <T,>(v: T | null | undefined) => (v === null ? undefined : v);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function weekdays(v: V, k: string, required = false): number[] | null {
  const raw = v.b[k];
  if (raw === undefined || raw === null) { if (required) v.fail(k, MSG.required); return null; }
  if (!Array.isArray(raw) || raw.length === 0) { v.fail(k, MSG.required); return null; }
  const nums = raw.map(Number);
  if (nums.some((n) => !WEEKDAYS.includes(n))) { v.fail(k, MSG.option); return null; }
  return [...new Set(nums)].sort();
}

// ---------- serialização ----------
function pubUser(u: DbUser): User {
  return { id: u.id, name: u.name, email: u.email, phone: opt(u.phone), role: u.role, company_id: opt(u.company_id), status: u.status, must_change_password: u.must_change_password };
}
function membership(d: MockDb, m: DbMember): Membership {
  const t = d.teams.find((x) => x.id === m.team_id)!;
  const c = d.contracts.find((x) => x.id === t.contract_id)!;
  return { id: m.id, team_id: t.id, team_name: t.name, kind: t.kind, contract_id: c.id, contract_code: c.code, contract_name: c.name,
    starts_on: m.starts_on, ends_on: opt(m.ends_on), removal_reason: opt(m.removal_reason) };
}
function member(d: MockDb, m: DbMember): Member {
  const u = d.users.find((x) => x.id === m.user_id)!;
  return { id: m.id, team_id: m.team_id, user_id: u.id, name: u.name, role: u.role, starts_on: m.starts_on, ends_on: opt(m.ends_on), removal_reason: opt(m.removal_reason) };
}
function team(d: MockDb, t: DbTeam): Team {
  return { id: t.id, contract_id: t.contract_id, kind: t.kind, name: t.name, shift: opt(t.shift), status: t.status,
    members: d.members.filter((m) => m.team_id === t.id && isCurrent(m)).map((m) => member(d, m)) };
}
function company(d: MockDb, id: number): Company {
  const c = d.companies.find((x) => x.id === id)!;
  return { id: c.id, name: c.name, document: opt(c.document), contact_name: opt(c.contact_name), contact_phone: opt(c.contact_phone), notes: opt(c.notes),
    status: c.status, contracts_count: d.contracts.filter((x) => x.company_id === id).length,
    fiscals_count: d.users.filter((u) => u.role === "fiscal" && u.company_id === id).length };
}
function companyDetail(d: MockDb, id: number): CompanyDetail {
  return { ...company(d, id),
    contracts: d.contracts.filter((x) => x.company_id === id).map((x) => ({ id: x.id, code: x.code, name: x.name, status: x.status, starts_on: x.starts_on, ends_on: opt(x.ends_on) })),
    fiscals: d.users.filter((u) => u.role === "fiscal" && u.company_id === id).map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status })) };
}
function activation(d: MockDb, c: DbContract) {
  const missing: ActivationMissing[] = [];
  if (!c.manager_id) missing.push("manager");
  if (!d.bathrooms.some((b) => b.contract_id === c.id && b.status === "active")) missing.push("bathroom");
  const hasTeam = d.teams.some((t) => t.contract_id === c.id && t.kind === "limpeza" && t.status === "active" && d.members.some((m) => m.team_id === t.id && isCurrent(m)));
  if (!hasTeam) missing.push("cleaning_team");
  const hasFiscal = d.fiscal_links.some((l) => l.contract_id === c.id && isCurrent(l) &&
    d.users.some((u) => u.id === l.user_id && u.role === "fiscal" && u.status === "active" && u.company_id === c.company_id));
  if (!hasFiscal) missing.push("fiscal");
  if (d.companies.find((x) => x.id === c.company_id)?.status !== "active") missing.push("company");
  return { ready: missing.length === 0, missing };
}
function contract(d: MockDb, c: DbContract): Contract {
  const co = d.companies.find((x) => x.id === c.company_id)!;
  const mg = c.manager_id ? d.users.find((u) => u.id === c.manager_id) : undefined;
  return { id: c.id, code: c.code, name: c.name, company: { id: co.id, name: co.name }, manager: mg ? { id: mg.id, name: mg.name } : undefined,
    starts_on: c.starts_on, ends_on: opt(c.ends_on), status: c.status, timezone: c.timezone, rules: { ...c.rules },
    counts: { bathrooms: d.bathrooms.filter((b) => b.contract_id === c.id).length, teams: d.teams.filter((t) => t.contract_id === c.id).length } };
}
function fiscalLink(d: MockDb, id: number): FiscalLink {
  const l = d.fiscal_links.find((x) => x.id === id)!;
  const u = d.users.find((x) => x.id === l.user_id)!;
  return { id: l.id, user_id: u.id, name: u.name, email: u.email, starts_on: l.starts_on, ends_on: opt(l.ends_on) };
}
const checklistOf = (d: MockDb, cid: number) =>
  d.checklist.filter((i) => i.contract_id === cid).sort((a, b) => a.position - b.position).map(({ id, label, position, active }) => ({ id, label, position, active }));
function contractDetail(d: MockDb, c: DbContract): ContractDetail {
  return { ...contract(d, c), fiscals: d.fiscal_links.filter((l) => l.contract_id === c.id).map((l) => fiscalLink(d, l.id)),
    checklist: checklistOf(d, c.id), activation: activation(d, c) };
}
function location(d: MockDb, id: number): Location {
  const l = d.locations.find((x) => x.id === id)!;
  return { ...l, bathrooms_count: d.bathrooms.filter((b) => b.location_id === id).length };
}
function bathroom(d: MockDb, b: DbBathroom): Bathroom {
  const c = d.contracts.find((x) => x.id === b.contract_id)!;
  const l = b.location_id ? d.locations.find((x) => x.id === b.location_id) : undefined;
  const co = d.companies.find((x) => x.id === c.company_id)!;
  return { id: b.id, contract_id: c.id, contract: { id: c.id, code: c.code, name: c.name }, company: { id: co.id, name: co.name }, location: l ? { id: l.id, name: l.name } : undefined,
    name: b.name, qr_token: b.qr_token, kind: b.kind, floor: opt(b.floor), notes: opt(b.notes),
    cleanings_per_day: opt(b.cleanings_per_day), weekdays: opt(b.weekdays),
    effective_plan: { cleanings_per_day: b.cleanings_per_day ?? c.rules.default_cleanings_per_day, weekdays: b.weekdays ?? c.rules.default_weekdays },
    status: b.status };
}
const bathroomDetail = (d: MockDb, b: DbBathroom): BathroomDetail => ({ ...bathroom(d, b), status_periods: d.status_periods.filter((p) => p.bathroom_id === b.id) });

function audit(d: MockDb, me: DbUser, action: string, entity: string, entity_id: number, before: unknown, after: unknown, reason?: string | null) {
  d.audit.push({ id: nextId(d.audit), action, entity, entity_id, before: (before ?? null) as Body | null, after: (after ?? null) as Body | null,
    reason: reason ?? null, created_at: new Date().toISOString(), actor_id: me.id });
}
function auditEvent(d: MockDb, a: MockDb["audit"][number]): AuditEvent {
  const actor = a.actor_id ? d.users.find((u) => u.id === a.actor_id) : undefined;
  return { id: a.id, action: a.action, entity: a.entity, entity_id: a.entity_id, before: opt(a.before), after: opt(a.after),
    reason: opt(a.reason), created_at: a.created_at, actor: actor ? { id: actor.id, name: actor.name } : undefined };
}

// ---------- escopo e permissões ----------
function scopeIds(d: MockDb, me: DbUser): Set<number> {
  if (me.role === "admin") return new Set(d.contracts.map((c) => c.id));
  if (me.role === "gestor") return new Set(d.contracts.filter((c) => c.manager_id === me.id).map((c) => c.id));
  if (me.role === "fiscal") return new Set(d.fiscal_links.filter((l) => l.user_id === me.id && isCurrent(l)).map((l) => l.contract_id));
  const teamIds = d.members.filter((m) => m.user_id === me.id && isCurrent(m)).map((m) => m.team_id);
  return new Set(d.teams.filter((t) => teamIds.includes(t.id) && t.status === "active").map((t) => t.contract_id));
}
/** Contrato visível (404 fora do escopo). manage=true exige admin ou gestor do contrato. */
function getContractFor(d: MockDb, me: DbUser, id: number, manage = false) {
  const c = d.contracts.find((x) => x.id === id);
  if (!c || !scopeIds(d, me).has(id)) throw notFound();
  if (manage && me.role !== "admin" && !(me.role === "gestor" && c.manager_id === me.id)) throw forbidden();
  return c;
}
const requireAdmin = (me: DbUser) => { if (me.role !== "admin") throw forbidden(); };
const requireStaff = (me: DbUser) => { if (me.role !== "admin" && me.role !== "gestor") throw forbidden(); };

function visibleUsers(d: MockDb, me: DbUser) {
  if (me.role === "admin") return d.users;
  if (me.role === "gestor") {
    const ids = scopeIds(d, me);
    const companyIds = new Set(d.contracts.filter((c) => ids.has(c.id)).map((c) => c.company_id));
    return d.users.filter((u) => u.id === me.id || u.role === "limpeza" || u.role === "manutencao" || (u.role === "fiscal" && u.company_id !== null && companyIds.has(u.company_id)));
  }
  return [];
}
function getUserFor(d: MockDb, me: DbUser, id: number, manage = false) {
  requireStaff(me);
  const u = visibleUsers(d, me).find((x) => x.id === id);
  if (!u) throw notFound();
  if (manage && me.role === "gestor" && u.role !== "limpeza" && u.role !== "manutencao") throw forbidden();
  return u;
}
function find<T extends { id: number }>(rows: T[], id: number) {
  const r = rows.find((x) => x.id === id);
  if (!r) throw notFound();
  return r;
}

// ---------- roteador ----------
type Ctx = { d: MockDb; me: DbUser; body: Body; query: URLSearchParams; p: number[]; token: string | null };
type Handler = (c: Ctx) => MockResponse;
const routes: [string, RegExp, Handler][] = [];
function on(method: string, pattern: string, h: Handler) {
  routes.push([method, new RegExp("^" + pattern.replace(/\{[^}]+\}/g, "([^/]+)") + "$"), h]);
}

// Sessão
on("POST", "/auth/logout", ({ d, token }) => { if (token) d.revoked_tokens.push(token); return noContent(); });
on("GET", "/me", ({ me }) => ok(pubUser(me)));
on("POST", "/me/password", ({ me, body }) => {
  const v = new V(body);
  const cur = v.str("current", true);
  const nw = v.str("new", true);
  if (cur && cur !== me.password) v.fail("current", "Senha atual incorreta.");
  if (nw && nw.length < 10) v.fail("new", "A senha deve ter pelo menos 10 caracteres.");
  v.done();
  me.password = nw!;
  me.must_change_password = false;
  return ok({ changed: true });
});

// Empresas
function companyInput(d: MockDb, body: Body, existing?: MockDb["companies"][number]) {
  const v = new V({ ...existing, ...body });
  const name = v.str("name", true);
  v.done();
  return { name: name!, document: v.str("document"), contact_name: v.str("contact_name"), contact_phone: v.str("contact_phone"), notes: v.str("notes") };
}
on("GET", "/companies", ({ d, me }) => { requireAdmin(me); return list(d.companies.map((c) => company(d, c.id))); });
on("POST", "/companies", ({ d, me, body }) => {
  requireAdmin(me);
  const row = { id: nextId(d.companies), ...companyInput(d, body), status: "active" as const };
  d.companies.push(row);
  audit(d, me, "company.created", "company", row.id, null, row);
  return ok(companyDetail(d, row.id), 201);
});
on("GET", "/companies/{id}", ({ d, me, p }) => { requireAdmin(me); find(d.companies, p[0]!); return ok(companyDetail(d, p[0]!)); });
on("PATCH", "/companies/{id}", ({ d, me, p, body }) => {
  requireAdmin(me);
  const c = find(d.companies, p[0]!);
  const before = { ...c };
  Object.assign(c, companyInput(d, body, c));
  audit(d, me, "company.updated", "company", c.id, before, c);
  return ok(companyDetail(d, c.id));
});
on("DELETE", "/companies/{id}", ({ d, me, p }) => {
  requireAdmin(me);
  const c = find(d.companies, p[0]!);
  const counts = { contracts: d.contracts.filter((x) => x.company_id === c.id).length, fiscals: d.users.filter((u) => u.company_id === c.id).length };
  if (counts.contracts || counts.fiscals) throw hasHistory(counts);
  d.companies = d.companies.filter((x) => x.id !== c.id);
  return noContent();
});
on("POST", "/companies/{id}/inactivate", ({ d, me, p, body }) => {
  requireAdmin(me);
  const c = find(d.companies, p[0]!);
  const v = new V(body); const reason = v.str("reason", true); v.done();
  c.status = "inactive";
  for (const ct of d.contracts.filter((x) => x.company_id === c.id && x.status === "active")) {
    ct.status = "suspended";
    audit(d, me, "contract.suspended", "contract", ct.id, { status: "active" }, { status: "suspended" }, reason);
  }
  audit(d, me, "company.inactivated", "company", c.id, { status: "active" }, { status: "inactive" }, reason);
  return ok(companyDetail(d, c.id));
});
on("POST", "/companies/{id}/reactivate", ({ d, me, p }) => {
  requireAdmin(me);
  const c = find(d.companies, p[0]!);
  c.status = "active";
  audit(d, me, "company.reactivated", "company", c.id, { status: "inactive" }, { status: "active" });
  return ok(companyDetail(d, c.id));
});
on("POST", "/companies/{id}/fiscals", ({ d, me, p, body }) => {
  requireAdmin(me);
  const c = find(d.companies, p[0]!);
  const v = new V(body);
  const user_id = v.int("user_id", true, 1);
  const u = user_id ? d.users.find((x) => x.id === user_id) : undefined;
  if (user_id && !u) v.fail("user_id", MSG.option);
  else if (u && u.role !== "fiscal") v.fail("user_id", "Esta pessoa não tem o perfil fiscal.");
  else if (u && u.status !== "active") v.fail("user_id", "Este fiscal está inativo. Reative-o antes.");
  else if (u && u.company_id === c.id) v.fail("user_id", "Este fiscal já é desta empresa.");
  v.done();
  const t = today();
  for (const l of d.fiscal_links.filter((x) => x.user_id === u!.id && (x.ends_on === null || x.ends_on > t))) l.ends_on = t;
  const before = { company_id: u!.company_id };
  u!.company_id = c.id;
  if (!d.revoked_tokens.includes(`mock-token-${u!.id}`)) d.revoked_tokens.push(`mock-token-${u!.id}`);
  audit(d, me, "fiscal.company_changed", "user", u!.id, before, { company_id: c.id });
  return ok(companyDetail(d, c.id), 201);
});

// Contratos
function contractInput(d: MockDb, body: Body, existing?: DbContract) {
  const merged: Body = existing ? { ...existing, ...existing.rules, ...body } : { ...defaultRules(), timezone: "America/Sao_Paulo", ...body };
  const v = new V(merged);
  const company_id = v.int("company_id", true, 1);
  if (company_id && !d.companies.some((c) => c.id === company_id)) v.fail("company_id", MSG.option);
  const code = v.str("code", true);
  if (code && d.contracts.some((c) => c.id !== existing?.id && norm(c.code) === norm(code))) v.fail("code", MSG.codeTaken);
  const name = v.str("name", true);
  const starts_on = v.date("starts_on", true);
  const ends_on = v.date("ends_on");
  v.order("starts_on", "ends_on", starts_on, ends_on);
  const manager_id = v.int("manager_id", false, 1);
  if (manager_id && !d.users.some((u) => u.id === manager_id && u.role === "gestor" && u.status === "active")) v.fail("manager_id", MSG.option);
  const timezone = v.str("timezone", true);
  const photos = ["required", "optional"] as const;
  const photo_before = v.oneOf("photo_before", photos, true);
  const photo_after = v.oneOf("photo_after", photos, true);
  const cpd = v.int("default_cleanings_per_day", true, 1);
  const wd = weekdays(v, "default_weekdays", true);
  const rawShifts = merged["shifts"];
  let shifts: ("manha" | "tarde" | "noite")[] = [];
  if (!Array.isArray(rawShifts) || rawShifts.length === 0) v.fail("shifts", MSG.required);
  else if (rawShifts.some((s) => !["manha", "tarde", "noite"].includes(String(s)))) v.fail("shifts", MSG.option);
  else shifts = [...new Set(rawShifts as ("manha" | "tarde" | "noite")[])];
  const target = v.int("monthly_target", true, 1);
  if (target !== null && target > 100) v.fail("monthly_target", "Informe um valor de 1 a 100.");
  if (v.fields["monthly_target"] === MSG.option) v.fields["monthly_target"] = "Informe um valor de 1 a 100.";
  const access = v.oneOf("cleaning_access", ["all", "assigned"] as const, true);
  v.done();
  return { company_id: company_id!, code: code!, name: name!, starts_on: starts_on!, ends_on: ends_on, manager_id: manager_id, timezone: timezone!,
    rules: { photo_before: photo_before!, photo_after: photo_after!, default_cleanings_per_day: cpd!, default_weekdays: wd!, shifts, monthly_target: target!, cleaning_access: access! } };
}
on("GET", "/contracts", ({ d, me, query }) => {
  const ids = scopeIds(d, me);
  const status = query.get("status");
  return list(d.contracts.filter((c) => ids.has(c.id) && (!status || c.status === status)).map((c) => contract(d, c)));
});
on("POST", "/contracts", ({ d, me, body }) => {
  requireAdmin(me);
  const row: DbContract = { id: nextId(d.contracts), status: "draft", ...contractInput(d, body) };
  d.contracts.push(row);
  let id = nextId(d.checklist);
  DEFAULT_CHECKLIST.forEach((label, i) => d.checklist.push({ id: id++, contract_id: row.id, label, position: i + 1, active: true }));
  audit(d, me, "contract.created", "contract", row.id, null, { code: row.code, name: row.name });
  return ok(contractDetail(d, row), 201);
});
on("GET", "/contracts/{id}", ({ d, me, p }) => ok(contractDetail(d, getContractFor(d, me, p[0]!))));
on("PATCH", "/contracts/{id}", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  if (me.role === "gestor" && "manager_id" in body && Number(body["manager_id"]) !== c.manager_id) throw forbidden();
  const before = contract(d, c);
  Object.assign(c, contractInput(d, body, c));
  audit(d, me, "contract.updated", "contract", c.id, before, contract(d, c));
  return ok(contractDetail(d, c));
});
on("DELETE", "/contracts/{id}", ({ d, me, p }) => {
  requireAdmin(me);
  const c = getContractFor(d, me, p[0]!);
  const counts = {
    bathrooms: d.bathrooms.filter((b) => b.contract_id === c.id).length,
    teams: d.teams.filter((t) => t.contract_id === c.id).length,
    fiscals: d.fiscal_links.filter((l) => l.contract_id === c.id).length,
  };
  if (c.status !== "draft" || counts.bathrooms || counts.teams || counts.fiscals) throw hasHistory(counts);
  d.contracts = d.contracts.filter((x) => x.id !== c.id);
  d.checklist = d.checklist.filter((x) => x.contract_id !== c.id);
  d.locations = d.locations.filter((x) => x.contract_id !== c.id);
  return noContent();
});
on("GET", "/contracts/{id}/activation", ({ d, me, p }) => ok(activation(d, getContractFor(d, me, p[0]!))));
function transition(from: DbContract["status"][], to: DbContract["status"], action: string, needReason: boolean, adminOnly = false): Handler {
  return ({ d, me, p, body }) => {
    if (adminOnly) requireAdmin(me);
    const c = getContractFor(d, me, p[0]!, true);
    const v = new V(body); const reason = v.str("reason", needReason); v.done();
    if (!from.includes(c.status)) throw conflict("Esta ação não vale para a situação atual do contrato.");
    if (to === "active") {
      const a = activation(d, c);
      if (!a.ready) throw conflict("O contrato ainda não pode ser ativado. Resolva as pendências.", { missing: a.missing });
    }
    const before = c.status;
    c.status = to;
    if (to === "ended" && !c.ends_on) c.ends_on = today();
    audit(d, me, action, "contract", c.id, { status: before }, { status: to }, reason);
    return ok(contractDetail(d, c));
  };
}
on("POST", "/contracts/{id}/activate", transition(["draft"], "active", "contract.activated", false));
on("POST", "/contracts/{id}/reactivate", transition(["suspended"], "active", "contract.reactivated", false));
on("POST", "/contracts/{id}/suspend", transition(["active"], "suspended", "contract.suspended", true));
on("POST", "/contracts/{id}/end", transition(["draft", "active", "suspended"], "ended", "contract.ended", true, true));

// Fiscais
on("POST", "/contracts/{id}/fiscals", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const v = new V(body);
  const user_id = v.int("user_id", true, 1);
  const u = d.users.find((x) => x.id === user_id);
  if (user_id && (!u || u.role !== "fiscal" || u.company_id !== c.company_id || u.status !== "active")) v.fail("user_id", MSG.option);
  const starts_on = v.date("starts_on", true);
  const ends_on = v.date("ends_on");
  v.order("starts_on", "ends_on", starts_on, ends_on);
  if (u && d.fiscal_links.some((l) => l.contract_id === c.id && l.user_id === u.id && (l.ends_on === null || l.ends_on >= today())))
    v.fail("user_id", "Este fiscal já está vinculado ao contrato.");
  v.done();
  const row = { id: nextId(d.fiscal_links), contract_id: c.id, user_id: user_id!, starts_on: starts_on!, ends_on: ends_on };
  d.fiscal_links.push(row);
  audit(d, me, "fiscal.linked", "user", user_id!, null, { contract_id: c.id, starts_on, ends_on });
  return ok(fiscalLink(d, row.id), 201);
});
on("POST", "/contracts/{id}/fiscals/{link}/end", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const l = d.fiscal_links.find((x) => x.id === p[1] && x.contract_id === c.id);
  if (!l) throw notFound();
  const v = new V(body); const ends_on = v.date("ends_on", true); v.order("starts_on", "ends_on", l.starts_on, ends_on); v.done();
  l.ends_on = ends_on;
  audit(d, me, "fiscal.unlinked", "user", l.user_id, { contract_id: c.id }, { ends_on });
  return ok(fiscalLink(d, l.id));
});

// Checklist
on("GET", "/contracts/{id}/checklist", ({ d, me, p }) => list(checklistOf(d, getContractFor(d, me, p[0]!).id)));
on("POST", "/contracts/{id}/checklist", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const v = new V(body); const label = v.str("label", true); v.done();
  const items = d.checklist.filter((i) => i.contract_id === c.id);
  const row = { id: nextId(d.checklist), contract_id: c.id, label: label!, position: items.length + 1, active: true };
  d.checklist.push(row);
  return ok({ id: row.id, label: row.label, position: row.position, active: row.active }, 201);
});
on("POST", "/contracts/{id}/checklist/reorder", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const ids = Array.isArray(body["ids"]) ? (body["ids"] as unknown[]).map(Number) : [];
  const items = d.checklist.filter((i) => i.contract_id === c.id);
  if (ids.length !== items.length || items.some((i) => !ids.includes(i.id)))
    throw new HttpError(422, "validation_failed", "Confira os campos destacados.", { ids: "Envie todos os itens do checklist." });
  ids.forEach((id, idx) => { items.find((i) => i.id === id)!.position = idx + 1; });
  return list(checklistOf(d, c.id));
});
on("PATCH", "/contracts/{id}/checklist/{item}", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const it = d.checklist.find((i) => i.id === p[1] && i.contract_id === c.id);
  if (!it) throw notFound();
  const v = new V({ label: it.label, ...body }); const label = v.str("label", true); const active = v.bool("active"); v.done();
  it.label = label!;
  if (active !== null) it.active = active;
  return ok({ id: it.id, label: it.label, position: it.position, active: it.active });
});
on("DELETE", "/contracts/{id}/checklist/{item}", ({ d, me, p }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const it = d.checklist.find((i) => i.id === p[1] && i.contract_id === c.id);
  if (!it) throw notFound();
  d.checklist = d.checklist.filter((i) => i.id !== it.id);
  d.checklist.filter((i) => i.contract_id === c.id).sort((a, b) => a.position - b.position).forEach((i, idx) => { i.position = idx + 1; });
  return noContent();
});

// Locais
on("GET", "/contracts/{id}/locations", ({ d, me, p }) => {
  const c = getContractFor(d, me, p[0]!);
  return list(d.locations.filter((l) => l.contract_id === c.id).map((l) => location(d, l.id)));
});
on("POST", "/contracts/{id}/locations", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const v = new V(body); const name = v.str("name", true);
  if (name && d.locations.some((l) => l.contract_id === c.id && norm(l.name) === norm(name))) v.fail("name", "Já existe um local com este nome no contrato.");
  v.done();
  const row = { id: nextId(d.locations), contract_id: c.id, name: name!, status: "active" as const };
  d.locations.push(row);
  return ok(location(d, row.id), 201);
});
on("PATCH", "/locations/{id}", ({ d, me, p, body }) => {
  const l = find(d.locations, p[0]!);
  getContractFor(d, me, l.contract_id, true);
  const v = new V({ ...l, ...body });
  const name = v.str("name", true);
  if (name && d.locations.some((x) => x.id !== l.id && x.contract_id === l.contract_id && norm(x.name) === norm(name))) v.fail("name", "Já existe um local com este nome no contrato.");
  const status = v.oneOf("status", ["active", "inactive"] as const, true);
  v.done();
  l.name = name!; l.status = status!;
  return ok(location(d, l.id));
});
on("DELETE", "/locations/{id}", ({ d, me, p }) => {
  const l = find(d.locations, p[0]!);
  getContractFor(d, me, l.contract_id, true);
  const n = d.bathrooms.filter((b) => b.location_id === l.id).length;
  if (n) throw conflict("Este local tem banheiros. Mova ou exclua os banheiros antes.", { counts: { bathrooms: n } });
  d.locations = d.locations.filter((x) => x.id !== l.id);
  return noContent();
});

// Banheiros
function bathroomInput(d: MockDb, contractId: number, body: Body, existing?: DbBathroom) {
  const v = new V(existing ? { ...existing, ...body } : body);
  const name = v.str("name", true);
  if (name && d.bathrooms.some((b) => b.id !== existing?.id && b.contract_id === contractId && norm(b.name) === norm(name))) v.fail("name", MSG.bathroomTaken);
  const location_id = v.int("location_id", false, 1);
  if (location_id && !d.locations.some((l) => l.id === location_id && l.contract_id === contractId)) v.fail("location_id", MSG.option);
  const kind = v.oneOf("kind", ["masculino", "feminino", "unissex", "pcd"] as const, true);
  const cleanings_per_day = v.int("cleanings_per_day", false, 1);
  const wd = weekdays(v, "weekdays");
  const floor = v.str("floor"); const notes = v.str("notes");
  v.done();
  return { name: name!, location_id, kind: kind!, floor, notes, cleanings_per_day, weekdays: wd };
}
on("GET", "/bathrooms", ({ d, me, query }) => {
  const ids = scopeIds(d, me);
  const cid = query.get("contract_id"); const q = norm(query.get("q") ?? "").trim(); const status = query.get("status");
  const all = d.bathrooms.filter((b) => {
    if (!ids.has(b.contract_id)) return false;
    if (me.role === "limpeza" && !canClean(d, me.id, b, d.contracts.find((c) => c.id === b.contract_id)!)) return false;
    if (cid && b.contract_id !== Number(cid)) return false;
    if (status && b.status !== status) return false;
    if (q) {
      const loc = d.locations.find((l) => l.id === b.location_id)?.name ?? "";
      const ct = d.contracts.find((c) => c.id === b.contract_id);
      const co = d.companies.find((x) => x.id === ct?.company_id);
      if (!norm(`${b.name} ${loc} ${b.floor ?? ""} ${b.qr_token} ${ct?.code ?? ""} ${ct?.name ?? ""} ${co?.name ?? ""}`).includes(q)) return false;
    }
    return true;
  });
  const rows = all.slice(0, 50);
  return ok(rows.map((b) => bathroom(d, b)), 200, { total: all.length, limit: 50 });
});
on("POST", "/contracts/{id}/bathrooms", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const row: DbBathroom = { id: nextId(d.bathrooms), contract_id: c.id, qr_token: newQrToken(d), status: "active", ...bathroomInput(d, c.id, body) };
  d.bathrooms.push(row);
  audit(d, me, "bathroom.created", "bathroom", row.id, null, { name: row.name });
  return ok(bathroomDetail(d, row), 201);
});
function bathroomFor(c: Ctx, manage = false) {
  const b = find(c.d.bathrooms, c.p[0]!);
  getContractFor(c.d, c.me, b.contract_id, manage);
  return b;
}
on("GET", "/bathrooms/{id}", (c) => ok(bathroomDetail(c.d, bathroomFor(c))));
on("PATCH", "/bathrooms/{id}", (c) => {
  const b = bathroomFor(c, true);
  const before = bathroom(c.d, b);
  Object.assign(b, bathroomInput(c.d, b.contract_id, c.body, b));
  audit(c.d, c.me, "bathroom.updated", "bathroom", b.id, before, bathroom(c.d, b));
  return ok(bathroomDetail(c.d, b));
});
on("DELETE", "/bathrooms/{id}", (c) => {
  const b = bathroomFor(c, true);
  const counts = { status_periods: c.d.status_periods.filter((s) => s.bathroom_id === b.id).length };
  if (counts.status_periods) throw hasHistory(counts);
  c.d.bathrooms = c.d.bathrooms.filter((x) => x.id !== b.id);
  c.d.bathroom_cleaners = c.d.bathroom_cleaners.filter((x) => x.bathroom_id !== b.id);
  return noContent();
});
const setBathroomStatus = (status: "active" | "inactive"): Handler => (c) => {
  const b = bathroomFor(c, true);
  const before = b.status; b.status = status;
  audit(c.d, c.me, status === "active" ? "bathroom.reactivated" : "bathroom.inactivated", "bathroom", b.id, { status: before }, { status });
  return ok(bathroomDetail(c.d, b));
};
on("POST", "/bathrooms/{id}/inactivate", setBathroomStatus("inactive"));
on("POST", "/bathrooms/{id}/reactivate", setBathroomStatus("active"));
on("POST", "/bathrooms/{id}/regenerate-qr", (c) => {
  const b = bathroomFor(c, true);
  const old = b.qr_token; b.qr_token = newQrToken(c.d);
  audit(c.d, c.me, "bathroom.qr_regenerated", "bathroom", b.id, { qr_token: old }, { qr_token: b.qr_token });
  return ok(bathroomDetail(c.d, b));
});
on("GET", "/bathrooms/{id}/status-periods", (c) => list(c.d.status_periods.filter((s) => s.bathroom_id === bathroomFor(c).id)));
on("POST", "/bathrooms/{id}/status-periods", (c) => {
  const b = bathroomFor(c, true);
  const v = new V(c.body);
  const starts_on = v.date("starts_on", true); const ends_on = v.date("ends_on", true); const reason = v.str("reason", true);
  v.order("starts_on", "ends_on", starts_on, ends_on);
  if (starts_on && ends_on && c.d.status_periods.some((s) => s.bathroom_id === b.id && s.starts_on <= ends_on && s.ends_on >= starts_on))
    v.fail("starts_on", "Já existe uma interdição neste período.");
  v.done();
  const row = { id: nextId(c.d.status_periods), bathroom_id: b.id, starts_on: starts_on!, ends_on: ends_on!, reason: reason! };
  c.d.status_periods.push(row);
  audit(c.d, c.me, "bathroom.interdicted", "bathroom", b.id, null, row, reason);
  return ok(row, 201);
});
on("DELETE", "/status-periods/{id}", ({ d, me, p }) => {
  const s = find(d.status_periods, p[0]!);
  getContractFor(d, me, find(d.bathrooms, s.bathroom_id).contract_id, true);
  d.status_periods = d.status_periods.filter((x) => x.id !== s.id);
  return noContent();
});
// GET /q/{token} é tratado em handleMock (o token não é numérico).
on("GET", "/contracts/{id}/labels", ({ d, me, p }) => {
  requireStaff(me);
  const c = getContractFor(d, me, p[0]!);
  return list(d.bathrooms.filter((b) => b.contract_id === c.id && b.status === "active").map((b) => ({
    bathroom_id: b.id, name: b.name, location: opt(d.locations.find((l) => l.id === b.location_id)?.name ?? null),
    url: `https://wccheck.com.br/q/${b.qr_token}`,
  })));
});

// Transferência de banheiros: muda contrato e empresa, mantém o QR e todo o histórico.
on("POST", "/bathrooms/transfer", ({ d, me, body }) => {
  requireStaff(me);
  const v = new V(body);
  const ids = Array.isArray(body["bathroom_ids"]) ? [...new Set((body["bathroom_ids"] as unknown[]).map(Number))] : [];
  if (!ids.length) v.fail("bathroom_ids", "Escolha pelo menos um banheiro.");
  const to_id = v.int("to_contract_id", true, 1);
  const location_id = v.int("location_id", false, 1);
  const date = v.date("date", true);
  const reason = v.str("reason", true);
  const managed = (cid: number) => me.role === "admin" || d.contracts.find((c) => c.id === cid)?.manager_id === me.id;
  const to = to_id ? d.contracts.find((c) => c.id === to_id) : undefined;
  if (to_id && (!to || !managed(to.id) || to.status === "ended")) v.fail("to_contract_id", MSG.option);
  if (location_id && !d.locations.some((l) => l.id === location_id && l.contract_id === to_id)) v.fail("location_id", MSG.option);
  const rows = ids.map((id) => d.bathrooms.find((b) => b.id === id));
  if (rows.some((b) => !b || !scopeIds(d, me).has(b.contract_id))) throw notFound();
  if (rows.some((b) => !managed(b!.contract_id))) throw forbidden();
  if (to && rows.some((b) => b!.contract_id === to.id)) v.fail("to_contract_id", "Um dos banheiros já está neste contrato.");
  if (to) for (const b of rows) if (d.bathrooms.some((x) => x.contract_id === to.id && norm(x.name) === norm(b!.name)))
    v.fail("to_contract_id", `O contrato de destino já tem um banheiro chamado "${b!.name}".`);
  v.done();
  for (const b of rows as DbBathroom[]) {
    const from = d.contracts.find((c) => c.id === b.contract_id)!;
    const before = { contract: from.code, company_id: from.company_id };
    b.contract_id = to!.id; b.location_id = location_id;
    // responsáveis do contrato antigo não valem no novo
    d.bathroom_cleaners = d.bathroom_cleaners.filter((x) => x.bathroom_id !== b.id);
    audit(d, me, "bathroom.transferred", "bathroom", b.id, before, { contract: to!.code, company_id: to!.company_id, date }, reason);
  }
  return list((rows as DbBathroom[]).map((b) => bathroom(d, b)));
});

// Responsáveis por banheiro (contrato em "Pessoas escolhidas por banheiro")
const cleanerView = (d: MockDb, uid: number) => ({ id: uid, name: d.users.find((u) => u.id === uid)?.name ?? "—" });
on("GET", "/bathrooms/{id}/cleaners", (c) => {
  const b = bathroomFor(c);
  return list(c.d.bathroom_cleaners.filter((x) => x.bathroom_id === b.id).map((x) => cleanerView(c.d, x.user_id)));
});
on("PUT", "/bathrooms/{id}/cleaners", (c) => {
  const b = bathroomFor(c, true);
  const raw = c.body["user_ids"];
  const v = new V(c.body);
  const ids = Array.isArray(raw) ? [...new Set(raw.map(Number))] : null;
  if (!ids) v.fail("user_ids", MSG.required);
  else if (ids.some((id) => !c.d.users.some((u) => u.id === id && u.role === "limpeza" && u.status === "active"))) v.fail("user_ids", MSG.option);
  v.done();
  const before = c.d.bathroom_cleaners.filter((x) => x.bathroom_id === b.id).map((x) => x.user_id);
  c.d.bathroom_cleaners = [...c.d.bathroom_cleaners.filter((x) => x.bathroom_id !== b.id), ...ids!.map((user_id) => ({ bathroom_id: b.id, user_id }))];
  audit(c.d, c.me, "bathroom.cleaners_changed", "bathroom", b.id, { user_ids: before }, { user_ids: ids });
  return list(ids!.map((id) => cleanerView(c.d, id)));
});
on("GET", "/users/{id}/bathrooms", ({ d, me, p }) => {
  const u = getUserFor(d, me, p[0]!);
  const ids = scopeIds(d, me);
  return list(d.bathroom_cleaners.filter((x) => x.user_id === u.id).map((x) => d.bathrooms.find((b) => b.id === x.bathroom_id)!)
    .filter((b) => b && ids.has(b.contract_id)).map((b) => {
      const ct = d.contracts.find((c) => c.id === b.contract_id)!;
      return { id: b.id, name: b.name, location: opt(d.locations.find((l) => l.id === b.location_id)?.name ?? null), contract: { id: ct.id, code: ct.code, name: ct.name } };
    }));
});
on("POST", "/cleaners/transfer", ({ d, me, body }) => {
  requireStaff(me);
  const v = new V(body);
  const from = v.int("from_user_id", true, 1); const to = v.int("to_user_id", true, 1); const reason = v.str("reason", true);
  const ids = Array.isArray(body["bathroom_ids"]) ? [...new Set((body["bathroom_ids"] as unknown[]).map(Number))] : [];
  if (!ids.length) v.fail("bathroom_ids", "Escolha pelo menos um banheiro.");
  if (to && (to === from || !d.users.some((u) => u.id === to && u.role === "limpeza" && u.status === "active"))) v.fail("to_user_id", MSG.option);
  v.done();
  for (const bid of ids) {
    const b = d.bathrooms.find((x) => x.id === bid);
    if (!b || !d.bathroom_cleaners.some((x) => x.bathroom_id === bid && x.user_id === from)) throw notFound();
    getContractFor(d, me, b.contract_id, true);
  }
  for (const bid of ids) {
    d.bathroom_cleaners = d.bathroom_cleaners.filter((x) => !(x.bathroom_id === bid && x.user_id === from));
    if (!d.bathroom_cleaners.some((x) => x.bathroom_id === bid && x.user_id === to)) d.bathroom_cleaners.push({ bathroom_id: bid, user_id: to! });
    audit(d, me, "bathroom.cleaners_changed", "bathroom", bid, { user_ids: [from] }, { user_ids: [to] }, reason);
  }
  audit(d, me, "user.bathrooms_transferred", "user", from!, { bathroom_ids: ids }, { to_user_id: to }, reason);
  return ok({ moved: ids.length });
});

// Equipes
on("GET", "/contracts/{id}/teams", ({ d, me, p }) => {
  const c = getContractFor(d, me, p[0]!);
  return list(d.teams.filter((t) => t.contract_id === c.id).map((t) => team(d, t)));
});
on("POST", "/contracts/{id}/teams", ({ d, me, p, body }) => {
  const c = getContractFor(d, me, p[0]!, true);
  const v = new V(body);
  const name = v.str("name", true);
  const kind = v.oneOf("kind", ["limpeza", "manutencao"] as const, true);
  const shift = v.oneOf("shift", ["manha", "tarde", "noite"] as const);
  v.done();
  const row: DbTeam = { id: nextId(d.teams), contract_id: c.id, kind: kind!, name: name!, shift, status: "active" };
  d.teams.push(row);
  audit(d, me, "team.created", "team", row.id, null, row);
  return ok(team(d, row), 201);
});
function teamFor(c: Ctx, id: number, manage = false) {
  const t = find(c.d.teams, id);
  getContractFor(c.d, c.me, t.contract_id, manage);
  return t;
}
on("PATCH", "/teams/{id}", (c) => {
  const t = teamFor(c, c.p[0]!, true);
  const v = new V({ ...t, ...c.body });
  const name = v.str("name", true);
  const shift = v.oneOf("shift", ["manha", "tarde", "noite"] as const);
  const status = v.oneOf("status", ["active", "inactive"] as const, true);
  v.done();
  const before = { ...t };
  Object.assign(t, { name: name!, shift, status: status! });
  audit(c.d, c.me, "team.updated", "team", t.id, before, t);
  return ok(team(c.d, t));
});
on("DELETE", "/teams/{id}", (c) => {
  const t = teamFor(c, c.p[0]!, true);
  const counts = { members: c.d.members.filter((m) => m.team_id === t.id).length };
  if (counts.members) throw hasHistory(counts);
  c.d.teams = c.d.teams.filter((x) => x.id !== t.id);
  return noContent();
});
on("GET", "/teams/{id}/members", (c) => {
  const t = teamFor(c, c.p[0]!);
  const past = c.query.get("include_past") === "1";
  return list(c.d.members.filter((m) => m.team_id === t.id && (past || isCurrent(m) || m.starts_on > today())).map((m) => member(c.d, m)));
});
function validMemberFor(v: V, d: MockDb, t: DbTeam, userId: number | null, on: string | null, ignoreId?: number) {
  const u = d.users.find((x) => x.id === userId);
  if (userId && (!u || u.status !== "active" || u.role !== t.kind)) v.fail("user_id", MSG.option);
  if (u && on && d.members.some((m) => m.id !== ignoreId && m.team_id === t.id && m.user_id === u.id && (m.ends_on === null || m.ends_on > on)))
    v.fail("user_id", "Esta pessoa já está nesta equipe.");
}
on("POST", "/teams/{id}/members", (c) => {
  const t = teamFor(c, c.p[0]!, true);
  const v = new V(c.body);
  if (Array.isArray(c.body["user_ids"])) {
    // Vários de uma vez: se alguém não puder entrar, recusa tudo (422 em fields.user_ids).
    const starts_on = v.date("starts_on", true);
    const ids = [...new Set((c.body["user_ids"] as unknown[]).map(Number))];
    if (ids.length === 0 || ids.some((x) => !Number.isInteger(x) || x < 1)) v.fail("user_ids", MSG.required);
    else for (const id of ids) {
      const one = new V({});
      validMemberFor(one, c.d, t, id, starts_on);
      if (one.fields["user_id"]) { v.fail("user_ids", `${c.d.users.find((u) => u.id === id)?.name ?? `Pessoa ${id}`}: ${one.fields["user_id"]}`); break; }
    }
    v.done();
    const rows = ids.map((id) => {
      const row: DbMember = { id: nextId(c.d.members), team_id: t.id, user_id: id, starts_on: starts_on!, ends_on: null, removal_reason: null };
      c.d.members.push(row);
      audit(c.d, c.me, "team_member.added", "user", id, null, { team_id: t.id, starts_on });
      return member(c.d, row);
    });
    return ok(rows, 201);
  }
  const user_id = v.int("user_id", true, 1); const starts_on = v.date("starts_on", true);
  validMemberFor(v, c.d, t, user_id, starts_on);
  v.done();
  const row: DbMember = { id: nextId(c.d.members), team_id: t.id, user_id: user_id!, starts_on: starts_on!, ends_on: null, removal_reason: null };
  c.d.members.push(row);
  audit(c.d, c.me, "team_member.added", "user", user_id!, null, { team_id: t.id, starts_on });
  return ok(member(c.d, row), 201);
});
function memberFor(c: Ctx) {
  const m = find(c.d.members, c.p[0]!);
  const t = teamFor(c, m.team_id, true);
  if (m.ends_on !== null && m.ends_on <= today()) throw conflict("Este vínculo já foi encerrado.");
  return { m, t };
}
on("POST", "/team-members/{id}/end", (c) => {
  const { m } = memberFor(c);
  const v = new V(c.body);
  const ends_on = v.date("ends_on", true); const reason = v.str("reason", true);
  v.order("starts_on", "ends_on", m.starts_on, ends_on);
  v.done();
  m.ends_on = ends_on; m.removal_reason = reason;
  audit(c.d, c.me, "team_member.removed", "user", m.user_id, { team_id: m.team_id }, { ends_on }, reason);
  return ok(member(c.d, m));
});
on("POST", "/team-members/{id}/move", (c) => {
  const { m, t } = memberFor(c);
  const v = new V(c.body);
  const to_team_id = v.int("to_team_id", true, 1); const date = v.date("date", true); const reason = v.str("reason", true);
  const to = c.d.teams.find((x) => x.id === to_team_id);
  if (to_team_id && (!to || to.id === t.id || to.status !== "active" || to.kind !== t.kind || !scopeIds(c.d, c.me).has(to.contract_id))) v.fail("to_team_id", MSG.option);
  else if (to && c.me.role === "gestor" && c.d.contracts.find((x) => x.id === to.contract_id)?.manager_id !== c.me.id) v.fail("to_team_id", MSG.option);
  v.order("starts_on", "date", m.starts_on, date);
  if (to && date) validMemberFor(v, c.d, to, m.user_id, date);
  v.done();
  m.ends_on = date; m.removal_reason = reason;
  const row: DbMember = { id: nextId(c.d.members), team_id: to!.id, user_id: m.user_id, starts_on: date!, ends_on: null, removal_reason: null };
  c.d.members.push(row);
  audit(c.d, c.me, "team_member.moved", "user", m.user_id, { team_id: t.id }, { team_id: to!.id, date }, reason);
  return ok(member(c.d, row));
});

// Pessoas
const ROLES = ["admin", "gestor", "fiscal", "limpeza", "manutencao"] as const;
function userInput(d: MockDb, me: DbUser, body: Body, existing?: DbUser) {
  const v = new V(existing ? { ...existing, ...body } : body);
  const name = v.str("name", true);
  const email = v.email("email");
  if (email && !v.fields["email"] && d.users.some((u) => u.id !== existing?.id && u.email === email)) v.fail("email", MSG.emailTaken);
  const phone = v.str("phone");
  const role = existing ? existing.role : v.oneOf("role", ROLES, true);
  if (!existing && role && me.role === "gestor" && role !== "limpeza" && role !== "manutencao") v.fail("role", MSG.option);
  let company_id = existing ? existing.company_id : v.int("company_id", false, 1);
  if (role === "fiscal") {
    if (!company_id) v.fail("company_id", MSG.required);
    else if (!d.companies.some((c) => c.id === company_id)) v.fail("company_id", MSG.option);
  } else company_id = null;
  v.done();
  return { name: name!, email: email!, phone, role: role!, company_id };
}
on("GET", "/users", ({ d, me, query }) => {
  requireStaff(me);
  const role = query.get("role"); const status = query.get("status"); const q = norm(query.get("q") ?? "").trim();
  return list(visibleUsers(d, me).filter((u) => (!role || u.role === role) && (!status || u.status === status) && (!q || norm(`${u.name} ${u.email}`).includes(q))).map(pubUser));
});
on("POST", "/users", ({ d, me, body }) => {
  requireStaff(me);
  const input = userInput(d, me, body);
  const temporary_password = tempPassword();
  const row: DbUser = { id: nextId(d.users), ...input, status: "active", must_change_password: true, password: temporary_password };
  d.users.push(row);
  audit(d, me, "user.created", "user", row.id, null, pubUser(row));
  return ok({ user: pubUser(row), temporary_password }, 201);
});
on("GET", "/users/{id}", ({ d, me, p }) => {
  const u = getUserFor(d, me, p[0]!);
  return ok({ ...pubUser(u), memberships: d.members.filter((m) => m.user_id === u.id).map((m) => membership(d, m)) });
});
on("PATCH", "/users/{id}", ({ d, me, p, body }) => {
  const u = getUserFor(d, me, p[0]!, true);
  const before = pubUser(u);
  Object.assign(u, userInput(d, me, body, u));
  audit(d, me, "user.updated", "user", u.id, before, pubUser(u));
  return ok(pubUser(u));
});
on("DELETE", "/users/{id}", ({ d, me, p }) => {
  const u = getUserFor(d, me, p[0]!, true);
  const counts = {
    memberships: d.members.filter((m) => m.user_id === u.id).length,
    fiscal_links: d.fiscal_links.filter((l) => l.user_id === u.id).length,
    contracts: d.contracts.filter((c) => c.manager_id === u.id).length,
    events: d.audit.filter((a) => a.actor_id === u.id).length,
  };
  if (Object.values(counts).some(Boolean)) throw hasHistory(counts);
  d.users = d.users.filter((x) => x.id !== u.id);
  return noContent();
});
on("POST", "/users/{id}/inactivate", ({ d, me, p, body }) => {
  const u = getUserFor(d, me, p[0]!, true);
  if (u.id === me.id) throw conflict("Você não pode inativar a sua própria conta.");
  const v = new V(body); const reason = v.str("reason", true); v.done();
  const managed = d.contracts.filter((c) => c.manager_id === u.id && (c.status === "active" || c.status === "suspended"));
  if (managed.length) throw conflict("Esta pessoa é gestora de contratos ativos. Troque o gestor antes de inativar.", { contracts: managed.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })) });
  u.status = "inactive";
  d.revoked_tokens.push(`mock-token-${u.id}`);
  for (const m of d.members.filter((x) => x.user_id === u.id && (x.ends_on === null || x.ends_on > today()))) {
    m.ends_on = today(); m.removal_reason = reason;
  }
  audit(d, me, "user.inactivated", "user", u.id, { status: "active" }, { status: "inactive" }, reason);
  return ok(pubUser(u));
});
on("POST", "/users/{id}/reactivate", ({ d, me, p }) => {
  const u = getUserFor(d, me, p[0]!, true);
  u.status = "active";
  d.revoked_tokens = d.revoked_tokens.filter((t) => t !== `mock-token-${u.id}`);
  audit(d, me, "user.reactivated", "user", u.id, { status: "inactive" }, { status: "active" });
  return ok(pubUser(u));
});
on("PATCH", "/users/{id}/role", ({ d, me, p, body }) => {
  requireAdmin(me);
  const u = getUserFor(d, me, p[0]!);
  const v = new V(body);
  const role = v.oneOf("role", ROLES, true); const reason = v.str("reason", true);
  let company_id = v.int("company_id", false, 1);
  if (role === "fiscal") {
    if (!company_id) v.fail("company_id", MSG.required);
    else if (!d.companies.some((c) => c.id === company_id)) v.fail("company_id", MSG.option);
  } else company_id = null;
  v.done();
  const managed = d.contracts.filter((c) => c.manager_id === u.id && ["draft", "active", "suspended"].includes(c.status));
  if (managed.length) throw conflict("Esta pessoa é gestora de contratos em andamento. Troque o gestor antes.", { contracts: managed.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })) });
  const t = today();
  for (const m of d.members.filter((x) => x.user_id === u.id && (x.ends_on === null || x.ends_on > t))) {
    m.ends_on = t; m.removal_reason = `Mudança de função: ${reason}`;
  }
  for (const f of d.fiscal_links.filter((x) => x.user_id === u.id && (x.ends_on === null || x.ends_on > t))) f.ends_on = t;
  if (!d.revoked_tokens.includes(`mock-token-${u.id}`)) d.revoked_tokens.push(`mock-token-${u.id}`);
  const before = { role: u.role, company_id: u.company_id };
  u.role = role!; u.company_id = company_id;
  audit(d, me, "user.role_changed", "user", u.id, before, { role, company_id }, reason);
  return ok(pubUser(u));
});
on("GET", "/users/{id}/history", ({ d, me, p }) => {
  const u = getUserFor(d, me, p[0]!);
  return ok({
    events: d.audit.filter((a) => a.entity === "user" && a.entity_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => auditEvent(d, a)),
    memberships: d.members.filter((m) => m.user_id === u.id).sort((a, b) => b.starts_on.localeCompare(a.starts_on)).map((m) => membership(d, m)),
  });
});

// ---------- entrada ----------
export function handleMock(method: string, rawPath: string, body: unknown, token: string | null): MockResponse {
  const d = load();
  const [path, search] = rawPath.replace(/^\/api(?=\/)/, "").split("?");
  const query = new URLSearchParams(search ?? "");
  const b = (typeof FormData !== "undefined" && body instanceof FormData
    ? Object.fromEntries(body.entries())
    : body && typeof body === "object" ? body : {}) as Body;
  try {
    if (method === "GET" && path === "/health") return ok({ db: "ok", disk_free_mb: 10240 });
    const pub = handlePublic(method, path!, b, d);
    if (pub) { if (method !== "GET") save(); return pub; }
    if (method === "POST" && path === "/auth/login") {
      const email = String(b["email"] ?? "").trim().toLowerCase();
      const u = d.users.find((x) => x.email === email);
      if (!u || u.password !== b["password"] || u.status !== "active")
        throw new HttpError(401, "unauthenticated", "E-mail ou senha incorretos.");
      const t = `mock-token-${u.id}`;
      d.revoked_tokens = d.revoked_tokens.filter((x) => x !== t);
      save();
      return ok({ token: t, user: pubUser(u) });
    }
    const me = token?.startsWith("mock-token-") && !d.revoked_tokens.includes(token)
      ? d.users.find((u) => u.id === Number(token.slice(11)) && u.status === "active") : undefined;
    if (!me) throw new HttpError(401, "unauthenticated", "Sessão expirada. Entre novamente.");

    if (method === "GET") {
      const qr = path!.match(/^\/q\/([^/]+)$/);
      if (qr) {
        const bt = d.bathrooms.find((x) => x.qr_token === decodeURIComponent(qr[1]!).toUpperCase());
        if (!bt || !scopeIds(d, me).has(bt.contract_id)) throw notFound();
        return ok({ bathroom_id: bt.id, contract_id: bt.contract_id, name: bt.name, status: bt.status });
      }
    }
    const preview = handlePreview(method, path!, query, b, me, d);
    if (preview) { if (method !== "GET" && preview.status < 300) save(); return preview; }
    for (const [m, re, h] of routes) {
      if (m !== method) continue;
      const match = path!.match(re);
      if (!match) continue;
      const p = match.slice(1).map(Number);
      if (p.some((n) => !Number.isInteger(n))) throw notFound();
      const res = h({ d, me, body: b, query, p, token });
      if (method !== "GET") save();
      return res;
    }
    throw notFound();
  } catch (e) {
    if (e instanceof HttpError) {
      if (method !== "GET") db = null; // descarta mudanças parciais: recarrega do último estado salvo
      return { status: e.status, body: { error: { code: e.code, message: e.message, fields: e.fields, ...e.extra } } };
    }
    db = null;
    return { status: 500, body: { error: { code: "server_error", message: "Erro inesperado. Tente novamente.", fields: {} } } };
  }
}
