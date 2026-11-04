export type ContractTab = "geral" | "banheiros" | "equipes" | "regras" | "relatorio";
export type ContractCtx = { canManage: boolean; isAdmin: boolean; goTab: (t: ContractTab) => void };
