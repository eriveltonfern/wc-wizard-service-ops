// Avaliações do cliente pelo QR (rotas propostas). Rotas /public/* não exigem login.
import type { DbUser, MockDb } from "../data";
import { type PvRating, type RatingProblem, addDays, loadPreview, opDate, savePreview } from "./preview-data";

type Res = { status: number; body: unknown };
const ok = (data: unknown, status = 200, meta: unknown = null): Res => ({ status, body: { data, meta } });
const err = (status: number, code: string, message: string, fields: Record<string, string> = {}): Res => ({ status, body: { error: { code, message, fields } } });

export const RATING_PROBLEMS: RatingProblem[] = ["sujo", "sem_papel", "sem_sabonete", "mau_cheiro", "lixo_cheio", "vazamento", "outro"];
export const RATING_WINDOW_MIN = 30;
const INACTIVE = "Este QR não está mais ativo.";

function activeBathroom(d: MockDb, token: string) {
  const b = d.bathrooms.find((x) => x.qr_token === decodeURIComponent(token).toUpperCase());
  const c = b && d.contracts.find((x) => x.id === b.contract_id);
  return b && c && b.status === "active" && c.status === "active" ? b : null;
}

export function handlePublic(method: string, path: string, body: Record<string, unknown>, d: MockDb): Res | null {
  const get = path.match(/^\/public\/q\/([^/]+)$/);
  const post = path.match(/^\/public\/q\/([^/]+)\/ratings$/);
  if (method === "GET" && get) {
    const b = activeBathroom(d, get[1]!);
    if (!b) return err(404, "not_found", INACTIVE);
    return ok({ bathroom_name: b.name, location: d.locations.find((l) => l.id === b.location_id)?.name });
  }
  if (method === "POST" && post) {
    const b = activeBathroom(d, post[1]!);
    if (!b) return err(404, "not_found", INACTIVE);
    const fields: Record<string, string> = {};
    const score = Number(body["score"]);
    if (!Number.isInteger(score) || score < 1 || score > 5) fields["score"] = "Escolha uma nota.";
    const problems = Array.isArray(body["problems"]) ? [...new Set(body["problems"].map(String))] : [];
    if (problems.some((p) => !RATING_PROBLEMS.includes(p as RatingProblem))) fields["problems"] = "Escolha uma opção válida.";
    const comment = typeof body["comment"] === "string" ? body["comment"].trim() : "";
    if (comment.length > 300) fields["comment"] = "Use no máximo 300 caracteres.";
    const device = typeof body["device_key"] === "string" ? body["device_key"].trim() : "";
    if (!device) fields["device_key"] = "Campo obrigatório.";
    if (Object.keys(fields).length) return err(422, "validation_failed", "Confira os campos destacados.", fields);
    const p = loadPreview(d);
    const now = Date.now();
    if (p.ratings.some((r) => r.bathroom_id === b.id && r.device_key === device && now - new Date(r.created_at).getTime() < RATING_WINDOW_MIN * 60000))
      return err(429, "too_many_attempts", "Você já avaliou este banheiro agora há pouco.");
    const row: PvRating = {
      id: p.ratings.reduce((m, r) => Math.max(m, r.id), 0) + 1, bathroom_id: b.id, score,
      problems: score <= 3 ? (problems as RatingProblem[]) : [], comment: comment || null, created_at: new Date(now).toISOString(), device_key: device,
    };
    p.ratings.push(row);
    savePreview();
    return ok({ id: row.id }, 201);
  }
  return null;
}

export function handleRatings(method: string, path: string, q: URLSearchParams, me: DbUser, d: MockDb): Res | null {
  if (method !== "GET" || path !== "/ratings") return null;
  if (me.role !== "admin" && me.role !== "gestor" && me.role !== "fiscal") return err(403, "forbidden", "Você não tem permissão para esta tela.");
  // escopo igual ao das outras telas de gestão
  const day = opDate(new Date());
  const cur = (r: { starts_on: string; ends_on: string | null }) => r.starts_on <= day && (r.ends_on === null || r.ends_on >= day);
  const ids = new Set(me.role === "admin" ? d.contracts.map((c) => c.id)
    : me.role === "gestor" ? d.contracts.filter((c) => c.manager_id === me.id).map((c) => c.id)
    : d.fiscal_links.filter((l) => l.user_id === me.id && cur(l)).map((l) => l.contract_id));
  const from = q.get("from") || addDays(day, -29), to = q.get("to") || day;
  const cid = Number(q.get("contract_id")) || null, bid = Number(q.get("bathroom_id")) || null;
  if (cid && !ids.has(cid)) return err(404, "not_found", "Cadastro não encontrado.");
  const p = loadPreview(d);
  const rows = p.ratings.filter((r) => {
    const b = d.bathrooms.find((x) => x.id === r.bathroom_id);
    const date = opDate(new Date(r.created_at));
    return b && ids.has(b.contract_id) && (!cid || b.contract_id === cid) && (!bid || b.id === bid) && date >= from && date <= to;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const view = (r: PvRating) => {
    const b = d.bathrooms.find((x) => x.id === r.bathroom_id)!;
    const c = d.contracts.find((x) => x.id === b.contract_id)!;
    const co = d.companies.find((x) => x.id === c.company_id);
    return { id: r.id, score: r.score, problems: r.problems, comment: r.comment ?? undefined, created_at: r.created_at,
      bathroom: { id: b.id, name: b.name }, location: d.locations.find((l) => l.id === b.location_id)?.name,
      contract: { id: c.id, code: c.code, name: c.name }, company: { id: co?.id ?? 0, name: co?.name ?? "" } };
  };
  const count = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) for (const pr of r.problems) counts.set(pr, (counts.get(pr) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const byBath = new Map<number, number[]>();
  for (const r of rows) byBath.set(r.bathroom_id, [...(byBath.get(r.bathroom_id) ?? []), r.score]);
  const worst = [...byBath].map(([id, s]) => {
    const v = view(rows.find((r) => r.bathroom_id === id)!);
    return { bathroom: v.bathroom, company: v.company, average: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10, count: s.length };
  }).sort((a, b) => a.average - b.average || b.count - a.count).slice(0, 8);
  return ok({
    rows: rows.slice(0, 100).map(view),
    summary: {
      average: count ? Math.round((rows.reduce((a, r) => a + r.score, 0) / count) * 10) / 10 : null,
      count, negative_share: count ? rows.filter((r) => r.score <= 2).length / count : null, top_problem: top, worst,
    },
  }, 200, { total: count });
}
