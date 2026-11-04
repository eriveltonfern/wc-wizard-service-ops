// Estado inicial do servidor simulado. Formato interno (linhas de "tabela"), igual ao que a API guarda.
import type { BathroomKind, ContractRules, Role, TeamKind } from "../lib/types";

export type DbUser = {
  id: number; name: string; email: string; phone: string | null; role: Role; company_id: number | null;
  status: "active" | "inactive"; must_change_password: boolean; password: string;
};
export type DbCompany = { id: number; name: string; document: string | null; contact_name: string | null; contact_phone: string | null; notes: string | null; status: "active" | "inactive" };
export type DbContract = {
  id: number; company_id: number; code: string; name: string; manager_id: number | null;
  starts_on: string; ends_on: string | null; status: "draft" | "active" | "suspended" | "ended"; timezone: string; rules: ContractRules;
};
export type DbFiscalLink = { id: number; contract_id: number; user_id: number; starts_on: string; ends_on: string | null };
export type DbChecklist = { id: number; contract_id: number; label: string; position: number; active: boolean };
export type DbLocation = { id: number; contract_id: number; name: string; status: "active" | "inactive" };
export type DbBathroom = {
  id: number; contract_id: number; location_id: number | null; name: string; qr_token: string; kind: BathroomKind;
  floor: string | null; notes: string | null; cleanings_per_day: number | null; weekdays: number[] | null; status: "active" | "inactive";
};
export type DbStatusPeriod = { id: number; bathroom_id: number; starts_on: string; ends_on: string; reason: string };
export type DbTeam = { id: number; contract_id: number; kind: TeamKind; name: string; shift: string | null; status: "active" | "inactive" };
export type DbMember = { id: number; team_id: number; user_id: number; starts_on: string; ends_on: string | null; removal_reason: string | null };
export type DbAudit = {
  id: number; action: string; entity: string; entity_id: number; before: Record<string, unknown> | null;
  after: Record<string, unknown> | null; reason: string | null; created_at: string; actor_id: number | null;
};

export const SEED_VERSION = 3;
export type MockDb = {
  version?: number;
  users: DbUser[]; companies: DbCompany[]; contracts: DbContract[]; fiscal_links: DbFiscalLink[];
  checklist: DbChecklist[]; locations: DbLocation[]; bathrooms: DbBathroom[]; status_periods: DbStatusPeriod[];
  teams: DbTeam[]; members: DbMember[]; audit: DbAudit[]; revoked_tokens: string[];
};

export const DEFAULT_CHECKLIST = ["Piso limpo", "Papel higiênico abastecido", "Sabonete abastecido", "Lixeiras esvaziadas", "Pias e vasos limpos"];
export const defaultRules = (): ContractRules => ({
  photo_before: "required", photo_after: "required",
  default_cleanings_per_day: 1, default_weekdays: [1, 2, 3, 4, 5, 6, 7], shifts: ["manha", "tarde", "noite"],
});

const PW = "wccheck123";
const u = (id: number, name: string, email: string, role: Role, phone: string | null, company_id: number | null = null): DbUser => ({
  id, name, email, phone, role, company_id, status: "active", must_change_password: false, password: PW,
});

export function seed(): MockDb {
  const users: DbUser[] = [
    u(1, "Ana Diretora", "admin@wccheck.test", "admin", null),
    u(2, "Bruno Gestor", "gestor@wccheck.test", "gestor", null),
    u(3, "Carla Fiscal", "fiscal@wccheck.test", "fiscal", null, 1),
    u(4, "Diego Limpeza", "limpeza@wccheck.test", "limpeza", "(31) 99999-0001"),
    u(5, "Elisa Manutenção", "manutencao@wccheck.test", "manutencao", "(31) 99999-0004"),
    u(6, "Fernanda Souza", "fernanda.souza@wccheck.test", "limpeza", "(31) 99999-0002"),
    u(7, "Gustavo Lima", "gustavo.lima@wccheck.test", "limpeza", "(31) 99999-0003"),
    u(8, "Helena Rocha", "helena.rocha@wccheck.test", "limpeza", "(31) 99999-0005"),
    u(9, "Igor Martins", "igor.martins@wccheck.test", "limpeza", "(31) 99999-0006"),
    u(10, "Júlia Pereira", "julia.pereira@wccheck.test", "limpeza", "(31) 99999-0007"),
    u(11, "Kleber Alves", "kleber.alves@wccheck.test", "manutencao", "(31) 99999-0008"),
    u(12, "Paula Gestora", "paula.gestora@wccheck.test", "gestor", null),
    u(13, "Marcos Tavares", "marcos.tavares@cliente.test", "fiscal", null, 2),
  ];
  const companies: DbCompany[] = [
    { id: 1, name: "Mineração Serra Azul", document: null, contact_name: null, contact_phone: null, notes: "Mineradora – Itabira/MG", status: "active" },
    { id: 2, name: "Shopping Parque Central", document: null, contact_name: null, contact_phone: null, notes: "Shopping – Belo Horizonte/MG", status: "active" },
    { id: 3, name: "Construtora Horizonte", document: null, contact_name: null, contact_phone: null, notes: "Obra – Contagem/MG (ainda sem fiscal)", status: "active" },
  ];
  const c = (id: number, company_id: number, code: string, name: string, starts_on: string): DbContract => ({
    id, company_id, code, name, manager_id: 2, starts_on, ends_on: null, status: "active", timezone: "America/Sao_Paulo", rules: defaultRules(),
  });
  const c1 = c(1, 1, "CT-2026-001", "Serra Azul – Mina Norte", "2026-01-10");
  c1.rules = { ...c1.rules, default_cleanings_per_day: 3, photo_after: "optional" };
  const c2 = c(2, 1, "CT-2026-002", "Serra Azul – Planta de Beneficiamento", "2026-03-01");
  c2.rules = { ...c2.rules, default_cleanings_per_day: 2, shifts: ["manha", "tarde"] };
  const c3 = { ...c(3, 2, "CT-2026-003", "Parque Central – Áreas comuns", "2026-05-15"), manager_id: 12 };
  c3.rules = { ...c3.rules, default_cleanings_per_day: 2 };
  const contracts = [
    c1,
    c2,
    c3,
    { ...c(4, 3, "CT-2026-004", "Horizonte – Canteiro Contagem", "2026-12-01"), status: "draft" as const },
  ];
  let ck = 0;
  const checklist: DbChecklist[] = contracts.flatMap((ct) =>
    DEFAULT_CHECKLIST.map((label, i) => ({ id: ++ck, contract_id: ct.id, label, position: i + 1, active: true })));

  const specs: [number, string, string, BathroomKind][] = [
    [1, "Vestiário Portaria", "Portaria principal", "unissex"],
    [1, "Banheiro Químico 01", "Frente de lavra A", "unissex"],
    [1, "Banheiro Químico 02", "Frente de lavra B", "unissex"],
    [1, "Refeitório Norte", "Refeitório", "unissex"],
    [2, "Vestiário Masculino", "Planta – bloco 1", "masculino"],
    [2, "Vestiário Feminino", "Planta – bloco 1", "feminino"],
    [2, "Sanitário Administrativo", "Prédio administrativo", "unissex"],
    [3, "Piso 1 – Masculino", "Ala leste", "masculino"],
    [3, "Piso 1 – Feminino", "Ala leste", "feminino"],
    [3, "Piso 2 – Família", "Praça de alimentação", "unissex"],
    [3, "Piso 2 – Acessível", "Praça de alimentação", "pcd"],
    [3, "Estacionamento G1", "Subsolo", "unissex"],
  ];
  const locations: DbLocation[] = [];
  const bathrooms: DbBathroom[] = specs.map(([contract_id, name, locName, kind], i) => {
    let loc = locations.find((l) => l.contract_id === contract_id && l.name === locName);
    if (!loc) { loc = { id: locations.length + 1, contract_id, name: locName, status: "active" }; locations.push(loc); }
    const tokens = ["K7MPQ2RXA9TB", "H3NWY8CZD4FE", "P6RTU2VKX7GM", "Q9ZBC4DHJ3LN", "W2XYA5EFK8RS", "T4UVM6NPQ9AB",
      "B8CDH3JKL5MZ", "E5FGR7STU2WX", "J6KLN4PQR8YZ", "M3NPA9BCD6EF", "R7STV2WXY4GH", "U9VWZ3ABC5JK"];
    return { id: i + 1, contract_id, location_id: loc.id, name, qr_token: tokens[i]!, kind, floor: null, notes: null, cleanings_per_day: null, weekdays: null, status: "active" };
  });

  const teams: DbTeam[] = [
    { id: 1, contract_id: 1, kind: "limpeza", name: "Limpeza Mina Norte", shift: "manha", status: "active" },
    { id: 2, contract_id: 1, kind: "manutencao", name: "Manutenção Mina Norte", shift: null, status: "active" },
    { id: 3, contract_id: 2, kind: "limpeza", name: "Limpeza Planta", shift: "tarde", status: "active" },
    { id: 4, contract_id: 3, kind: "limpeza", name: "Limpeza Parque Central", shift: "manha", status: "active" },
    { id: 5, contract_id: 3, kind: "manutencao", name: "Manutenção Parque Central", shift: null, status: "active" },
  ];
  const members: DbMember[] = [
    { id: 1, team_id: 1, user_id: 4, starts_on: "2026-01-10", ends_on: null, removal_reason: null },
    { id: 2, team_id: 1, user_id: 6, starts_on: "2026-01-10", ends_on: null, removal_reason: null },
    { id: 3, team_id: 1, user_id: 7, starts_on: "2026-01-10", ends_on: "2026-03-01", removal_reason: "Remanejado para a Planta" },
    { id: 4, team_id: 3, user_id: 7, starts_on: "2026-03-01", ends_on: null, removal_reason: null },
    { id: 5, team_id: 2, user_id: 5, starts_on: "2026-01-10", ends_on: null, removal_reason: null },
    { id: 6, team_id: 4, user_id: 8, starts_on: "2026-05-15", ends_on: null, removal_reason: null },
    { id: 7, team_id: 4, user_id: 9, starts_on: "2026-05-15", ends_on: null, removal_reason: null },
    { id: 8, team_id: 4, user_id: 10, starts_on: "2026-05-15", ends_on: null, removal_reason: null },
    { id: 9, team_id: 5, user_id: 11, starts_on: "2026-05-15", ends_on: null, removal_reason: null },
  ];
  const fiscal_links: DbFiscalLink[] = [
    { id: 1, contract_id: 1, user_id: 3, starts_on: "2026-01-10", ends_on: null },
    { id: 2, contract_id: 2, user_id: 3, starts_on: "2026-03-01", ends_on: null },
    { id: 3, contract_id: 3, user_id: 13, starts_on: "2026-05-15", ends_on: null },
  ];
  const audit: DbAudit[] = [
    { id: 1, action: "team_member.moved", entity: "user", entity_id: 7, before: { team_id: 1 }, after: { team_id: 3 },
      reason: "Remanejado para a Planta", created_at: "2026-03-01T08:00:00-03:00", actor_id: 2 },
  ];
  return { version: SEED_VERSION, users, companies, contracts, fiscal_links, checklist, locations, bathrooms, status_periods: [], teams, members, audit, revoked_tokens: [] };
}
