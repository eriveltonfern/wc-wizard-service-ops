import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown = null, id = 4) => handleMock(m, p, b, `mock-token-${id}`) as any;
const form = (o: Record<string, unknown>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f.set(k, v instanceof Blob ? v : String(v));
  return f;
};
const photo = () => new Blob([new Uint8Array(2000 + Math.floor(Math.random() * 1e5))], { type: "image/jpeg" });
const GESTOR = 2, FISCAL = 3, LIMPEZA = 4, MANUT = 5;

it("limpeza abre chamado; manutenção inicia e só conclui com foto e nota", () => {
  resetMockDb();
  const novo = r("POST", "/tickets", form({ bathroom_id: 1, category: "hidraulica", description: "Vaso entupido", idempotency_key: crypto.randomUUID() }), LIMPEZA);
  expect(novo.status).toBe(201);
  const id = novo.body.data.id;
  expect(novo.body.data.status).toBe("open");
  expect(r("GET", "/tickets", null, LIMPEZA).body.data.some((t: any) => t.id === id)).toBe(true);

  const start = r("POST", `/tickets/${id}/start`, {}, MANUT);
  expect(start.body.data.status).toBe("in_progress");
  expect(start.body.data.assignee.id).toBe(MANUT);

  const semFoto = r("POST", `/tickets/${id}/done`, form({ note: "Desentupido" }), MANUT);
  expect(semFoto.status).toBe(422);
  expect(semFoto.body.error.fields.photo).toMatch(/obrigatória/);
  const semNota = r("POST", `/tickets/${id}/done`, form({ photo: photo() }), MANUT);
  expect(semNota.body.error.fields.note).toBeTruthy();
  const ok = r("POST", `/tickets/${id}/done`, form({ photo: photo(), note: "Desentupido" }), MANUT);
  expect(ok.body.data.status).toBe("done");
  expect(ok.body.data.events.map((e: any) => e.kind)).toEqual(["opened", "taken", "started", "done"]);
});

it("só gestor e diretoria cancelam, sempre com motivo; fiscal vê sem poder alterar", () => {
  resetMockDb();
  const t = r("GET", "/tickets?status=open", null, GESTOR).body.data.find((x: any) => x.contract.id === 1);
  expect(r("POST", `/tickets/${t.id}/cancel`, { reason: "x" }, MANUT).status).toBe(403);
  expect(r("POST", `/tickets/${t.id}/cancel`, { reason: "" }, GESTOR).body.error.fields.reason).toBe("Informe o motivo.");
  const fiscal = r("GET", `/tickets/${t.id}`, null, FISCAL).body.data;
  expect(Object.values(fiscal.can).every((v) => v === false)).toBe(true);
  expect(r("POST", `/tickets/${t.id}/comments`, { text: "oi" }, FISCAL).status).toBe(403);
  const c = r("POST", `/tickets/${t.id}/cancel`, { reason: "Duplicado" }, GESTOR);
  expect(c.body.data.status).toBe("cancelled");
  expect(c.body.data.events.at(-1).kind).toBe("cancelled");
});

it("atribuir só para alguém da manutenção do contrato; urgentes vêm primeiro", () => {
  resetMockDb();
  const rows = r("GET", "/tickets?status=active", null, GESTOR).body.data;
  const firstNonUrgent = rows.findIndex((x: any) => x.priority !== "urgente");
  expect(rows.slice(firstNonUrgent).some((x: any) => x.priority === "urgente")).toBe(false);
  const t = rows.find((x: any) => x.contract.id === 1 && x.status === "open");
  expect(r("POST", `/tickets/${t.id}/assign`, { user_id: LIMPEZA }, GESTOR).status).toBe(422);
  expect(r("POST", `/tickets/${t.id}/assign`, { user_id: MANUT }, GESTOR).body.data.assignee.id).toBe(MANUT);
});

it("conferência: cerca de 8 limpezas com marca; 'Está certo' tira da lista e cancelar mostra o efeito na tarefa", () => {
  resetMockDb();
  const list = r("GET", "/review", null, 1).body.data;
  expect(list.counts.total).toBeGreaterThanOrEqual(6);
  expect(list.counts.total).toBeLessThanOrEqual(8);
  const [a, b] = list.rows;
  expect(r("POST", `/cleanings/${a.id}/review`, {}, 1).body.data.review.by.id).toBe(1);
  expect(r("GET", "/review", null, 1).body.data.rows.some((x: any) => x.id === a.id)).toBe(false);
  expect(r("POST", `/cleanings/${b.id}/cancel`, { reason: "" }, 1).status).toBe(422);
  const c = r("POST", `/cleanings/${b.id}/cancel`, { reason: "Foto de outro banheiro" }, 1);
  expect(c.body.data.cleaning.status).toBe("cancelled");
  expect(["pending", "not_done", "extra"]).toContain(c.body.data.effect.kind);
  expect(r("GET", "/review", null, LIMPEZA).status).toBe(403);
});

it("item 'Não OK' com chamado vira sugestão com a categoria certa", () => {
  resetMockDb();
  const items = r("GET", "/bathrooms/1/cleaning-form").body.data.checklist;
  const papel = items.find((i: any) => /Papel/.test(i.label));
  const checklist = items.map((i: any) => ({ item_id: i.id, answer: i.id === papel.id ? "not_ok" : "ok", open_ticket: i.id === papel.id }));
  const res = r("POST", "/cleanings", form({ bathroom_id: 1, checklist: JSON.stringify(checklist), photo_before: photo(), client_finished_at: new Date().toISOString(), idempotency_key: crypto.randomUUID() }));
  expect(res.body.data.cleaning.ticket_suggestions).toEqual([{ item_id: papel.id, label: papel.label, category: "abastecimento", description: `Checklist: ${papel.label} não OK` }]);
});
