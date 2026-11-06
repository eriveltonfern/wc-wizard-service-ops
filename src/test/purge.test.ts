import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown, id: number) => handleMock(m, p, b, `mock-token-${id}`) as any;

it("só a diretoria exclui um contrato com todo o histórico, digitando o código", () => {
  resetMockDb();
  const ct = r("GET", "/contracts", null, 1).body.data.find((c: any) => c.status === "active");
  expect(r("DELETE", `/contracts/${ct.id}`, null, 1).body.error.code).toBe("has_history");
  expect(r("POST", `/contracts/${ct.id}/purge`, { confirm: "errado" }, 1).body.error.fields.confirm).toBeTruthy();
  expect(r("POST", `/contracts/${ct.id}/purge`, { confirm: ct.code }, 2).status).toBe(403);
  const ok = r("POST", `/contracts/${ct.id}/purge`, { confirm: ct.code.toLowerCase() }, 1);
  expect(ok.status).toBe(200);
  expect(ok.body.data.deleted.cleanings).toBeGreaterThan(0);
  expect(r("GET", `/contracts/${ct.id}`, null, 1).status).toBe(404);
});

it("excluir empresa com todo o histórico deixa os fiscais inativos e mantém as pessoas", () => {
  resetMockDb();
  const ok = r("POST", "/companies/1/purge", { confirm: r("GET", "/companies/1", null, 1).body.data.name.toUpperCase() }, 1);
  expect(ok.status).toBe(200);
  const carla = r("GET", "/users/3", null, 1).body.data;
  expect(carla.status).toBe("inactive");
});
