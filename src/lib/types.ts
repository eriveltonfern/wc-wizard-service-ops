// Tipos que espelham docs/api-contract.md (fonte de verdade).
export type ISODate = string; // "AAAA-MM-DD"

export type Role = "admin" | "gestor" | "fiscal" | "limpeza" | "manutencao";
export type ContractStatus = "draft" | "active" | "suspended" | "ended";
export type PhotoRule = "required" | "optional" | "off";
export type Shift = "manha" | "tarde" | "noite";
export type TeamKind = "limpeza" | "manutencao";
export type BathroomKind = "masculino" | "feminino" | "unissex" | "pcd";
export type ActivationMissing = "manager" | "bathroom" | "cleaning_team" | "company";

export type ApiErrorBody = {
  error: { code: string; message: string; fields: Record<string, string>; missing?: ActivationMissing[]; counts?: Record<string, number> };
};

export type LoginInput = { email: string; password: string };
export type Health = { db: string; disk_free_mb: number };

export type User = {
  id: number; name: string; email: string; phone?: string; role: Role;
  company_id?: number; status: string; must_change_password: boolean;
};
export type Membership = {
  id: number; team_id: number; team_name: string; kind: string;
  contract_id: number; contract_code: string; contract_name: string;
  starts_on: ISODate; ends_on?: ISODate; removal_reason?: string;
};
export type UserDetail = User & { memberships: Membership[] };
export type UserInput = { name: string; email: string; phone?: string; role: string; company_id?: number };

export type Company = {
  id: number; name: string; document?: string; contact_name?: string; contact_phone?: string;
  notes?: string; status: string; contracts_count: number; fiscals_count: number;
};
export type CompanyDetail = Company & {
  contracts: { id: number; code: string; name: string; status: string; starts_on: ISODate; ends_on?: ISODate }[];
  fiscals: { id: number; name: string; email: string; status: string }[];
};
export type CompanyInput = { name: string; document?: string; contact_name?: string; contact_phone?: string; notes?: string };

export type ContractRules = {
  photo_before: PhotoRule; photo_after: PhotoRule; capture_location: boolean;
  default_cleanings_per_day: number;
  default_weekdays: number[]; // 1 = segunda ... 7 = domingo
  shifts: Shift[];
};
export type Contract = {
  id: number; code: string; name: string;
  company: { id: number; name: string };
  manager?: { id: number; name: string };
  starts_on: ISODate; ends_on?: ISODate; status: ContractStatus; timezone: string;
  rules: ContractRules;
  counts: { bathrooms: number; teams: number };
};
export type Activation = { ready: boolean; missing: ActivationMissing[] };
export type FiscalLink = { id: number; user_id: number; name: string; email: string; starts_on: ISODate; ends_on?: ISODate };
export type ChecklistItem = { id: number; label: string; position: number; active: boolean };
export type ContractDetail = Contract & { fiscals: FiscalLink[]; checklist: ChecklistItem[]; activation: Activation };
export type ContractInput = {
  company_id: number; code: string; name: string; starts_on: ISODate; ends_on?: ISODate;
  manager_id?: number; timezone: string;
} & ContractRules;

export type Location = { id: number; contract_id: number; name: string; status: string; bathrooms_count: number };

export type Bathroom = {
  id: number; contract_id: number;
  contract: { id: number; code: string; name: string };
  location?: { id: number; name: string };
  name: string; qr_token: string; kind: BathroomKind; floor?: string; notes?: string;
  cleanings_per_day?: number; weekdays?: number[];
  effective_plan: { cleanings_per_day: number; weekdays: number[] };
  status: string;
};
export type StatusPeriod = { id: number; bathroom_id: number; starts_on: ISODate; ends_on: ISODate; reason: string };
export type BathroomDetail = Bathroom & { status_periods: StatusPeriod[] };
export type BathroomInput = {
  name: string; location_id?: number | null; kind: string; floor?: string; notes?: string;
  cleanings_per_day?: number | null; weekdays?: number[] | null;
};
export type QrLookup = { bathroom_id: number; contract_id: number; name: string; status: string };
export type Label = { bathroom_id: number; name: string; location?: string; url: string };

export type Member = {
  id: number; team_id: number; user_id: number; name: string; role: string;
  starts_on: ISODate; ends_on?: ISODate; removal_reason?: string;
};
export type Team = { id: number; contract_id: number; kind: TeamKind; name: string; shift?: string; status: string; members: Member[] };

export type AuditEvent = {
  id: number; action: string; entity: string; entity_id: number;
  before?: Record<string, unknown>; after?: Record<string, unknown>;
  reason?: string; created_at: string; actor?: { id: number; name: string };
};
export type UserHistory = { events: AuditEvent[]; memberships: Membership[] };
