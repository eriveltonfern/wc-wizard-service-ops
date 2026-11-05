import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";

const r = (m: string, p: string, b: unknown = null, id: number | null = 1) => handleMock(m, p, b, id === null ? null : `mock-token-${id}`) as any;
const day = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

it("meta do contrato decide o \"Abaixo da meta\" (e não 95% fixo)", () => {
  resetMockDb();
  expect(r("PATCH", "/contracts/1", { monthly_target: 0 }).body.error.fields.monthly_target).toBe("Informe um valor de 1 a 100.");
  expect(r("PATCH", "/contracts/1", { monthly_target: 101 }).status).toBe(422);
  expect(r("GET", "/contracts/2").body.data.rules.monthly_target).toBe(95); // padrão
  expect(r("PATCH", "/contracts/1", { monthly_target: 40 }).status).toBe(200);
  const s = r("GET", `/stats?from=${day(20)}&to=${day(1)}`).body.data;
  const c1 = s.by_bathroom.filter((b: any) => b.contract.id === 1);
  expect(c1.length).toBeGreaterThan(0);
  for (const b of c1) expect(b.target).toBe(0.4);
  expect(s.by_contract.find((c: any) => c.contract.id === 3).target).toBe(0.9); // Parque Central: meta 90%
});

it("foto antes/depois só aceita Obrigatória ou Opcional", () => {
  resetMockDb();
  expect(r("PATCH", "/contracts/1", { photo_before: "off" }).body.error.fields.photo_before).toBe("Escolha uma opção válida.");
  expect(r("PATCH", "/contracts/1", { photo_before: "optional" }).status).toBe(200);
});

it("\"Pessoas escolhidas por banheiro\" bloqueia quem não está marcado", () => {
  resetMockDb();
  // Banheiro 8 (Parque Central): só Helena (8) e Igor (9). Júlia (10) é da equipe mas não está marcada.
  const res = r("GET", "/bathrooms/8/cleaning-form", null, 10);
  expect(res.status).toBe(403);
  expect(res.body.error.message).toBe("Você não está entre os responsáveis por este banheiro.");
  expect(r("GET", "/bathrooms/8/cleaning-form", null, 8).status).toBe(200);
  // "Hoje" e Buscar só mostram os banheiros que a pessoa pode limpar
  expect(r("GET", "/me/today", null, 10).body.data.tasks.every((t: any) => t.bathroom.id !== 8)).toBe(true);
  expect(r("GET", "/bathrooms?status=active", null, 10).body.data.map((b: any) => b.id)).not.toContain(8);
  // marcar Júlia libera
  r("PUT", "/bathrooms/8/cleaners", { user_ids: [8, 9, 10] }, 12);
  expect(r("GET", "/bathrooms/8/cleaning-form", null, 10).status).toBe(200);
});

it("transferência muda contrato e empresa, mantém o QR e vai para Alterações", () => {
  resetMockDb();
  const before = r("GET", "/bathrooms/1").body.data;
  expect(r("POST", "/bathrooms/transfer", { bathroom_ids: [1], to_contract_id: 3, date: day(0) }).body.error.fields.reason).toBe("Campo obrigatório.");
  // gestora Paula só transfere entre contratos dela
  expect(r("POST", "/bathrooms/transfer", { bathroom_ids: [1], to_contract_id: 3, date: day(0), reason: "x" }, 12).status).toBe(404);
  const res = r("POST", "/bathrooms/transfer", { bathroom_ids: [1], to_contract_id: 3, date: day(0), reason: "Mudou de cliente" });
  expect(res.status).toBe(200);
  const after = r("GET", "/bathrooms/1").body.data;
  expect(after.qr_token).toBe(before.qr_token);
  expect(after.contract.id).toBe(3);
  expect(after.company.name).toBe("Shopping Parque Central");
  expect(r("GET", "/audit?entity=bathroom").body.data.some((a: any) => a.action === "bathroom.transferred" && a.entity_id === 1 && a.reason === "Mudou de cliente")).toBe(true);
});

it("avaliação pelo QR: sem login, uma por aparelho a cada 30 minutos; QR inativo avisa", () => {
  resetMockDb();
  const token = r("GET", "/bathrooms/2").body.data.qr_token;
  expect(r("GET", `/public/q/${token}`, null, null).body.data.bathroom_name).toBe("Banheiro Químico 01");
  const body = { score: 2, problems: ["sujo"], comment: "Faltou papel", device_key: "aparelho-1" };
  expect(r("POST", `/public/q/${token}/ratings`, body, null).status).toBe(201);
  const again = r("POST", `/public/q/${token}/ratings`, body, null);
  expect(again.status).toBe(429);
  expect(again.body.error.message).toBe("Você já avaliou este banheiro agora há pouco.");
  expect(r("POST", `/public/q/${token}/ratings`, { ...body, device_key: "aparelho-2" }, null).status).toBe(201);
  r("POST", "/bathrooms/2/inactivate");
  expect(r("GET", `/public/q/${token}`, null, null).body.error.message).toBe("Este QR não está mais ativo.");
});

it("foto apagada após 60 dias; a limpeza continua no histórico", () => {
  resetMockDb();
  const old = r("GET", `/history/cleanings?from=${day(85)}&to=${day(70)}`).body.data.rows;
  expect(old.length).toBeGreaterThan(0);
  for (const c of old) {
    expect(c.photo_deleted_at).toBeTruthy();
    expect(c.photo_before_url).toBeUndefined();
    expect(c.photo_after_url).toBeUndefined();
    expect(c.checklist.length).toBeGreaterThan(0);
    expect(c.user.name).toBeTruthy();
  }
  const recent = r("GET", `/history/cleanings?from=${day(5)}&to=${day(2)}`).body.data.rows.find((c: any) => c.photo_before_url);
  expect(recent.photo_deleted_at).toBeUndefined();
  expect(recent.photos_available_until).toBeTruthy();
});
