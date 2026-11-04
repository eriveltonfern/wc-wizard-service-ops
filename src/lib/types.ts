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

// ---------- Protótipo (docs/api-contrato-proposta.md) ----------
export type TaskStatus = "pending" | "done" | "not_done" | "cancelled";
export type Task = {
  id: string; date: ISODate; shift: Shift; shift_ends_at: string; status: TaskStatus; late: boolean;
  bathroom: { id: number; name: string }; location?: string | undefined;
  contract: { id: number; code: string; name: string };
  done_at?: string | undefined; cleaning_id?: number | undefined;
};
export type MeToday = {
  date: ISODate; now: string; first_name: string;
  contracts: { id: number; code: string; name: string }[];
  summary: { done: number; total: number };
  next: Task | null; tasks: Task[];
};
export type ChecklistAnswer = "ok" | "not_ok" | "na";
export type CleaningMark = "repeated_photo" | "offline" | "out_of_shift" | "no_location";
export type Cleaning = {
  id: number;
  bathroom: { id: number; name: string }; location?: string | undefined;
  contract: { id: number; code: string; name: string };
  user: { id: number; name: string };
  link: { kind: "task"; task_id: string; shift?: Shift | undefined } | { kind: "extra" };
  registered_at: string; client_finished_at: string;
  marks: CleaningMark[]; status: "valid" | "cancelled"; cancel_reason?: string | undefined;
  photo_before_url?: string | undefined; photo_after_url?: string | undefined;
  checklist: { item_id: number; label: string; answer: ChecklistAnswer; open_ticket: boolean }[];
  notes?: string | undefined;
  position?: { latitude: number; longitude: number; accuracy?: number | undefined } | undefined;
  ticket_suggestions?: { item_id: number; label: string; category: TicketCategory; description: string }[] | undefined;
  review?: { by: { id: number; name: string }; at: string; outcome: "ok" | "cancelled" } | undefined;
  repeated_with?: number | undefined;
  cancel_effect?: CancelEffect | undefined;
};
export type CleaningForm = {
  bathroom: { id: number; name: string; location?: string | undefined; status: string };
  contract: { id: number; code: string; name: string };
  rules: { photo_before: PhotoRule; photo_after: PhotoRule; capture_location: boolean };
  checklist: { id: number; label: string }[];
  pending_task: Task | null;
};
export type CleaningInput = {
  bathroom_id: number;
  photo_before?: Blob | null | undefined; photo_after?: Blob | null | undefined;
  checklist: { item_id: number; answer: ChecklistAnswer; open_ticket?: boolean | undefined }[];
  notes?: string | undefined;
  latitude?: number | undefined; longitude?: number | undefined; accuracy?: number | undefined;
  client_finished_at: string; idempotency_key: string; queued?: boolean | undefined;
};

// ---------- Protótipo Parte 2: chamados e conferência ----------
export type TicketCategory = "hidraulica" | "eletrica" | "estrutura" | "abastecimento" | "outros";
export type TicketPriority = "baixa" | "normal" | "urgente";
export type TicketStatus = "open" | "in_progress" | "done" | "cancelled";
export type TicketEventKind = "opened" | "assigned" | "taken" | "started" | "done" | "cancelled" | "comment" | "priority";
export type TicketPerson = { id: number; name: string; role: Role };
export type Ticket = {
  id: number; code: string;
  contract: { id: number; code: string; name: string }; company: { id: number; name: string };
  bathroom: { id: number; name: string }; location?: string | undefined;
  category: TicketCategory; priority: TicketPriority; status: TicketStatus; description: string;
  opened_by: TicketPerson; opened_at: string; assignee?: TicketPerson | undefined;
  started_at?: string | undefined; done_at?: string | undefined; done_note?: string | undefined;
  cancel_reason?: string | undefined; cleaning_id?: number | undefined;
  photo_open_url?: string | undefined; photo_done_url?: string | undefined;
  events: { id: number; kind: TicketEventKind; actor: TicketPerson; at: string; text?: string | undefined }[];
  can: { start: boolean; done: boolean; assign: boolean; cancel: boolean; priority: boolean; comment: boolean };
  assignable?: { id: number; name: string }[] | undefined;
};
export type TicketSummary = { open: number; urgent: number; in_progress: number; done_7d: number; avg_resolution_minutes: number | null };
export type TicketFilters = {
  status?: "active" | TicketStatus | undefined; mine?: 1 | undefined; contract_id?: number | undefined; bathroom_id?: number | undefined;
  category?: TicketCategory | undefined; priority?: TicketPriority | undefined;
};
export type TicketInput = {
  bathroom_id: number; category: TicketCategory; priority?: TicketPriority | undefined; description: string;
  photo?: Blob | null | undefined; cleaning_id?: number | undefined; idempotency_key: string;
};
export type ReviewFlag = "repeated_photo" | "offline" | "out_of_shift";
export type ReviewList = { rows: Cleaning[]; counts: { total: number; repeated_photo: number; offline: number; out_of_shift: number } };
export type CancelEffect = { kind: "pending" | "not_done"; task_date: ISODate } | { kind: "extra" };

// ---------- Protótipo Partes 3/4: cálculo único, pendências, histórico, relatórios, fechamento ----------
export type StatTotals = {
  expected: number; done: number; not_done: number; pending: number; late_pending: number; cancelled: number;
  extras: number; on_time: number; late_done: number; compliance: number | null;
};
type Ref = { id: number; code: string; name: string };
export type Stats = {
  from: ISODate; to: ISODate; totals: StatTotals;
  by_contract: (StatTotals & { contract: Ref })[];
  by_bathroom: (StatTotals & { bathroom: { id: number; name: string }; location?: string | undefined; contract: Ref; company: { id: number; name: string } })[];
  by_day: { date: ISODate; expected: number; done: number; not_done: number; extras: number }[];
  by_person: { user: { id: number; name: string }; teams: string[]; done: number; on_time: number; avg_minutes: number | null }[];
};
export type StatsFilter = { from?: ISODate | undefined; to?: ISODate | undefined; month?: string | undefined; contract_id?: number | undefined; bathroom_id?: number | undefined };
export type PendingTask = {
  id: string; date: ISODate; shift: Shift; shift_ends_at: string; kind: "pending" | "late" | "not_done"; overdue_since: string | null;
  bathroom: { id: number; name: string }; location?: string | undefined; contract: Ref;
};
export type HistorySituation = "on_time" | "late" | "extra" | "cancelled";
export type CleaningHistory = { totals: StatTotals; rows: Cleaning[]; total: number; limit: number };
export type AuditEntry = AuditEvent & { entity_label: string; entity_name?: string | undefined };
export type Closing = {
  id: number | null; contract_id: number; month: string; status: "open" | "closed"; ended: boolean; totals: StatTotals;
  closed_at?: string | undefined; closed_by?: { id: number; name: string } | undefined;
  reopenings: { at: string; by: { id: number; name: string }; reason: string }[];
  can: { close: boolean; reopen: boolean };
};
