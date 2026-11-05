// Módulos ligáveis para o lançamento por partes. "cadastros" está sempre ligado.
// VITE_MODULES = lista separada por vírgula. Modo simulado: todos ligados. API real sem VITE_MODULES: só cadastros.
import { USE_MOCKS } from "./api";

export const MODULES = ["avaliacoes", "limpeza", "chamados", "conferencia", "numeros", "historico", "relatorios", "fechamento"] as const;
export type ModuleKey = (typeof MODULES)[number];

export function parseModules(raw: string | undefined, useMocks: boolean): Set<ModuleKey> {
  if (useMocks) return new Set(MODULES);
  const list = String(raw ?? "").split(",").map((s) => s.trim().toLowerCase());
  return new Set(MODULES.filter((m) => list.includes(m)));
}

export const enabledModules = parseModules(import.meta.env["VITE_MODULES"] as string | undefined, USE_MOCKS);
export const isModuleOn = (m: ModuleKey) => enabledModules.has(m);

/** Rotas de cada módulo (prefixos). Rotas fora desta lista são de cadastros. */
const routeModules: [string, ModuleKey][] = [
  ["/avaliacoes", "avaliacoes"],
  ["/hoje", "limpeza"], ["/buscar", "limpeza"], ["/minhas-limpezas", "limpeza"], ["/registrar", "limpeza"], ["/relatar", "limpeza"], ["/pendencias", "limpeza"],
  ["/chamados", "chamados"],
  ["/conferencia", "conferencia"],
  ["/historico", "historico"],
  ["/relatorios", "relatorios"],
];
export const moduleForPath = (path: string): ModuleKey | null =>
  routeModules.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? null;
export const pathEnabled = (path: string, on: (m: ModuleKey) => boolean = isModuleOn) => {
  const m = moduleForPath(path);
  return m === null || on(m);
};
