import { queryOptions } from "@tanstack/react-query";
import {
  LayoutDashboard, FileText, Building2, Users, Wrench, ClipboardCheck, QrCode,
  CalendarCheck, Search, ListTodo, History, BarChart3, Toilet, ListChecks, HelpCircle, CheckCheck, Star, type LucideIcon,
} from "lucide-react";
import { getMe } from "./endpoints";
import type { Role } from "./types";
import { pathEnabled } from "./modules";

export type { Role, User } from "./types";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: getMe,
  staleTime: Infinity,
  retry: false,
});

export const roleLabel: Record<Role, string> = {
  admin: "Diretoria",
  gestor: "Gestor",
  fiscal: "Fiscal do cliente",
  limpeza: "Limpeza",
  manutencao: "Manutenção",
};

export type NavItem = { title: string; to: string; icon: LucideIcon; short?: string };

const I = {
  painel: { title: "Painel", to: "/painel", icon: LayoutDashboard },
  contratos: { title: "Contratos", to: "/contratos", icon: FileText },
  banheiros: { title: "Banheiros", to: "/banheiros", icon: Toilet },
  empresas: { title: "Empresas", to: "/empresas", icon: Building2 },
  pessoas: { title: "Pessoas", to: "/pessoas", icon: Users },
  chamados: { title: "Chamados", to: "/chamados", icon: Wrench },
  conferencia: { title: "Conferência", to: "/conferencia", icon: ClipboardCheck },
  etiquetas: { title: "Etiquetas", to: "/etiquetas", icon: QrCode },
  hoje: { title: "Hoje", to: "/hoje", icon: CalendarCheck },
  buscar: { title: "Buscar banheiro", short: "Buscar", to: "/buscar", icon: Search },
  avaliacoes: { title: "Avaliações", to: "/avaliacoes", icon: Star },
  minhas: { title: "Minhas limpezas", short: "Minhas", to: "/minhas-limpezas", icon: ListChecks },
  ajuda: { title: "Ajuda", to: "/ajuda", icon: HelpCircle },
  pendencias: { title: "Pendências", to: "/pendencias", icon: ListTodo },
  historico: { title: "Histórico", to: "/historico", icon: History },
  relatorios: { title: "Relatórios", to: "/relatorios", icon: BarChart3 },
  concluidos: { title: "Concluídos", to: "/chamados/concluidos", icon: CheckCheck },
} satisfies Record<string, NavItem>;

export type NavGroup = { label: string; items: NavItem[] };

/** Menu agrupado por perfil (DIA A DIA, GESTÃO, AJUSTES). Também define o acesso às rotas. */
const allNavGroupsByRole: Record<Role, NavGroup[]> = {
  admin: [
    { label: "Dia a dia", items: [I.painel, I.pendencias, I.historico, I.chamados, I.avaliacoes] },
    { label: "Gestão", items: [I.contratos, I.banheiros, I.empresas, I.pessoas, I.etiquetas, I.relatorios] },
    { label: "Ajustes", items: [I.ajuda] },
  ],
  gestor: [
    { label: "Dia a dia", items: [I.painel, I.pendencias, I.historico, I.chamados, I.avaliacoes] },
    { label: "Gestão", items: [I.contratos, I.banheiros, I.pessoas, I.etiquetas, I.relatorios] },
    { label: "Ajustes", items: [I.ajuda] },
  ],
  fiscal: [
    { label: "Dia a dia", items: [I.painel, I.historico, I.chamados, I.avaliacoes] },
    { label: "Gestão", items: [I.contratos, I.banheiros, I.relatorios] },
    { label: "Ajustes", items: [I.ajuda] },
  ],
  limpeza: [{ label: "Dia a dia", items: [I.hoje, I.buscar, I.minhas] }],
  manutencao: [{ label: "Dia a dia", items: [I.chamados, I.concluidos] }],
};

/** Menu já sem os módulos desligados (src/lib/modules.ts). */
export const navGroupsByRole: Record<Role, NavGroup[]> = Object.fromEntries(
  Object.entries(allNavGroupsByRole).map(([r, groups]) => [r, groups
    .map((g) => ({ ...g, items: g.items.filter((i) => pathEnabled(i.to)) }))
    .filter((g) => g.items.length > 0)]),
) as Record<Role, NavGroup[]>;

export const navByRole: Record<Role, NavItem[]> = Object.fromEntries(
  Object.entries(navGroupsByRole).map(([r, groups]) => [r, groups.flatMap((g) => g.items)]),
) as Record<Role, NavItem[]>;

// Quais botões de contrato aparecem para cada perfil (a API continua sendo quem decide).
export const canManageContracts = (r: Role) => r === "admin" || r === "gestor";
export const isAdminRole = (r: Role) => r === "admin";

// Pessoas: quais perfis cada um pode cadastrar e quem pode editar quem.
export const creatableRoles = (r: Role): Role[] =>
  r === "admin" ? ["admin", "gestor", "fiscal", "limpeza", "manutencao"] : r === "gestor" ? ["limpeza", "manutencao"] : [];
export const canManageUser = (me: { id: number; role: Role }, target: { role: Role }) =>
  me.role === "admin" || (me.role === "gestor" && (target.role === "limpeza" || target.role === "manutencao"));

export const isFieldRole = (r: Role) => r === "limpeza" || r === "manutencao";
const homeOverride: Partial<Record<Role, string>> = {};
export const homeFor = (r: Role) => homeOverride[r] ?? navByRole[r][0]?.to ?? "/aguardando";
/** Perfil de campo sem nenhum módulo ligado: mostra "Seu acesso ao app será liberado em breve." */
export const isWaitingAccess = (r: Role) => navByRole[r].length === 0;
/** Telas fora do menu que o perfil também pode abrir. */
export const hiddenRoutesByRole: Record<Role, string[]> = {
  admin: [], gestor: [], fiscal: [], limpeza: ["/registrar", "/relatar"], manutencao: [],
};
export const canAccess = (r: Role, path: string) => pathEnabled(path) &&
  [...navByRole[r].map((i) => i.to), ...hiddenRoutesByRole[r]].some((to) => path === to || path.startsWith(to + "/"));
