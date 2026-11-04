import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown = null, id = 1) => handleMock(m, p, b, `mock-token-${id}`) as any;
const ADMIN = 1, GESTOR = 2, FISCAL = 3;
const month = () => { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const prevMonth = () => { const [y, m] = month().split("-").map(Number); const d = new Date(y!, m! - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

it("regra única: cumprimento = realizado ÷ previsto; extras ficam fora do %", () => {
  resetMockDb();
  const s = r("GET", `/stats?month=${month()}`).body.data;
  const t = s.totals;
  expect(t.expected).toBe(t.done + t.not_done + t.pending);
  expect(t.compliance).toBeCloseTo(t.done / t.expected, 10);
  expect(t.done).toBe(t.on_time + t.late_done);
  const sum = (k: string) => s.by_contract.reduce((n: number, c: any) => n + c[k], 0);
  for (const k of ["expected", "done", "not_done", "extras"]) expect(sum(k)).toBe(t[k]);
  expect(s.by_day.reduce((n: number, d: any) => n + d.done, 0)).toBe(t.done);
});

it("Painel, Histórico, Relatórios e Fechamento mostram os mesmos números para o mesmo filtro", () => {
  resetMockDb();
  const m = month();
  const painel = r("GET", `/stats?month=${m}`).body.data.totals; // Painel "Este mês" (todos os contratos)
  const historico = r("GET", `/history/cleanings?month=${m}`).body.data.totals;
  expect(historico).toEqual(painel);
  const cid = 1;
  const relatorio = r("GET", `/stats?month=${m}&contract_id=${cid}`).body.data;
  const fechamento = r("GET", `/contracts/${cid}/closings`).body.data.find((x: any) => x.month === m).totals;
  const linhaPainel = r("GET", `/stats?month=${m}`).body.data.by_contract.find((x: any) => x.contract.id === cid);
  expect(fechamento).toEqual(relatorio.totals);
  expect({ ...linhaPainel, contract: undefined }).toEqual({ ...relatorio.totals, contract: undefined });
  expect(r("GET", `/history/cleanings?month=${m}&contract_id=${cid}`).body.data.totals).toEqual(relatorio.totals);
});

it("fechamento: só mês terminado, congela totais, bloqueia cancelar; reabrir só diretoria com motivo", () => {
  resetMockDb();
  expect(r("POST", "/contracts/1/closings", { month: month() }, GESTOR).status).toBe(409);
  expect(r("POST", "/contracts/1/closings", { month: prevMonth() }, FISCAL).status).toBe(403);
  const closed = r("POST", "/contracts/1/closings", { month: prevMonth() }, GESTOR).body.data;
  expect(closed.status).toBe("closed");
  expect(closed.closed_by.id).toBe(GESTOR);
  const old = r("GET", "/review?reviewed=1", null, ADMIN).body.data.rows.find((c: any) => c.contract.id === 1 && c.status === "valid" && c.registered_at.slice(0, 7) === prevMonth());
  if (old) expect(r("POST", `/cleanings/${old.id}/cancel`, { reason: "x" }, ADMIN).status).toBe(409);
  expect(r("POST", `/closings/${closed.id}/reopen`, { reason: "x" }, GESTOR).status).toBe(403);
  expect(r("POST", `/closings/${closed.id}/reopen`, { reason: "" }, ADMIN).body.error.fields.reason).toBe("Informe o motivo.");
  expect(r("POST", `/closings/${closed.id}/reopen`, { reason: "Ajuste" }, ADMIN).body.data.status).toBe("open");
});

it("fiscal lê só os contratos dele; pendências e alterações respondem", () => {
  resetMockDb();
  const ids = new Set(r("GET", "/stats", null, FISCAL).body.data.by_contract.map((c: any) => c.contract.id));
  const mine = new Set(r("GET", "/contracts", null, FISCAL).body.data.map((c: any) => c.id));
  for (const id of ids) expect(mine.has(id)).toBe(true);
  expect(Array.isArray(r("GET", "/pending-tasks").body.data)).toBe(true);
  expect(r("GET", "/audit?entity=user").body.data.every((a: any) => a.entity === "user")).toBe(true);
  expect(r("GET", "/stats", null, 4).status).toBe(403);
});
