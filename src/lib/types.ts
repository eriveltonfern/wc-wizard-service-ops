// Tipos que espelham docs/api-contract.md (fonte de verdade).
export type ISODate = string; // "AAAA-MM-DD"

export type Role = "admin" | "gestor" | "fiscal" | "limpeza" | "manutencao";
export type ContractStatus = "draft" | "active" | "suspended" | "ended";
export type PhotoRule = "required" | "optional" | "off";
export type Shift = "manha" | "tarde" | "noite";
export type TeamKind = "limpeza" | "manutencao";
export type BathroomKind = "masculino" | "feminino" | "unissex" | "pcd";
export type ActivationMissing = "manager" | "bathroom" | "cleaning_team" | "fiscal" | "company";

export type ApiErrorBody = {
  error: { code: string; message: string; fields: Record<string, string>; missing?: ActivationMissing[] | undefined; counts?: Record<string, number> | undefined };
};

export type LoginInput = { email: string; password: string };
export type Health = { db: string; disk_free_mb: number };

export type User = {
  id: number; name: string; email: string; phone?: string | undefined; role: Role;
  company_id?: number | undefined; status: string; must_change_password: boolean;
};
export type Membership = {
  id: number; team_id: number; team_name: string; kind: string;
  contract_id: number; contract_code: string; contract_name: string;
  starts_on: ISODate; ends_on?: ISODate | undefined; removal_reason?: string | undefined;
};
export type UserDetail = User & { memberships: Membership[] };
export type UserInput = { name: string; email: string; phone?: string | undefined; role: string; company_id?: number | undefined };

export type Company = {
  id: number; name: string; document?: string | undefined; contact_name?: string | undefined; contact_phone?: string | undefined;
  notes?: string | undefined; status: string; contracts_count: number; fiscals_count: number;
};
export type CompanyDetail = Company & {
  contracts: { id: number; code: string; name: string; status: string; starts_on: ISODate; ends_on?: ISODate | undefined }[];
  fiscals: { id: number; name: string; email: string; status: string }[];
};
export type CompanyInput = { name: string; document?: string | undefined; contact_name?: string | undefined; contact_phone?: string | undefined; notes?: string | undefined };

export type ContractRules = {
  photo_before: PhotoRule; photo_after: PhotoRule; capture_location: boolean;
  default_cleanings_per_day: number;
  default_weekdays: number[]; // 1 = segunda ... 7 = domingo
  shifts: Shift[];
};
export type Contract = {
  id: number; code: string; name: string;
  company: { id: number; name: string };
  manager?: { id: number; name: string } | undefined;
  starts_on: ISODate; ends_on?: ISODate | undefined; status: ContractStatus; timezone: string;
  rules: ContractRules;
  counts: { bathrooms: number; teams: number };
};
export type Activation = { ready: boolean; missing: ActivationMissing[] };
export type FiscalLink = { id: number; user_id: number; name: string; email: string; starts_on: ISODate; ends_on?: ISODate | undefined };
export type ChecklistItem = { id: number; label: string; position: number; active: boolean };
export type ContractDetail = Contract & { fiscals: FiscalLink[]; checklist: ChecklistItem[]; activation: Activation };
export type ContractInput = {
  company_id: number; code: string; name: string; starts_on: ISODate; ends_on?: ISODate | null | undefined;
  manager_id?: number | null | undefined; timezone: string;
} & ContractRules;

export type Location = { id: number; contract_id: number; name: string; status: string; bathrooms_count: number };

export type Bathroom = {
  id: number; contract_id: number;
  contract: { id: number; code: string; name: string };
  company: { id: number; name: string };
  location?: { id: number; name: string } | undefined;
  name: string; qr_token: string; kind: BathroomKind; floor?: string | undefined; notes?: string | undefined;
  cleanings_per_day?: number | undefined; weekdays?: number[] | undefined;
  effective_plan: { cleanings_per_day: number; weekdays: number[] };
  status: string;
};
export type StatusPeriod = { id: number; bathroom_id: number; starts_on: ISODate; ends_on: ISODate; reason: string };
export type BathroomDetail = Bathroom & { status_periods: StatusPeriod[] };
export type BathroomInput = {
  name: string; location_id?: number | null | undefined; kind: string; floor?: string | undefined; notes?: string | undefined;
  cleanings_per_day?: number | null | undefined; weekdays?: number[] | null | undefined;
};
export type QrLookup = { bathroom_id: number; contract_id: number; name: string; status: string };
export type Label = { bathroom_id: number; name: string; location?: string | undefined; url: string };

export type Member = {
  id: number; team_id: number; user_id: number; name: string; role: string;
  starts_on: ISODate; ends_on?: ISODate | undefined; removal_reason?: string | undefined;
};
export type Team = { id: number; contract_id: number; kind: TeamKind; name: string; shift?: string | undefined; status: string; members: Member[] };

export type AuditEvent = {
  id: number; action: string; entity: string; entity_id: number;
  before?: Record<string, unknown> | undefined; after?: Record<string, unknown> | undefined;
  reason?: string | undefined; created_at: string; actor?: { id: number; name: string } | undefined;
};
export type UserHistory = { events: AuditEvent[]; memberships: Membership[] };
