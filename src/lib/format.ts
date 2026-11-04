import type { Bathroom, ContractStatus } from "./types";

export const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
export const fmtShort = (iso?: string | null) => fmtDate(iso).slice(0, 5);
export const fmtPeriod = (start: string, end?: string | null) => `${fmtDate(start)} – ${end ? fmtDate(end) : "sem data final"}`;
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const WEEKDAY_SHORT: Record<number, string> = { 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 7: "dom" };
export function weekdaysLabel(days: number[]) {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return "todos os dias";
  if (d.length === 0) return "nenhum dia";
  const contiguous = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  if (contiguous && d.length > 2) return `${WEEKDAY_SHORT[d[0]!]}–${WEEKDAY_SHORT[d[d.length - 1]!]}`;
  return d.map((x) => WEEKDAY_SHORT[x]).join(", ");
}
export const planLabel = (p: { cleanings_per_day: number; weekdays: number[] }) => `${p.cleanings_per_day}x/dia · ${weekdaysLabel(p.weekdays)}`;
export const hasOwnPlan = (b: Bathroom) => b.cleanings_per_day != null || b.weekdays != null;

export const contractStatusLabel: Record<ContractStatus, string> = { draft: "Rascunho", active: "Ativo", suspended: "Suspenso", ended: "Encerrado" };
export const statusLabel = (s: string) => ({ active: "Ativo", inactive: "Inativo", ...contractStatusLabel } as Record<string, string>)[s] ?? s;
export const bathroomKindLabel: Record<string, string> = { masculino: "Masculino", feminino: "Feminino", unissex: "Unissex", pcd: "PCD" };
export const teamKindLabel: Record<string, string> = { limpeza: "Limpeza", manutencao: "Manutenção" };
export const shiftLabel: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
export const photoRuleLabel: Record<string, string> = { required: "Obrigatória", optional: "Opcional", off: "Desligada" };
export const missingLabel: Record<string, string> = {
  manager: "Definir o gestor",
  bathroom: "Cadastrar ao menos um banheiro ativo",
  cleaning_team: "Criar uma equipe de limpeza com pelo menos uma pessoa",
  company: "Empresa ativa",
};
