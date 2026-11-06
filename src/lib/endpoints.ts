// Uma função por operação de docs/api-contract.md. Todas passam por api.ts.
import { api } from "./api";
import type {
  Stats, StatsFilter, PendingTask, HistorySituation, CleaningHistory, AuditEntry, Closing,
  Activation, AuditEvent, CancelEffect, ReviewFlag, ReviewList, Ticket, TicketFilters, CleaningAdjustInput, TicketAdjustInput, TicketInput, TicketPriority, TicketSummary, Bathroom, Cleaning, CleaningForm, CleaningInput, MeToday, Task, BathroomDetail, BathroomInput, ChecklistItem, Company, CompanyDetail,
  CompanyInput, Contract, ContractDetail, ContractInput, FiscalLink, Health, ISODate, Label, Location,
  LoginInput, Member, BathroomTransferInput, Cleaner, CleanerTransferInput, UserBathroom, PublicQr, RatingInput, RatingList, Membership, QrLookup, StatusPeriod, Team, User, UserDetail, UserInput,
} from "./types";

type Params = Record<string, string | number | boolean | undefined | null>;
function qs(p?: Params) {
  if (!p) return "";
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}
type Reason = { reason: string };

// Saúde e sessão
export const getHealth = () => api.get<Health>("/health");
export const login = (input: LoginInput) => api.post<{ token: string; user: User }>("/auth/login", input);
export const logout = () => api.post<void>("/auth/logout");
export const getMe = () => api.get<User>("/me");
export const changeMyPassword = (input: { current: string; new: string }) => api.post<{ changed: boolean }>("/me/password", input);

// Empresas
export const listCompanies = () => api.get<Company[]>("/companies");
export const createCompany = (input: CompanyInput) => api.post<CompanyDetail>("/companies", input);
export const getCompany = (id: number) => api.get<CompanyDetail>(`/companies/${id}`);
export const updateCompany = (id: number, input: Partial<CompanyInput>) => api.patch<CompanyDetail>(`/companies/${id}`, input);
export const deleteCompany = (id: number) => api.delete<void>(`/companies/${id}`);
export const inactivateCompany = (id: number, input: Reason) => api.post<CompanyDetail>(`/companies/${id}/inactivate`, input);
export const reactivateCompany = (id: number) => api.post<CompanyDetail>(`/companies/${id}/reactivate`);
// Adiciona à empresa uma pessoa que já está cadastrada com o perfil fiscal.
export const addCompanyFiscal = (id: number, input: { user_id: number }) => api.post<CompanyDetail>(`/companies/${id}/fiscals`, input);

// Contratos
export const listContracts = (params?: Params) => api.get<Contract[]>(`/contracts${qs(params)}`);
export const createContract = (input: ContractInput) => api.post<ContractDetail>("/contracts", input);
export const getContract = (id: number) => api.get<ContractDetail>(`/contracts/${id}`);
export const updateContract = (id: number, input: Partial<ContractInput>) => api.patch<ContractDetail>(`/contracts/${id}`, input);
export const deleteContract = (id: number) => api.delete<void>(`/contracts/${id}`);
export const getContractActivation = (id: number) => api.get<Activation>(`/contracts/${id}/activation`);
export const activateContract = (id: number, input: Reason = { reason: "" }) => api.post<ContractDetail>(`/contracts/${id}/activate`, input);
export const reactivateContract = (id: number, input: Reason) => api.post<ContractDetail>(`/contracts/${id}/reactivate`, input);
export const suspendContract = (id: number, input: Reason) => api.post<ContractDetail>(`/contracts/${id}/suspend`, input);
export const endContract = (id: number, input: Reason) => api.post<ContractDetail>(`/contracts/${id}/end`, input);

// Fiscais do contrato
export const addContractFiscal = (contractId: number, input: { user_id: number; starts_on: ISODate; ends_on?: ISODate }) =>
  api.post<FiscalLink>(`/contracts/${contractId}/fiscals`, input);
export const endContractFiscal = (contractId: number, linkId: number, input: { ends_on: ISODate }) =>
  api.post<FiscalLink>(`/contracts/${contractId}/fiscals/${linkId}/end`, input);

// Checklist
export const listChecklist = (contractId: number) => api.get<ChecklistItem[]>(`/contracts/${contractId}/checklist`);
export const addChecklistItem = (contractId: number, input: { label: string }) => api.post<ChecklistItem>(`/contracts/${contractId}/checklist`, input);
export const reorderChecklist = (contractId: number, ids: number[]) => api.post<ChecklistItem[]>(`/contracts/${contractId}/checklist/reorder`, { ids });
export const updateChecklistItem = (contractId: number, itemId: number, input: Partial<{ label: string; active: boolean }>) =>
  api.patch<ChecklistItem>(`/contracts/${contractId}/checklist/${itemId}`, input);
export const deleteChecklistItem = (contractId: number, itemId: number) => api.delete<void>(`/contracts/${contractId}/checklist/${itemId}`);

// Locais
export const listLocations = (contractId: number) => api.get<Location[]>(`/contracts/${contractId}/locations`);
export const createLocation = (contractId: number, input: { name: string }) => api.post<Location>(`/contracts/${contractId}/locations`, input);
export const updateLocation = (id: number, input: Partial<{ name: string; status: string }>) => api.patch<Location>(`/locations/${id}`, input);
export const deleteLocation = (id: number) => api.delete<void>(`/locations/${id}`);

// Banheiros
export const listBathrooms = (params?: { contract_id?: number; q?: string; status?: string }) => api.getPage<Bathroom>(`/bathrooms${qs(params)}`);
export const createBathroom = (contractId: number, input: BathroomInput) => api.post<BathroomDetail>(`/contracts/${contractId}/bathrooms`, input);
export const getBathroom = (id: number) => api.get<BathroomDetail>(`/bathrooms/${id}`);
export const updateBathroom = (id: number, input: Partial<BathroomInput>) => api.patch<BathroomDetail>(`/bathrooms/${id}`, input);
export const deleteBathroom = (id: number) => api.delete<void>(`/bathrooms/${id}`);
export type PurgeResult = { deleted: Record<string, number> };
export const purgeCompany = (id: number, confirm: string) => api.post<PurgeResult>(`/companies/${id}/purge`, { confirm });
export const purgeContract = (id: number, confirm: string) => api.post<PurgeResult>(`/contracts/${id}/purge`, { confirm });
export const purgeBathroom = (id: number, confirm: string) => api.post<PurgeResult>(`/bathrooms/${id}/purge`, { confirm });
export const inactivateBathroom = (id: number) => api.post<BathroomDetail>(`/bathrooms/${id}/inactivate`);
export const reactivateBathroom = (id: number) => api.post<BathroomDetail>(`/bathrooms/${id}/reactivate`);
export const regenerateBathroomQr = (id: number) => api.post<BathroomDetail>(`/bathrooms/${id}/regenerate-qr`);
export const listStatusPeriods = (bathroomId: number) => api.get<StatusPeriod[]>(`/bathrooms/${bathroomId}/status-periods`);
export const createStatusPeriod = (bathroomId: number, input: { starts_on: ISODate; ends_on: ISODate; reason: string }) =>
  api.post<StatusPeriod>(`/bathrooms/${bathroomId}/status-periods`, input);
export const deleteStatusPeriod = (id: number) => api.delete<void>(`/status-periods/${id}`);
export const lookupQr = (token: string) => api.get<QrLookup>(`/q/${encodeURIComponent(token)}`);
export const listLabels = (contractId: number) => api.get<Label[]>(`/contracts/${contractId}/labels`);

// Equipes
export const listTeams = (contractId: number) => api.get<Team[]>(`/contracts/${contractId}/teams`);
export const createTeam = (contractId: number, input: { name: string; kind: string; shift?: string }) => api.post<Team>(`/contracts/${contractId}/teams`, input);
export const updateTeam = (id: number, input: Partial<{ name: string; shift: string; status: string }>) => api.patch<Team>(`/teams/${id}`, input);
export const deleteTeam = (id: number) => api.delete<void>(`/teams/${id}`);
export const listTeamMembers = (teamId: number, includePast = false) => api.get<Member[]>(`/teams/${teamId}/members${includePast ? "?include_past=1" : ""}`);
/** Vários de uma vez: se alguém não puder entrar, a API recusa tudo (422 em fields.user_ids). */
export const addTeamMembers = (teamId: number, input: { user_ids: number[]; starts_on: ISODate }) => api.post<Member[]>(`/teams/${teamId}/members`, input);
export const addTeamMember = (teamId: number, input: { user_id: number; starts_on: ISODate }) => api.post<Member>(`/teams/${teamId}/members`, input);
export const endTeamMember = (memberId: number, input: { ends_on: ISODate; reason: string }) => api.post<Member>(`/team-members/${memberId}/end`, input);
export const moveTeamMember = (memberId: number, input: { to_team_id: number; date: ISODate; reason: string }) => api.post<Member>(`/team-members/${memberId}/move`, input);

// Pessoas
export const listUsers = (params?: { role?: string; status?: string; q?: string }) => api.get<User[]>(`/users${qs(params)}`);
export const createUser = (input: UserInput) => api.post<{ user: User; temporary_password: string }>("/users", input);
export const getUser = (id: number) => api.get<UserDetail>(`/users/${id}`);
export const updateUser = (id: number, input: Partial<UserInput>) => api.patch<User>(`/users/${id}`, input);
export const deleteUser = (id: number) => api.delete<void>(`/users/${id}`);
export const inactivateUser = (id: number, input: Reason) => api.post<User>(`/users/${id}/inactivate`, input);
export const reactivateUser = (id: number) => api.post<User>(`/users/${id}/reactivate`);
export const changeUserRole = (id: number, input: { role: string; reason: string; company_id?: number }) => api.patch<User>(`/users/${id}/role`, input);
export const getUserHistory = (id: number) => api.get<{ events: AuditEvent[]; memberships: Membership[] }>(`/users/${id}/history`);

// ---------- Protótipo: rotas propostas (docs/api-contrato-proposta.md) ----------
export const getMyToday = () => api.get<MeToday>("/me/today");
export const listTasks = (params?: { date?: ISODate; contract_id?: number }) => api.get<Task[]>(`/tasks${qs(params)}`);
export const getCleaningForm = (bathroomId: number) => api.get<CleaningForm>(`/bathrooms/${bathroomId}/cleaning-form`);
export function createCleaning(input: CleaningInput) {
  const f = new FormData();
  f.set("bathroom_id", String(input.bathroom_id));
  if (input.photo_before) f.set("photo_before", input.photo_before, "antes.jpg");
  if (input.photo_after) f.set("photo_after", input.photo_after, "depois.jpg");
  f.set("checklist", JSON.stringify(input.checklist));
  if (input.notes) f.set("notes", input.notes);
  f.set("client_finished_at", input.client_finished_at);
  f.set("idempotency_key", input.idempotency_key);
  if (input.queued) f.set("queued", "1");
  return api.post<{ cleaning: Cleaning; next: Task | null }>("/cleanings", f);
}
export const listMyCleanings = () => api.get<Cleaning[]>("/me/cleanings");
export const getCleaning = (id: number) => api.get<Cleaning>(`/cleanings/${id}`);

// Chamados (Parte 2)
export const listTickets = (f?: TicketFilters) => api.get<Ticket[]>(`/tickets${qs(f)}`);
export const getTicketSummary = (f?: Pick<TicketFilters, "contract_id" | "category" | "priority">) => api.get<TicketSummary>(`/tickets/summary${qs(f)}`);
export const getTicket = (id: number) => api.get<Ticket>(`/tickets/${id}`);
export function createTicket(input: TicketInput) {
  const f = new FormData();
  f.set("bathroom_id", String(input.bathroom_id));
  f.set("category", input.category);
  if (input.priority) f.set("priority", input.priority);
  f.set("description", input.description);
  if (input.photo) f.set("photo", input.photo, "problema.jpg");
  if (input.cleaning_id) f.set("cleaning_id", String(input.cleaning_id));
  f.set("idempotency_key", input.idempotency_key);
  return api.post<Ticket>("/tickets", f);
}
export const assignTicket = (id: number, user_id: number) => api.post<Ticket>(`/tickets/${id}/assign`, { user_id });
export const startTicket = (id: number, idempotency_key?: string) => api.post<Ticket>(`/tickets/${id}/start`, { idempotency_key });
export function finishTicket(id: number, input: { photo?: Blob | null | undefined; note: string; idempotency_key: string }) {
  const f = new FormData();
  if (input.photo) f.set("photo", input.photo, "reparo.jpg");
  f.set("note", input.note);
  f.set("idempotency_key", input.idempotency_key);
  return api.post<Ticket>(`/tickets/${id}/done`, f);
}
export const adjustTicket = (id: number, input: TicketAdjustInput) => api.patch<Ticket>(`/tickets/${id}`, input);
export const adjustCleaning = (id: number, input: CleaningAdjustInput) => api.patch<Cleaning>(`/cleanings/${id}`, input);
export const cancelTicket = (id: number, reason: string) => api.post<Ticket>(`/tickets/${id}/cancel`, { reason });
export const commentTicket = (id: number, text: string) => api.post<Ticket>(`/tickets/${id}/comments`, { text });
export const setTicketPriority = (id: number, priority: TicketPriority) => api.post<Ticket>(`/tickets/${id}/priority`, { priority });

// Conferência (Parte 2)
export const listReview = (p?: { flag?: ReviewFlag | undefined; contract_id?: number | undefined; reviewed?: 1 | undefined }) => api.get<ReviewList>(`/review${qs(p)}`);
export const approveCleaning = (id: number) => api.post<Cleaning>(`/cleanings/${id}/review`);
export const cancelCleaning = (id: number, reason: string) => api.post<{ cleaning: Cleaning; effect: CancelEffect }>(`/cleanings/${id}/cancel`, { reason });

// Painel, Pendências, Histórico, Relatórios e Fechamento (Partes 3/4) — todos usam o mesmo cálculo no servidor
export const getStats = (f?: StatsFilter) => api.get<Stats>(`/stats${qs(f)}`);
export const listPendingTasks = (p?: { contract_id?: number | undefined; shift?: string | undefined }) => api.get<PendingTask[]>(`/pending-tasks${qs(p)}`);
export const listCleaningHistory = (p: StatsFilter & { user_id?: number | undefined; situation?: HistorySituation | undefined }) =>
  api.get<CleaningHistory>(`/history/cleanings${qs(p)}`);
export const listAudit = (p?: { entity?: string | undefined }) => api.get<AuditEntry[]>(`/audit${qs(p)}`);
export const listClosings = (contractId: number) => api.get<Closing[]>(`/contracts/${contractId}/closings`);
export const closeMonth = (contractId: number, month: string) => api.post<Closing>(`/contracts/${contractId}/closings`, { month });
export const reopenMonth = (closingId: number, reason: string) => api.post<Closing>(`/closings/${closingId}/reopen`, { reason });

// Banheiros: transferência e responsáveis (proposta)
export const transferBathrooms = (input: BathroomTransferInput) => api.post<Bathroom[]>("/bathrooms/transfer", input);
export const getBathroomCleaners = (id: number) => api.get<Cleaner[]>(`/bathrooms/${id}/cleaners`);
export const setBathroomCleaners = (id: number, user_ids: number[]) => api.put<Cleaner[]>(`/bathrooms/${id}/cleaners`, { user_ids });
export const listUserBathrooms = (userId: number) => api.get<UserBathroom[]>(`/users/${userId}/bathrooms`);
export const transferCleaner = (input: CleanerTransferInput) => api.post<{ moved: number }>("/cleaners/transfer", input);

// Avaliações do cliente (QR público, sem login)
export const getPublicQr = (token: string) => api.get<PublicQr>(`/public/q/${encodeURIComponent(token)}`);
export const sendRating = (token: string, input: RatingInput) => api.post<{ id: number }>(`/public/q/${encodeURIComponent(token)}/ratings`, input);
export const listRatings = (p?: { from?: ISODate | undefined; to?: ISODate | undefined; contract_id?: number | undefined; bathroom_id?: number | undefined }) =>
  api.get<RatingList>(`/ratings${qs(p)}`);
