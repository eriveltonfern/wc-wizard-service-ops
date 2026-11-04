export type ContractTab = "geral" | "banheiros" | "equipes" | "regras";
export type ContractCtx = { canManage: boolean; isAdmin: boolean; goTab: (t: ContractTab) => void };
