import { queryOptions } from "@tanstack/react-query";
import {
  LayoutDashboard, FileText, Building2, Users, Wrench, ClipboardCheck, QrCode,
  CalendarCheck, Search, Toilet, ScanLine, ListChecks, type LucideIcon,
} from "lucide-react";
import { getMe } from "./endpoints";
import type { Role } from "./types";

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

export type NavItem = { title: string; to: string; icon: LucideIcon };

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
  buscar: { title: "Buscar banheiro", to: "/buscar", icon: Search },
  lerQr: { title: "Ler QR", to: "/ler-qr", icon: ScanLine },
  minhas: { title: "Minhas limpezas", to: "/minhas-limpezas", icon: ListChecks },
} satisfies Record<string, NavItem>;

export const navByRole: Record<Role, NavItem[]> = {
  admin: [I.painel, I.contratos, I.banheiros, I.empresas, I.pessoas, I.chamados, I.conferencia, I.etiquetas],
  gestor: [I.painel, I.contratos, I.banheiros, I.pessoas, I.chamados, I.conferencia, I.etiquetas],
  fiscal: [I.contratos, I.banheiros],
  limpeza: [I.hoje, I.buscar, I.lerQr, I.minhas],
  manutencao: [I.chamados],
};

// Quais botões de contrato aparecem para cada perfil (a API continua sendo quem decide).
export const canManageContracts = (r: Role) => r === "admin" || r === "gestor";
export const isAdminRole = (r: Role) => r === "admin";

// Pessoas: quais perfis cada um pode cadastrar e quem pode editar quem.
export const creatableRoles = (r: Role): Role[] =>
  r === "admin" ? ["admin", "gestor", "fiscal", "limpeza", "manutencao"] : r === "gestor" ? ["limpeza", "manutencao"] : [];
export const canManageUser = (me: { id: number; role: Role }, target: { role: Role }) =>
  me.role === "admin" || (me.role === "gestor" && (target.role === "limpeza" || target.role === "manutencao"));

export const isFieldRole = (r: Role) => r === "limpeza" || r === "manutencao";
export const homeFor = (r: Role) => navByRole[r][0]?.to ?? "/login";
export const canAccess = (r: Role, path: string) =>
  navByRole[r].some((i) => path === i.to || path.startsWith(i.to + "/"));
