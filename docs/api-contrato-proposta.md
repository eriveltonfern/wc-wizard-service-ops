# Contrato PROPOSTO da API — rotas do protótipo

Rotas que a API PHP ainda **não** tem. Hoje são simuladas com dados de exemplo em `src/mocks/preview/` e as telas que as usam mostram a faixa "Prévia — dados de exemplo". Mesmo envelope e códigos de erro de `docs/api-contract.md` (sucesso `{ data, meta }`, erro `{ error: { code, message, fields } }`). Datas `AAAA-MM-DD`, horas em ISO 8601. **A hora oficial é a do servidor.**

## Regras gerais (decididas pelo servidor)
- Turnos: manhã 06:00–11:59, tarde 12:00–17:59, noite 18:00–05:59. A noite conta para o dia em que começou ("dia operacional").
- Tarefas do dia saem do plano efetivo do banheiro (`cleanings_per_day`, `weekdays`), distribuídas pelos turnos do contrato em ordem (manhã, tarde, noite). Banheiro interditado no dia → tarefa `cancelled`.
- A tarefa é do banheiro: qualquer membro atual de uma equipe de **limpeza** do contrato pode fazê-la.
- Status: `pending`, `done`, `not_done` (o dia operacional fechou às 05:59 do dia seguinte), `cancelled`. `late = true` quando ainda `pending` mas o turno já acabou (pode ser feita até o fim do dia).
- Marcas (`marks`) que vão para a Conferência: `offline` (mostra as duas horas), `out_of_shift`.

## Schemas
```
Task { id: string, date, shift: "manha"|"tarde"|"noite", shift_ends_at: "11:59", status, late: bool,
       bathroom: {id,name}, location?: string, contract: {id,code,name}, done_at?: ISO, cleaning_id?: int }
Cleaning { id, bathroom: {id,name}, location?, contract: {id,code,name}, user: {id,name},
           link: { kind: "task", task_id, shift } | { kind: "extra" },
           registered_at: ISO (servidor), client_finished_at: ISO (celular),
           marks: string[], status: "valid"|"cancelled", cancel_reason?,
           photo_before_url?, photo_after_url?,
           checklist: [{ item_id, label, answer: "ok"|"not_ok"|"na", open_ticket: bool }],
           notes? }
CleaningForm { bathroom: {id,name,location?,status}, contract: {id,code,name},
               rules: { photo_before, photo_after: "required"|"optional"|"off" },
               checklist: [{ id, label }], pending_task: Task|null }
```

## Rotas

| Método | Caminho | Quem | Corpo | Resposta |
|---|---|---|---|---|
| GET | /me/today | todos (limpeza: contratos das suas equipes de limpeza) | — | `{ date, now, first_name, contracts: [{id,code,name}], summary: {done,total}, next: Task\|null, tasks: Task[] }` — `total` não conta canceladas; limpezas extras não entram |
| GET | /tasks?date=&contract_id= | escopo do perfil | — | `Task[]`, meta `{ total }`. `date` padrão = dia operacional. 404 se o contrato está fora do escopo; 422 `date` inválida |
| GET | /bathrooms/{id}/cleaning-form | limpeza da equipe do contrato | — | `CleaningForm`. 404 fora do escopo; 403 se não for membro atual de equipe de limpeza; 409 conflict se banheiro/contrato não estiver ativo |
| POST | /cleanings | limpeza da equipe do contrato | **multipart/form-data**: `bathroom_id`, `photo_before` (arquivo), `photo_after` (arquivo), `checklist` (JSON `[{item_id, answer, open_ticket?}]`), `notes?`, `client_finished_at` (ISO), `idempotency_key` (UUID), `queued?` ("1" quando veio da fila sem internet) | 201 `{ cleaning: Cleaning, next: Task\|null }`. Mesma `idempotency_key` → 200 com a limpeza já gravada (não duplica) |
| GET | /me/cleanings | a própria pessoa | — | `Cleaning[]` (últimas 100, mais recentes primeiro), meta `{ total }` |
| GET | /cleanings/{id} | autor, equipe de limpeza do contrato, ou escopo do perfil | — | `Cleaning`. 404 fora do escopo |
| GET | /q/{token} | já existe (`docs/api-contract.md`) | — | `{ bathroom_id, contract_id, name, status }` |

### Validações de POST /cleanings (422 `validation_failed`)
- `bathroom_id`: "Campo obrigatório."
- `photo_before` / `photo_after` com regra `required` e sem arquivo: "Tire a foto antes/depois da limpeza. Neste contrato ela é obrigatória." Regra `off`: arquivo é ignorado.
- `checklist`: todo item ativo do checklist precisa de `ok`, `not_ok` ou `na` → "Responda todos os itens do checklist."

### Vínculo com a tarefa
- Usa `client_finished_at` se for plausível (não no futuro e há menos de 24 h); senão a hora do servidor.
- Liga à tarefa `pending` do banheiro no turno daquela hora; se não houver, à mais antiga atrasada (`out_of_shift`). Tarefas de turnos futuros não são consumidas. Sem tarefa → `link.kind = "extra"`.
- `offline` quando `queued = "1"` ou quando a diferença entre servidor e `client_finished_at` passa de 5 min.
- `open_ticket` só guarda a intenção de abrir chamado (chamados virão na Parte 2).

---

# Parte 2 — Chamados e Conferência

## Regras (decididas pelo servidor)
- Quem abre chamado: limpeza (membro atual de equipe de limpeza do contrato), gestor (seus contratos) e admin. Fiscal e manutenção não abrem.
- Categorias: `hidraulica`, `eletrica`, `estrutura`, `abastecimento`, `outros`. Prioridades: `baixa`, `normal` (padrão), `urgente`.
- Fluxo: `open` → `in_progress` (a manutenção clica em Iniciar e o chamado fica com ela) → `done` (exige foto do reparo e nota). `cancelled` só por gestor/admin, com motivo.
- Todo passo vira evento na linha do tempo, com autor e hora: `opened`, `assigned` (gestor atribuiu), `taken` (manutenção assumiu ao iniciar), `started`, `done`, `cancelled`, `comment`, `priority`.
- Listas ordenadas com os ativos primeiro, urgentes no topo.
- Escopo: admin/gestor/fiscal = contratos do perfil; manutenção = contratos em que é membro atual de equipe de manutenção; limpeza = só os chamados que abriu.
- `can` diz quais botões o servidor aceita para quem pediu (a interface só mostra).
- Sugestão do checklist: na limpeza, item `not_ok` com `open_ticket = true` gera `ticket_suggestions` com a categoria sugerida pelo texto do item (papel/sabonete → abastecimento; pia/vaso → hidráulica; lâmpada/tomada → elétrica; porta/piso → estrutura; senão outros) e a descrição "Checklist: <item> não OK".
- Conferência: limpezas `valid` com marca `offline` ou `out_of_shift` e ainda não conferidas. "Está certo" grava quem conferiu. Cancelar exige motivo; a tarefa volta a `pending` se o dia operacional ainda está aberto, senão passa a `not_done`; limpeza extra não muda tarefa.

## Schemas
```
Ticket { id, code: "CH-0001", contract: {id,code,name}, company: {id,name}, bathroom: {id,name}, location?,
         category, priority, status: "open"|"in_progress"|"done"|"cancelled", description,
         opened_by: {id,name,role}, opened_at, assignee?: {id,name,role}, started_at?, done_at?, done_note?,
         cancel_reason?, cleaning_id?, photo_open_url?, photo_done_url?,
         events: [{ id, kind, actor: {id,name,role}, at, text? }],
         can: { start, done, assign, cancel, priority, comment },
         assignable?: [{id,name}] }   // só em GET /tickets/{id}, para quem pode atribuir
TicketSummary { open, urgent, in_progress, done_7d, avg_resolution_minutes: int|null }
Cleaning (acréscimos) { ticket_suggestions?: [{item_id,label,category,description}],
         review?: { by: {id,name}, at, outcome: "ok"|"cancelled" },
         cancel_effect?: { kind: "pending"|"not_done", task_date } | { kind: "extra" } }
```

## Rotas

| Método | Caminho | Quem | Corpo | Resposta |
|---|---|---|---|---|
| GET | /tickets?status=&mine=&contract_id=&bathroom_id=&category=&priority= | escopo acima | — | `Ticket[]`, meta `{ total }`. `status` = `active` (aberto+andamento) ou um status; sem `status`: ativos + encerrados nos últimos 7 dias. `mine=1` = atribuídos a mim |
| GET | /tickets/summary?contract_id=&category=&priority= | admin, gestor, fiscal, manutenção | — | `TicketSummary` (tempo médio = abertura → conclusão dos concluídos em 7 dias) |
| POST | /tickets | limpeza da equipe, gestor, admin | **multipart**: `bathroom_id`, `category`, `priority?`, `description`, `photo?`, `cleaning_id?`, `idempotency_key` | 201 `Ticket`. 422: `bathroom_id` "Escolha o banheiro.", `category` "Escolha a categoria.", `description` "Descreva o problema."; 403 para outros perfis; mesma chave → 200 com o já criado |
| GET | /tickets/{id} | escopo | — | `Ticket` (com `assignable`). 404 fora do escopo |
| POST | /tickets/{id}/assign | gestor, admin | `{ user_id }` | `Ticket`. 422 `user_id` "Escolha alguém da equipe de manutenção deste contrato."; 409 se encerrado |
| POST | /tickets/{id}/start | manutenção do contrato | `{ idempotency_key? }` | `Ticket` (`in_progress`, responsável = quem iniciou). Repetir pela mesma pessoa → 200 sem mudar. 409 se já está com outra pessoa ou encerrado |
| POST | /tickets/{id}/done | responsável (manutenção) | **multipart**: `photo`, `note`, `idempotency_key` | `Ticket`. 422 `photo` "Tire a foto do reparo. Ela é obrigatória.", `note` "Escreva uma nota sobre o reparo."; 403 se não for o responsável |
| POST | /tickets/{id}/cancel | gestor, admin | `{ reason }` | `Ticket`. 422 `reason` "Informe o motivo."; 409 "Este chamado já foi encerrado." |
| POST | /tickets/{id}/comments | todos do escopo menos fiscal, com chamado ativo | `{ text }` | `Ticket`. 422 `text` "Escreva o comentário." |
| POST | /tickets/{id}/priority | gestor, admin | `{ priority }` | `Ticket` (evento `priority`). *Rota extra para "Mudar prioridade".* |
| GET | /review?flag=&contract_id=&reviewed= | gestor, admin | — | `{ rows: Cleaning[], counts: { total, offline, out_of_shift } }`. `counts` = pendentes (respeita contrato, não a marca). `reviewed=1` = conferidas nos últimos 30 dias |
| POST | /cleanings/{id}/review | gestor, admin | — | `Cleaning` com `review`. 409 se já conferida ou cancelada |
| POST | /cleanings/{id}/cancel | gestor, admin | `{ reason }` | `{ cleaning, effect: cancel_effect }`. 422 `reason` "Informe o motivo."; 409 se já cancelada |

### Fila sem internet (manutenção)
"Iniciar" e "Concluir" feitos sem internet ficam na mesma fila do aparelho (`wccheck.outbox`) e são reenviados com a mesma `idempotency_key`.

---

## Partes 3 e 4 — Painel, Pendências, Histórico, Relatórios e Fechamento

### Regra única de cálculo (servidor)
Para um filtro (período + contrato [+ banheiro]):
- **Previsto** (`expected`) = tarefas do período que não foram canceladas (cancelada = removida pelo gestor ou banheiro interditado).
- **Realizado** (`done`) = tarefas feitas (com limpeza válida). `on_time` + `late_done` (feita fora do turno) = `done`.
- **Não feitas** (`not_done`) = tarefas de dia já encerrado sem limpeza. `pending` = tarefas de hoje ainda abertas; `late_pending` = dessas, as de turno já passado.
- **Extras** (`extras`) = limpezas válidas sem tarefa. Nunca entram no %.
- **Cumprimento** (`compliance`) = `done ÷ expected` (0..1, `null` sem previsto).
Painel, Histórico, Relatórios e Fechamento usam este mesmo cálculo; para o mesmo filtro os números são idênticos. Escopo por perfil igual às outras rotas (fiscal só os contratos dele; limpeza/manutenção 403).

Schema `StatTotals`: `{ expected, done, not_done, pending, late_pending, cancelled, extras, on_time, late_done, compliance }`.

### GET /stats?month=AAAA-MM | from=&to= &contract_id=&bathroom_id=
200 → `{ from, to, totals: StatTotals, by_contract: [StatTotals + contract{id,code,name}], by_bathroom: [StatTotals + bathroom{id,name}, location, contract, company{id,name}] (pior cumprimento primeiro), by_day: [{date, expected, done, not_done, extras}], by_person: [{user{id,name}, teams[], done, on_time}] }`. Datas futuras são cortadas em hoje. 422 em datas inválidas.

### GET /pending-tasks?contract_id=&shift=
Pendentes/atrasadas de hoje e não feitas dos últimos 7 dias. 200 → `[{ id, date, shift, shift_ends_at, kind: "pending"|"late"|"not_done", overdue_since (ISO do fim do turno ou null), bathroom, location, contract }]`.

### GET /history/cleanings?month=|from=&to= &contract_id=&bathroom_id=&user_id=&situation=on_time|late|extra|cancelled
200 → `{ totals: StatTotals (período+contrato+banheiro; pessoa e situação só filtram a lista), rows: Cleaning[] (até 300, mais recentes primeiro), total, limit }`.

### GET /audit?entity=contract|bathroom|team|user|company
Linha do tempo de alterações nos cadastros (até 200, mais recentes primeiro). 200 → `[AuditEvent + entity_label, entity_name]`. Diretoria vê tudo; gestor/fiscal veem o que é dos seus contratos.

### GET /contracts/{id}/closings
Mês atual e anterior. 200 → `[{ id|null, contract_id, month, status: "open"|"closed", ended, totals (congelados se fechado), closed_at?, closed_by?{id,name}, reopenings: [{at, by, reason}], can: {close, reopen} }]`.

### POST /contracts/{id}/closings  `{ month: "AAAA-MM" }`
Gestor do contrato ou diretoria. Congela os totais. 201 → Closing. 409 "Só dá para fechar um mês que já terminou." / "Este mês já está fechado."; 403 outros perfis.
Com o mês fechado, `POST /cleanings` e `POST /cleanings/{id}/cancel` daquele mês respondem 409 conflict.

### POST /closings/{id}/reopen  `{ reason }`
Só diretoria. 422 sem motivo (`fields.reason`). 200 → Closing (status "open", motivo em `reopenings`).

### Filtros combinados de Relatórios e Histórico
`GET /stats` e `GET /history/cleanings` aceitam juntos: `month` **ou** `from`/`to`, `company_id`, `contract_id`, `bathroom_id`, `user_id`.
- `company_id` restringe aos contratos da empresa (dentro do escopo do perfil).
- Em `/stats`, `user_id` filtra só `by_person`; os totais continuam sendo dos banheiros.
- `/stats` devolve também `by_company: (StatTotals & { company: {id, name} })[]`.

## Ajustes de novembro/2026

### Regras do contrato
- `monthly_target` (1–100, padrão 95): meta do mês. `/stats` devolve `target` (0–1) em `totals`, `by_company`, `by_contract` e `by_bathroom` (com vários contratos: média ponderada pelo previsto). "Abaixo da meta", "Meta atingida/Não atingida", Relatórios e Fechamento usam esse valor. 422 `monthly_target`: "Informe um valor de 1 a 100."
- `photo_before`/`photo_after`: `required | optional` (sem `off`).
- `cleaning_access`: `all` = qualquer pessoa ativa da limpeza que esteja numa equipe de limpeza do contrato; `assigned` = só as pessoas marcadas no banheiro. O checklist de ativação não muda.
- Com `assigned`, POST /cleanings e GET /bathrooms/{id}/cleaning-form de quem não está marcado → 403 "Você não está entre os responsáveis por este banheiro." GET /me/today e GET /bathrooms (perfil limpeza) só trazem os banheiros que a pessoa pode limpar.

### POST /bathrooms/transfer `{ bathroom_ids, to_contract_id, location_id?, date, reason }` → Bathroom[]
Admin ou gestor (gestor só entre contratos dele; fora do escopo → 404). Muda contrato e empresa, mantém `qr_token` e todo o histórico; grava `bathroom.transferred` em /audit com o motivo. Responsáveis marcados no contrato antigo são removidos. 422: `reason` obrigatório, `to_contract_id` inválido ou com banheiro de mesmo nome.

### GET/PUT /bathrooms/{id}/cleaners `{ user_ids }` → `{id, name}[]`
PUT substitui a lista (só pessoas ativas com perfil limpeza). Grava `bathroom.cleaners_changed`.

### GET /users/{id}/bathrooms → `{id, name, location?, contract}[]`
Banheiros em que a pessoa está marcada (cartão "Banheiros desta pessoa").

### POST /cleaners/transfer `{ from_user_id, to_user_id, bathroom_ids, reason }` → `{ moved }`
Passa os banheiros marcados de uma pessoa para outra, com motivo (grava em /audit).

### Fotos guardadas por 60 dias
Rotina diária no servidor apaga os arquivos de foto (limpezas e chamados) com mais de 60 dias e grava `photo_deleted_at`. A limpeza, o checklist, quem fez e a hora ficam para sempre. `Cleaning` ganha `photo_deleted_at?` e `photos_available_until?` (data); `Ticket` ganha `photo_deleted_at?`. Dados de exemplo cobrem 90 dias.

### QR = só avaliação do cliente (rotas públicas, sem login)
O QR não registra mais limpeza nem chamado; a interface não tem mais "Ler QR".
- GET /public/q/{token} → `{ bathroom_name, location? }`. Banheiro inativo, contrato não ativo ou QR antigo → 404 "Este QR não está mais ativo."
- POST /public/q/{token}/ratings `{ score 1–5, problems[], comment? (até 300), device_key }` → 201 `{ id }`. `problems` (sujo, sem_papel, sem_sabonete, mau_cheiro, lixo_cheio, vazamento, outro) só valem para nota até 3. Uma avaliação por aparelho por banheiro a cada 30 minutos; a mais → 429 `too_many_attempts` "Você já avaliou este banheiro agora há pouco." Não pede nome nem e-mail.

### GET /ratings?from=&to=&contract_id=&bathroom_id= → `{ rows, summary }`
Admin, gestor e fiscal (escopo de sempre). `rows` (até 100, mais recentes primeiro): `{id, score, problems, comment?, created_at, bathroom, location?, contract, company}`. `summary`: `{ average, count, negative_share (nota 1–2), top_problem, worst: [{bathroom, company, average, count}] }`.

### POST /companies/{id}/fiscals `{ user_id }` → 201 CompanyDetail
Adiciona à empresa uma pessoa que já está cadastrada com o perfil fiscal (só diretoria). A pessoa passa a ser fiscal desta empresa; se era fiscal de outra, sai de lá e os vínculos dela em contratos da empresa anterior são encerrados na data de hoje (fica em `/audit`, action `fiscal.company_changed`). Erros: 422 `user_id` — "Este fiscal já é desta empresa.", "Esta pessoa não tem o perfil fiscal.", "Este fiscal está inativo. Reative-o antes."; 403 fora da diretoria.

## Ajustar registros (gestor e diretoria)

- `PATCH /cleanings/{id}` `{client_finished_at?, user_id?, status? (valid|cancelled), checklist?[{item_id, answer}], notes?, reason}` → Cleaning.
  Só admin/gestor do contrato. `reason` obrigatório. Mês fechado → 409. Cada ajuste vai para `adjustments[]` (visível a todos) e para `/audit` (`cleaning.adjusted`). `GET /cleanings/{id}` devolve `can_adjust`.
- `PATCH /tickets/{id}` `{category?, priority?, status?, description?, assignee_id?, opened_at?, done_at?, done_note?, reason}` → Ticket.
  Só admin/gestor do contrato, qualquer situação. Gera evento `adjusted` na linha do tempo (texto: o que mudou + motivo) e `/audit` (`ticket.adjusted`). `can.adjust` no Ticket.
