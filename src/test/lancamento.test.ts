import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";
import { MODULES, parseModules, pathEnabled } from "@/lib/modules";

const r = (m: string, p: string, b: unknown, id = 1) => handleMock(m, p, b, `mock-token-${id}`) as any;
const today = new Date().toISOString().slice(0, 10);

it("módulos: simulado liga todos; API real sem VITE_MODULES só cadastros; lista liga só os citados", () => {
  expect([...parseModules(undefined, true)]).toEqual([...MODULES]);
  expect(parseModules(undefined, false).size).toBe(0);
  const only = parseModules("avaliacoes", false);
  expect([...only]).toEqual(["avaliacoes"]);
  const on = (m: any) => only.has(m);
  expect(pathEnabled("/avaliacoes", on)).toBe(true);
  expect(pathEnabled("/hoje", on)).toBe(false);
  expect(pathEnabled("/registrar/3", on)).toBe(false);
  expect(pathEnabled("/pendencias", on)).toBe(false);
  expect(pathEnabled("/chamados/concluidos", on)).toBe(false);
  expect(pathEnabled("/contratos/1", on)).toBe(true); // cadastros sempre ligado
});

it("adiciona várias pessoas numa chamada só e recusa tudo se alguém não puder entrar", () => {
  resetMockDb();
  const users = r("GET", "/users?role=limpeza&status=active", null).body.data as any[];
  const team = r("GET", "/contracts/1/teams", null).body.data.find((t: any) => t.kind === "limpeza");
  const inTeam = new Set(team.members.map((m: any) => m.user_id));
  const free = users.filter((u) => !inTeam.has(u.id)).map((u) => u.id);
  const someone = [...inTeam][0];
  expect(free.length).toBeGreaterThan(0);
  const before = r("GET", `/teams/${team.id}/members`, null).body.data.length;
  const bad = r("POST", `/teams/${team.id}/members`, { user_ids: [...free, someone], starts_on: today });
  expect(bad.status).toBe(422);
  expect(bad.body.error.fields.user_ids).toContain("Esta pessoa já está nesta equipe.");
  expect(r("GET", `/teams/${team.id}/members`, null).body.data.length).toBe(before);
  const ok = r("POST", `/teams/${team.id}/members`, { user_ids: free, starts_on: today });
  expect(ok.status).toBe(201);
  expect(ok.body.data.map((m: any) => m.user_id).sort()).toEqual([...free].sort());
  // o formato antigo continua valendo
  const single = r("POST", `/teams/${team.id}/members`, { user_id: free[0], starts_on: today });
  expect(single.status).toBe(422);
});
