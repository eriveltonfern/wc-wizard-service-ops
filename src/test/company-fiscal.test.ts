import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const tok = (id: number) => `mock-token-${id}`;
const r = (m: string, p: string, b: unknown, id: number) => handleMock(m, p, b, tok(id)) as any;
const fiscalsOf = (companyId: number) => r("GET", `/companies/${companyId}`, null, 1).body.data.fiscals.map((f: any) => f.id);

it("adiciona à empresa um fiscal já cadastrado, tirando-o da empresa anterior", () => {
  resetMockDb();
  expect(fiscalsOf(3)).toEqual([]);
  expect(fiscalsOf(2)).toContain(13);
  const a = r("POST", "/companies/3/fiscals", { user_id: 13 }, 1);
  expect(a.status).toBe(201);
  expect(a.body.data.fiscals.map((f: any) => f.id)).toEqual([13]);
  expect(r("GET", "/companies/3", null, 1).body.data.fiscals_count).toBe(1);
  expect(fiscalsOf(2)).not.toContain(13);
  // o vínculo dele em contrato da empresa anterior é encerrado
  const link = r("GET", "/contracts/3", null, 1).body.data.fiscals.find((f: any) => f.user_id === 13);
  expect(link.ends_on).toBeTruthy();
  // a troca aparece em Alterações
  const ev = r("GET", "/audit?entity=user", null, 1).body.data.find((e: any) => e.action === "fiscal.company_changed" && e.entity_id === 13);
  expect(ev.after).toEqual({ company_id: 3 });
});

it("rejeita fiscal repetido, pessoa sem perfil fiscal, fiscal inativo e quem não é diretoria", () => {
  resetMockDb();
  expect(r("POST", "/companies/3/fiscals", { user_id: 13 }, 1).status).toBe(201);
  const dup = r("POST", "/companies/3/fiscals", { user_id: 13 }, 1);
  expect(dup.status).toBe(422);
  expect(dup.body.error.fields.user_id).toBe("Este fiscal já é desta empresa.");
  const noRole = r("POST", "/companies/3/fiscals", { user_id: 4 }, 1);
  expect(noRole.status).toBe(422);
  expect(noRole.body.error.fields.user_id).toBe("Esta pessoa não tem o perfil fiscal.");
  expect(r("POST", "/users/3/inactivate", { reason: "saiu" }, 1).status).toBe(200);
  const inactive = r("POST", "/companies/3/fiscals", { user_id: 3 }, 1);
  expect(inactive.status).toBe(422);
  expect(inactive.body.error.fields.user_id).toBe("Este fiscal está inativo. Reative-o antes.");
  expect(r("POST", "/companies/3/fiscals", { user_id: 13 }, 2).status).toBe(403);
  expect(r("POST", "/companies/3/fiscals", {}, 1).status).toBe(422);
});
