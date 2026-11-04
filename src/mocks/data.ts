export const users = [
  { id: 1, name: "Ana Diretora", email: "admin@wccheck.test", role: "admin", company_id: null, password: "wccheck123" },
  { id: 2, name: "Bruno Gestor", email: "gestor@wccheck.test", role: "gestor", company_id: null, password: "wccheck123" },
  { id: 3, name: "Carla Fiscal", email: "fiscal@wccheck.test", role: "fiscal", company_id: 1, password: "wccheck123" },
  { id: 4, name: "Diego Limpeza", email: "limpeza@wccheck.test", role: "limpeza", company_id: null, password: "wccheck123" },
  { id: 5, name: "Elisa Manutenção", email: "manutencao@wccheck.test", role: "manutencao", company_id: null, password: "wccheck123" },
];

export const companies = [
  { id: 1, name: "Mineração Serra Azul", segment: "mineradora", city: "Itabira/MG" },
  { id: 2, name: "Shopping Parque Central", segment: "shopping", city: "Belo Horizonte/MG" },
];

export const contracts = [
  { id: 1, company_id: 1, code: "CT-2026-001", name: "Serra Azul – Mina Norte", manager_id: 2, status: "ativo", start_date: "2026-01-10" },
  { id: 2, company_id: 1, code: "CT-2026-002", name: "Serra Azul – Planta de Beneficiamento", manager_id: 2, status: "ativo", start_date: "2026-03-01" },
  { id: 3, company_id: 2, code: "CT-2026-003", name: "Parque Central – Áreas comuns", manager_id: 2, status: "ativo", start_date: "2026-05-15" },
];

const bathroomSpecs: [number, string, string][] = [
  [1, "Vestiário Portaria", "Portaria principal"],
  [1, "Banheiro Químico 01", "Frente de lavra A"],
  [1, "Banheiro Químico 02", "Frente de lavra B"],
  [1, "Refeitório Norte", "Refeitório"],
  [2, "Vestiário Masculino", "Planta – bloco 1"],
  [2, "Vestiário Feminino", "Planta – bloco 1"],
  [2, "Sanitário Administrativo", "Prédio administrativo"],
  [3, "Piso 1 – Masculino", "Ala leste"],
  [3, "Piso 1 – Feminino", "Ala leste"],
  [3, "Piso 2 – Família", "Praça de alimentação"],
  [3, "Piso 2 – Acessível", "Praça de alimentação"],
  [3, "Estacionamento G1", "Subsolo"],
];
export const bathrooms = bathroomSpecs.map(([contract_id, name, location], i) => ({
  id: i + 1,
  contract_id,
  name,
  location,
  qr_code: `WC-${String(i + 1).padStart(4, "0")}`,
  status: "ativo",
}));

export const teams = [
  { id: 1, name: "Equipe Serra Azul", contract_ids: [1, 2], leader_id: 1 },
  { id: 2, name: "Equipe Parque Central", contract_ids: [3], leader_id: 5 },
];

export const people = [
  { id: 1, name: "Diego Limpeza", role: "limpeza", team_id: 1, user_id: 4, phone: "(31) 99999-0001" },
  { id: 2, name: "Fernanda Souza", role: "limpeza", team_id: 1, user_id: null, phone: "(31) 99999-0002" },
  { id: 3, name: "Gustavo Lima", role: "limpeza", team_id: 1, user_id: null, phone: "(31) 99999-0003" },
  { id: 4, name: "Elisa Manutenção", role: "manutencao", team_id: 1, user_id: 5, phone: "(31) 99999-0004" },
  { id: 5, name: "Helena Rocha", role: "limpeza", team_id: 2, user_id: null, phone: "(31) 99999-0005" },
  { id: 6, name: "Igor Martins", role: "limpeza", team_id: 2, user_id: null, phone: "(31) 99999-0006" },
  { id: 7, name: "Júlia Pereira", role: "limpeza", team_id: 2, user_id: null, phone: "(31) 99999-0007" },
  { id: 8, name: "Kleber Alves", role: "manutencao", team_id: 2, user_id: null, phone: "(31) 99999-0008" },
];
