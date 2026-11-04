import { queryOptions } from "@tanstack/react-query";
import {
  LayoutDashboard, FileText, Building2, Users, Wrench, ClipboardCheck, QrCode,
  CalendarCheck, Search, ScanLine, ListChecks, type LucideIcon,
} from "lucide-react";
import { api } from "./api";

export type Role = "admin" | "gestor" | "fiscal" | "limpeza" | "manutencao";
export type User = { id: number; name: string; email: string; role: Role; company_id: number | null };

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => api.get<User>("/me"),
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
  admin: [I.painel, I.contratos, I.empresas, I.pessoas, I.chamados, I.conferencia, I.etiquetas],
  gestor: [I.painel, I.contratos, I.pessoas, I.chamados, I.conferencia, I.etiquetas],
  fiscal: [I.contratos],
  limpeza: [I.hoje, I.buscar, I.lerQr, I.minhas],
  manutencao: [I.chamados],
};

export const isFieldRole = (r: Role) => r === "limpeza" || r === "manutencao";
export const homeFor = (r: Role) => navByRole[r][0].to;
export const canAccess = (r: Role, path: string) =>
  navByRole[r].some((i) => path === i.to || path.startsWith(i.to + "/"));
