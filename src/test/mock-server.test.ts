import { expect, it } from "vitest";
import { handleMock, resetMockDb } from "@/mocks";
const tok = (id:number)=>`mock-token-${id}`;
it("contract", () => {
  resetMockDb();
  const r = (m:string,p:string,b:unknown,id:number)=>handleMock(m,p,b,tok(id)) as any;
  expect(r("GET","/contracts",null,3).body.data.map((c:any)=>c.id)).toEqual([1,2]);
  expect(r("GET","/contracts/3",null,3).status).toBe(404);
  expect(r("GET","/companies",null,2).status).toBe(403);
  const c = r("POST","/contracts",{company_id:2,code:"X1",name:"Novo",starts_on:"2026-01-01"},1);
  expect(c.status).toBe(201); expect(c.body.data.status).toBe("draft"); expect(c.body.data.checklist).toHaveLength(5);
  expect(r("POST","/contracts",{company_id:2,code:"x1",name:"N",starts_on:"2026-02-01",ends_on:"2026-01-01"},1).body.error.fields).toEqual({code:"Já existe um contrato com este código.",ends_on:"A data final deve ser igual ou posterior à inicial."});
  const a = r("POST",`/contracts/${c.body.data.id}/activate`,{},1);
  expect(a.status).toBe(409); expect(a.body.error.missing).toEqual(["manager","bathroom","cleaning_team"]);
  const u = r("POST","/users",{name:"Zé",email:"ze@x.com",role:"limpeza"},2);
  expect(u.body.data.temporary_password).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/); expect(u.body.data.user.must_change_password).toBe(true);
  expect(r("POST","/users",{name:"G",email:"g@x.com",role:"gestor"},2).status).toBe(422);
  const mv = r("POST","/team-members/1/move",{to_team_id:3,date:"2026-06-01",reason:"troca"},2);
  expect(mv.status).toBe(200);
  const h = r("GET","/users/4/history",null,1).body.data;
  expect(h.memberships.map((m:any)=>[m.team_id,m.starts_on,m.ends_on])).toEqual([[3,"2026-06-01",undefined],[1,"2026-01-10","2026-06-01"]]);
  expect(r("DELETE","/companies/1",null,1).body.error.code).toBe("has_history");
  const l = r("GET","/contracts/1/labels",null,1).body.data[0];
  expect(l.url).toMatch(/^https:\/\/wccheck\.com\.br\/q\/[A-HJ-NP-Z2-9]{12}$/);
  expect(r("POST","/contracts/1/bathrooms",{name:"vestiario portaria",kind:"unissex"},1).body.error.fields.name).toBe("Já existe um banheiro com este nome no contrato.");
});

it("nova senha precisa de pelo menos 10 caracteres", () => {
  resetMockDb();
  const r = (b: unknown) => handleMock("POST", "/me/password", b, "mock-token-4") as any;
  expect(r({ current: "wccheck123", new: "123456789" }).body.error.fields.new).toBe("A senha deve ter pelo menos 10 caracteres.");
  expect(r({ current: "wccheck123", new: "1234567890" }).body.data).toEqual({ changed: true });
});
