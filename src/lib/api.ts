// Único ponto de acesso a dados do app. Nenhum fetch fora deste arquivo.
// VITE_API_URL deve incluir o prefixo /api (ex.: https://wccheck.com.br/api).
export const TOKEN_KEY = "wccheck.token";

type ErrorPayload = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  missing?: string[];
  counts?: Record<string, number>;
  contracts?: ErrorContract[];
};
export type ErrorContract = { id: number; code: string; name: string; status: string };

export class ApiError extends Error {
  code: string;
  fields: Record<string, string> | undefined;
  status: number;
  missing: string[] | undefined;
  counts: Record<string, number> | undefined;
  contracts: ErrorContract[] | undefined;
  constructor(code: string, message: string, status: number, fields?: Record<string, string>, extra?: { missing?: string[] | undefined; counts?: Record<string, number> | undefined; contracts?: ErrorContract[] | undefined }) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.missing = extra?.missing;
    this.counts = extra?.counts;
    this.contracts = extra?.contracts;
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

type RequestResult = { data: unknown; meta: Record<string, unknown> | undefined };

async function requestRaw(method: string, path: string, body?: unknown): Promise<RequestResult> {
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
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : null,
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
    throw new ApiError(e.code, e.message, status, e.fields, { missing: e.missing, counts: e.counts, contracts: e.contracts });
  }
  return { data: json?.data, meta: (json?.meta ?? undefined) as RequestResult["meta"] };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await requestRaw(method, path, body);
  return data as T;
}

/** Lista paginada: devolve as linhas e o meta da API (total, limit...). */
export type Page<T> = { rows: T[]; total: number; limit?: number | undefined };

async function requestPage<T>(method: string, path: string, body?: unknown): Promise<Page<T>> {
  const { data, meta } = await requestRaw(method, path, body);
  const rows = (Array.isArray(data) ? data : []) as T[];
  const total = typeof meta?.["total"] === "number" ? (meta["total"] as number) : rows.length;
  const limit = typeof meta?.["limit"] === "number" ? (meta["limit"] as number) : undefined;
  return { rows, total, limit };
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  getPage: <T>(path: string) => requestPage<T>("GET", path),
};
