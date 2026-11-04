// Único ponto de acesso a dados do app. Nenhum fetch fora deste arquivo.
export const TOKEN_KEY = "wccheck.token";

export class ApiError extends Error {
  code: string;
  fields: Record<string, string> | undefined;
  status: number;
  constructor(code: string, message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.status = status;
    this.fields = fields;
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

type Envelope = { data?: unknown; meta?: unknown; error?: { code: string; message: string; fields?: Record<string, string> } };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let status: number;
  let json: Envelope;

  if (USE_MOCKS) {
    const { handleMock } = await import("../mocks");
    await new Promise((r) => setTimeout(r, 300));
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
    json = (await res.json().catch(() => ({}))) as Envelope;
  }

  if (status === 401 && path !== "/auth/login") {
    setToken(null);
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  if (status >= 400 || json.error) {
    const e = json.error ?? { code: "unknown", message: "Erro inesperado." };
    throw new ApiError(e.code, e.message, status, e.fields);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
