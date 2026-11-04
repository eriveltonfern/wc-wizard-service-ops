ROTAS (prefixo /api; todas exigem Bearer, exceto /health e /auth/login)
GET /health — Saúde do servidor (banco e disco). → 200 {db: string, disk_free_mb: integer}
POST /auth/login — Entrar com e-mail e senha. body LoginInput → 200 {token: string, user: User}
POST /auth/logout — Sair (revoga o token atual). → 204
GET /me — Dados da pessoa logada. → 200 User
POST /me/password — Trocar a própria senha (revoga as outras sessões). body {current: string, new: string} → 200 {changed: boolean}
GET /companies — Listar empresas contratantes (admin). → 200 Company[]
POST /companies — Cadastrar empresa (admin). body CompanyInput → 201 CompanyDetail
GET /companies/{id} — Ver empresa com contratos e fiscais. → 200 CompanyDetail
PATCH /companies/{id} — Editar empresa. body CompanyInput → 200 CompanyDetail
DELETE /companies/{id} — Excluir empresa sem histórico. → 204
POST /companies/{id}/inactivate — Inativar empresa (suspende contratos ativos). body {reason: string} → 200 CompanyDetail
POST /companies/{id}/reactivate — Reativar empresa. → 200 CompanyDetail
GET /contracts — Listar contratos no escopo do usuário. → 200 Contract[]
POST /contracts — Criar contrato (admin; nasce em rascunho com checklist padrão). body ContractInput → 201 ContractDetail
GET /contracts/{id} — Ver contrato com fiscais, checklist e ativação. → 200 ContractDetail
PATCH /contracts/{id} — Editar contrato e regras. body ContractInput → 200 ContractDetail
DELETE /contracts/{id} — Excluir contrato sem histórico (admin). → 204
GET /contracts/{id}/activation — O que falta para ativar. → 200 Activation
POST /contracts/{id}/activate — Ativar contrato em rascunho. body {reason: string} → 200 ContractDetail
POST /contracts/{id}/reactivate — Reativar contrato suspenso. body {reason: string} → 200 ContractDetail
POST /contracts/{id}/suspend — Suspender contrato ativo. body {reason: string} → 200 ContractDetail
POST /contracts/{id}/end — Encerrar contrato (admin). body {reason: string} → 200 ContractDetail
POST /contracts/{id}/fiscals — Vincular fiscal da empresa ao contrato. body {user_id: integer, starts_on: date, ends_on: date} → 201 FiscalLink
POST /contracts/{id}/fiscals/{link}/end — Encerrar vínculo de fiscal. body {ends_on: date} → 200 FiscalLink
GET /contracts/{id}/checklist — Itens do checklist. → 200 ChecklistItem[]
POST /contracts/{id}/checklist — Adicionar item ao checklist. body {label: string} → 201 ChecklistItem
POST /contracts/{id}/checklist/reorder — Reordenar checklist (todos os ids). body {ids: integer[]} → 200 ChecklistItem[]
PATCH /contracts/{id}/checklist/{item} — Editar ou desativar item. body {label: string, active: boolean} → 200 ChecklistItem
DELETE /contracts/{id}/checklist/{item} — Remover item. → 204
GET /contracts/{id}/locations — Locais do contrato. → 200 Location[]
POST /contracts/{id}/locations — Criar local. body {name: string} → 201 Location
PATCH /locations/{id} — Editar ou inativar local. body {name: string, status: string} → 200 Location
DELETE /locations/{id} — Excluir local sem banheiros. → 204
GET /bathrooms — Buscar banheiros (contract_id, q em nome/local/andar/QR/contrato/empresa, status; sem acento; até 50). → 200 Bathroom[] (meta {total, limit})
POST /contracts/{id}/bathrooms — Cadastrar banheiro (gera o QR). body BathroomInput → 201 BathroomDetail
GET /bathrooms/{id} — Ver banheiro com períodos de interdição. → 200 BathroomDetail
PATCH /bathrooms/{id} — Editar banheiro (null em plano = herda do contrato). body BathroomInput → 200 BathroomDetail
DELETE /bathrooms/{id} — Excluir banheiro sem histórico. → 204
POST /bathrooms/{id}/inactivate — Inativar banheiro. → 200 BathroomDetail
POST /bathrooms/{id}/reactivate — Reativar banheiro. → 200 BathroomDetail
POST /bathrooms/{id}/regenerate-qr — Gerar novo QR (o antigo deixa de valer). → 200 BathroomDetail
GET /bathrooms/{id}/status-periods — Períodos de interdição. → 200 StatusPeriod[]
POST /bathrooms/{id}/status-periods — Registrar interdição (sem sobreposição). body {starts_on: date, ends_on: date, reason: string} → 201 StatusPeriod
DELETE /status-periods/{id} — Remover interdição. → 204
GET /q/{token} — Ler QR: banheiro do escopo do usuário. → 200 {bathroom_id: integer, contract_id: integer, name: string, status: string}
GET /contracts/{id}/labels — Etiquetas para impressão (banheiros ativos). → 200 Label[]
GET /contracts/{id}/teams — Equipes do contrato com membros atuais. → 200 Team[]
POST /contracts/{id}/teams — Criar equipe de limpeza ou manutenção. body {name: string, kind: string, shift: string} → 201 Team
PATCH /teams/{id} — Editar ou inativar equipe. body {name: string, shift: string, status: string} → 200 Team
DELETE /teams/{id} — Excluir equipe sem histórico. → 204
GET /teams/{id}/members — Membros (include_past=1 traz os antigos). → 200 Member[]
POST /teams/{id}/members — Adicionar pessoa à equipe. body {user_id: integer, starts_on: date} → 201 Member
POST /team-members/{id}/end — Tirar da equipe (motivo obrigatório). body {ends_on: date, reason: string} → 200 Member
POST /team-members/{id}/move — Trocar de equipe (atômico, motivo obrigatório). body {to_team_id: integer, date: date, reason: string} → 200 Member
GET /users — Listar pessoas (role, status, q) no escopo. → 200 User[]
POST /users — Cadastrar pessoa (devolve senha temporária uma vez). body UserInput → 201 {user: User, temporary_password: string}
GET /users/{id} — Ver pessoa com vínculos de equipe. → 200 UserDetail
PATCH /users/{id} — Editar dados da pessoa. body UserInput → 200 User
DELETE /users/{id} — Excluir pessoa sem histórico. → 204
POST /users/{id}/inactivate — Inativar (revoga sessões e encerra equipes). body {reason: string} → 200 User
POST /users/{id}/reactivate — Reativar pessoa. → 200 User
PATCH /users/{id}/role — Mudar perfil (admin; motivo obrigatório). body {role: string, reason: string, company_id: integer} → 200 User
GET /users/{id}/history — Linha do tempo: eventos e vínculos. → 200 {events: AuditEvent[], memberships: Membership[]}

SCHEMAS
Error = {error: {code: string, message: string, fields: object}}
LoginInput = {email: string, password: string}
User = {id: integer, name: string, email: string, phone?: string, role: admin|gestor|fiscal|limpeza|manutencao, company_id?: integer, status: string, must_change_password: boolean}
Membership = {id: integer, team_id: integer, team_name: string, kind: string, contract_id: integer, contract_code: string, contract_name: string, starts_on: date, ends_on?: date, removal_reason?: string}
UserDetail = User + {memberships: Membership[]}
UserInput = {name: string, email: string, phone?: string, role: string, company_id?: integer}
Company = {id: integer, name: string, document?: string, contact_name?: string, contact_phone?: string, notes?: string, status: string, contracts_count: integer, fiscals_count: integer}
CompanyDetail = Company + {contracts: {id: integer, code: string, name: string, status: string, starts_on: date, ends_on?: date}[], fiscals: {id: integer, name: string, email: string, status: string}[]}
CompanyInput = {name: string, document?: string, contact_name?: string, contact_phone?: string, notes?: string}
Contract = {id: integer, code: string, name: string, company: {id: integer, name: string}, manager?: {id: integer, name: string}, starts_on: date, ends_on?: date, status: draft|active|suspended|ended, timezone: string, rules: {photo_before: required|optional|off, photo_after: required|optional|off, default_cleanings_per_day: integer, default_weekdays: integer[], shifts: manha|tarde|noite[]}, counts: {bathrooms: integer, teams: integer}}
ContractDetail = Contract + {fiscals: FiscalLink[], checklist: ChecklistItem[], activation: Activation}
ContractInput = {company_id: integer, code: string, name: string, starts_on: date, ends_on?: date, manager_id?: integer, timezone: string} + {photo_before: required|optional|off, photo_after: required|optional|off, default_cleanings_per_day: integer, default_weekdays: integer[], shifts: manha|tarde|noite[]}
Activation = {ready: boolean, missing: manager|bathroom|cleaning_team|fiscal|company[]} — nesta ordem. "fiscal" falta quando o contrato não tem fiscal ativo da empresa do contrato com vínculo vigente (starts_on <= hoje e ends_on vazio ou >= hoje).
FiscalLink = {id: integer, user_id: integer, name: string, email: string, starts_on: date, ends_on?: date}
ChecklistItem = {id: integer, label: string, position: integer, active: boolean}
Location = {id: integer, contract_id: integer, name: string, status: string, bathrooms_count: integer}
Bathroom = {id: integer, contract_id: integer, contract: {id: integer, code: string, name: string}, company: {id: integer, name: string} (empresa do contrato), location?: {id: integer, name: string}, name: string, qr_token: string, kind: masculino|feminino|unissex|pcd, floor?: string, notes?: string, cleanings_per_day?: integer, weekdays?: integer[], effective_plan: {cleanings_per_day: integer, weekdays: integer[]}, status: string}
BathroomDetail = Bathroom + {status_periods: StatusPeriod[]}
BathroomInput = {name: string, location_id?: integer, kind: string, floor?: string, notes?: string, cleanings_per_day?: integer, weekdays?: integer[]}
StatusPeriod = {id: integer, bathroom_id: integer, starts_on: date, ends_on: date, reason: string}
Label = {bathroom_id: integer, name: string, location?: string, url: string}
Team = {id: integer, contract_id: integer, kind: limpeza|manutencao, name: string, shift?: string, status: string, members: Member[]}
Member = {id: integer, team_id: integer, user_id: integer, name: string, role: string, starts_on: date, ends_on?: date, removal_reason?: string}
AuditEvent = {id: integer, action: string, entity: string, entity_id: integer, before?: object, after?: object, reason?: string, created_at: string, actor?: {id: integer, name: string}}
