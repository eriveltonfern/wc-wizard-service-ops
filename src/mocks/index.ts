// Dados simulados. Só importado por src/lib/api.ts.
import { users, companies, contracts, bathrooms, teams, people } from "./data";

type MockResponse = { status: number; body: unknown };
const ok = (data: unknown, meta: unknown = null): MockResponse => ({ status: 200, body: { data, meta } });
const err = (status: number, code: string, message: string, fields?: Record<string, string>): MockResponse => ({
  status,
  body: { error: { code, message, fields } },
});

const publicUser = (u: (typeof users)[number]) => {
  const { password: _p, ...rest } = u;
  return rest;
};

function userFromToken(token: string | null) {
  if (!token?.startsWith("mock-token-")) return null;
  const id = Number(token.replace("mock-token-", ""));
  return users.find((u) => u.id === id) ?? null;
}

export function handleMock(method: string, path: string, body: unknown, token: string | null): MockResponse {
  const route = `${method} ${path.split("?")[0]}`;

  if (route === "POST /auth/login") {
    const { email, password } = (body ?? {}) as { email?: string; password?: string };
    const u = users.find((x) => x.email === email?.trim().toLowerCase());
    if (!u || u.password !== password) return err(401, "invalid_credentials", "E-mail ou senha incorretos.");
    return ok({ token: `mock-token-${u.id}`, user: publicUser(u) });
  }

  const me = userFromToken(token);
  if (!me) return err(401, "unauthenticated", "Sessão expirada. Entre novamente.");

  switch (route) {
    case "GET /me":
      return ok(publicUser(me));
    case "POST /auth/logout":
      return ok(null);
    case "GET /companies":
      return ok(companies, { total: companies.length });
    case "GET /contracts":
      return ok(contracts, { total: contracts.length });
    case "GET /bathrooms":
      return ok(bathrooms, { total: bathrooms.length });
    case "GET /teams":
      return ok(teams, { total: teams.length });
    case "GET /people":
      return ok(people, { total: people.length });
  }
  return err(404, "not_found", "Recurso não encontrado.");
}
