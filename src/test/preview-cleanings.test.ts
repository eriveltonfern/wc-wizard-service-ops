import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown = null, id = 4) => handleMock(m, p, b, `mock-token-${id}`) as any;
const photo = (n: number) => new Blob([new Uint8Array(n)], { type: "image/jpeg" });
const all = (contract: number) => r("GET", `/bathrooms/${contract}/cleaning-form`).body.data.checklist.map((i: any) => ({ item_id: i.id, answer: "ok" }));
const form = (o: Record<string, unknown>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, v instanceof Blob ? v : typeof v === "string" ? v : JSON.stringify(v));
  return f;
};
const base = (extra: Record<string, unknown> = {}) => ({
  bathroom_id: "1", checklist: all(1), photo_before: photo(1000 + Math.floor(Math.random() * 1e6)),
  client_finished_at: new Date().toISOString(), idempotency_key: crypto.randomUUID(), ...extra,
});

it("foto antes obrigatória e checklist completo são exigidos; foto depois opcional pode faltar", () => {
  resetMockDb();
  const semFoto = r("POST", "/cleanings", form(base({ photo_before: undefined })));
  expect(semFoto.status).toBe(422);
  expect(semFoto.body.error.fields.photo_before).toMatch(/obrigatória/);
  const incompleto = r("POST", "/cleanings", form(base({ checklist: all(1).slice(1) })));
  expect(incompleto.status).toBe(422);
  expect(incompleto.body.error.fields.checklist).toBe("Responda todos os itens do checklist.");
  const okSemDepois = r("POST", "/cleanings", form(base()));
  expect(okSemDepois.status).toBe(201);
});

it("repetir a mesma chave não duplica", () => {
  resetMockDb();
  const body = base();
  const a = r("POST", "/cleanings", form(body));
  expect(a.status).toBe(201);
  const again = r("POST", "/cleanings", form(body));
  expect(again.body.data.cleaning.id).toBe(a.body.data.cleaning.id);
});

it("limpeza sem tarefa pendente vira extra e não entra no percentual", () => {
  resetMockDb();
  let extra: any = null;
  for (let i = 0; i < 6 && !extra; i++) {
    const res = r("POST", "/cleanings", form(base())).body.data.cleaning;
    if (res.link.kind === "extra") extra = res;
  }
  expect(extra).not.toBeNull();
  const before = r("GET", "/me/today").body.data.summary;
  r("POST", "/cleanings", form(base()));
  expect(r("GET", "/me/today").body.data.summary).toEqual(before);
});

it("enviada da fila sem internet recebe a marca e só quem é da equipe de limpeza registra", () => {
  resetMockDb();
  const q = r("POST", "/cleanings", form(base({ queued: "1" })));
  expect(q.body.data.cleaning.marks).toContain("offline");
  expect(r("POST", "/cleanings", form(base()), 1).status).toBe(403); // admin
  expect(r("POST", "/cleanings", form(base({ bathroom_id: "8" }))).status).toBe(404); // banheiro de outro contrato
});
