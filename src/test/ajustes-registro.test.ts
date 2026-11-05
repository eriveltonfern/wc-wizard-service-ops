import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown, id: number) => handleMock(m, p, b, `mock-token-${id}`) as any;

it("admin ajusta uma limpeza; o ajuste fica visível para todos e o fiscal não pode ajustar", () => {
  resetMockDb();
  const cleaners = r("GET", "/users?role=limpeza", null, 1).body.data;
  const mine = r("GET", "/me/cleanings", null, cleaners[0].id).body.data;
  const c = mine.find((x: any) => new Date(x.client_finished_at).getMonth() === new Date().getMonth() && x.status === "valid");
  expect(c).toBeTruthy();
  const other = cleaners.find((u: any) => u.id !== c.user.id);
  expect(r("PATCH", `/cleanings/${c.id}`, { user_id: other.id }, 1).body.error.fields.reason).toBeTruthy();
  const a = r("PATCH", `/cleanings/${c.id}`, { user_id: other.id, notes: "corrigido", reason: "Registrou no celular do colega" }, 1);
  expect(a.status).toBe(200);
  expect(a.body.data.user.id).toBe(other.id);
  const seen = r("GET", `/cleanings/${c.id}`, null, 3).body.data; // fiscal
  expect(seen.adjustments[0].reason).toBe("Registrou no celular do colega");
  expect(seen.can_adjust).toBe(false);
  expect(r("PATCH", `/cleanings/${c.id}`, { notes: "x", reason: "y" }, 3).status).toBe(403);
});

it("gestor ajusta um chamado e o ajuste aparece na linha do tempo", () => {
  resetMockDb();
  const t = r("GET", "/tickets", null, 1).body.data[0];
  const a = r("PATCH", `/tickets/${t.id}`, { status: "done", done_note: "Feito na hora", reason: "Esqueceram de concluir" }, 1);
  expect(a.status).toBe(200);
  expect(a.body.data.status).toBe("done");
  expect(a.body.data.events.at(-1).kind).toBe("adjusted");
  expect(a.body.data.events.at(-1).text).toContain("Esqueceram de concluir");
});
