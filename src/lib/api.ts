// Único ponto de acesso a dados do app. Nenhum fetch fora deste arquivo.
// VITE_API_URL deve incluir o prefixo /api (ex.: https://wccheck.com.br/api).
export const TOKEN_KEY = "wccheck.token";

type ErrorPayload = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  missing?: string[];
  counts?: Record<string, number>;
};

export class ApiError extends Error {
  code: string;
  fields: Record<string, string> | undefined;
  status: number;
  missing: string[] | undefined;
  counts: Record<string, number> | undefined;
  constructor(code: string, message: string, status: number, fields?: Record<string, string>, extra?: { missing?: string[] | undefined; counts?: Record<string, number> | undefined }) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.missing = extra?.missing;
    this.counts = extra?.counts;
  }
}

export const USE_MOCKS = import.meta.env["VITE_USE_MOCKS"] !== "false";
const BASE_URL = String(import.meta.env["VITE_API_URL"] ?? "").replace(/\/$/, "");

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Apaga os dados simulados e volta ao estado inicial (só no modo simulado). */
export async function resetMockData() {
  if (!USE_MOCKS) return;
  const { resetMockDb } = await import("../mocks");
  resetMockDb();
}

type Envelope = { data?: unknown; meta?: unknown; error?: ErrorPayload } | null;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let status: number;
  let json: Envelope;

  if (USE_MOCKS) {
    const { handleMock } = await import("../mocks");
    await new Promise((r) => setTimeout(r, 250));
    const res = handleMock(method, path, body, token);
    status = res.status;
    json = res.body as Envelope;
  } else {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : null,
    });
    status = res.status;
    json = status === 204 ? null : ((await res.json().catch(() => ({}))) as Envelope);
  }

  if (status === 401 && path !== "/auth/login") {
    setToken(null);
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  if (status >= 400 || json?.error) {
    const e = json?.error ?? { code: "unknown", message: "Erro inesperado." };
    throw new ApiError(e.code, e.message, status, e.fields, { missing: e.missing, counts: e.counts });
  }
  return (json?.data ?? undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
