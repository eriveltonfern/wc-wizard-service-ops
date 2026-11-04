# Contrato PROPOSTO da API — rotas do protótipo

Rotas que a API PHP ainda **não** tem. Hoje são simuladas com dados de exemplo em `src/mocks/preview/` e as telas que as usam mostram a faixa "Prévia — dados de exemplo". Mesmo envelope e códigos de erro de `docs/api-contract.md` (sucesso `{ data, meta }`, erro `{ error: { code, message, fields } }`). Datas `AAAA-MM-DD`, horas em ISO 8601. **A hora oficial é a do servidor.**

## Regras gerais (decididas pelo servidor)
- Turnos: manhã 06:00–11:59, tarde 12:00–17:59, noite 18:00–05:59. A noite conta para o dia em que começou ("dia operacional").
- Tarefas do dia saem do plano efetivo do banheiro (`cleanings_per_day`, `weekdays`), distribuídas pelos turnos do contrato em ordem (manhã, tarde, noite). Banheiro interditado no dia → tarefa `cancelled`.
- A tarefa é do banheiro: qualquer membro atual de uma equipe de **limpeza** do contrato pode fazê-la.
- Status: `pending`, `done`, `not_done` (o dia operacional fechou às 05:59 do dia seguinte), `cancelled`. `late = true` quando ainda `pending` mas o turno já acabou (pode ser feita até o fim do dia).
- Marcas (`marks`) que vão para a Conferência: `repeated_photo`, `offline` (mostra as duas horas), `out_of_shift`; e `no_location` (contrato pede localização e ela não veio — nunca bloqueia).

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
           notes?, position?: { latitude, longitude, accuracy? } }
CleaningForm { bathroom: {id,name,location?,status}, contract: {id,code,name},
               rules: { photo_before, photo_after: "required"|"optional"|"off", capture_location: bool },
               checklist: [{ id, label }], pending_task: Task|null }
```

## Rotas

| Método | Caminho | Quem | Corpo | Resposta |
|---|---|---|---|---|
| GET | /me/today | todos (limpeza: contratos das suas equipes de limpeza) | — | `{ date, now, first_name, contracts: [{id,code,name}], summary: {done,total}, next: Task\|null, tasks: Task[] }` — `total` não conta canceladas; limpezas extras não entram |
| GET | /tasks?date=&contract_id= | escopo do perfil | — | `Task[]`, meta `{ total }`. `date` padrão = dia operacional. 404 se o contrato está fora do escopo; 422 `date` inválida |
| GET | /bathrooms/{id}/cleaning-form | limpeza da equipe do contrato | — | `CleaningForm`. 404 fora do escopo; 403 se não for membro atual de equipe de limpeza; 409 conflict se banheiro/contrato não estiver ativo |
| POST | /cleanings | limpeza da equipe do contrato | **multipart/form-data**: `bathroom_id`, `photo_before` (arquivo), `photo_after` (arquivo), `checklist` (JSON `[{item_id, answer, open_ticket?}]`), `notes?`, `latitude?`, `longitude?`, `accuracy?`, `client_finished_at` (ISO), `idempotency_key` (UUID), `queued?` ("1" quando veio da fila sem internet) | 201 `{ cleaning: Cleaning, next: Task\|null }`. Mesma `idempotency_key` → 200 com a limpeza já gravada (não duplica) |
| GET | /me/cleanings | a própria pessoa | — | `Cleaning[]` (últimas 100, mais recentes primeiro), meta `{ total }` |
| GET | /cleanings/{id} | autor, equipe de limpeza do contrato, ou escopo do perfil | — | `Cleaning`. 404 fora do escopo |
| GET | /q/{token} | já existe (`docs/api-contract.md`) | — | `{ bathroom_id, contract_id, name, status }` |

### Validações de POST /cleanings (422 `validation_failed`)
- `bathroom_id`: "Campo obrigatório."
- `photo_before` / `photo_after` com regra `required` e sem arquivo: "Tire a foto antes/depois da limpeza. Neste contrato ela é obrigatória." Regra `off`: arquivo é ignorado.
- `checklist`: todo item ativo do checklist precisa de `ok`, `not_ok` ou `na` → "Responda todos os itens do checklist."
- Localização ausente nunca é erro.

### Vínculo com a tarefa
- Usa `client_finished_at` se for plausível (não no futuro e há menos de 24 h); senão a hora do servidor.
- Liga à tarefa `pending` do banheiro no turno daquela hora; se não houver, à mais antiga atrasada (`out_of_shift`). Tarefas de turnos futuros não são consumidas. Sem tarefa → `link.kind = "extra"`.
- `offline` quando `queued = "1"` ou quando a diferença entre servidor e `client_finished_at` passa de 5 min.
- `repeated_photo` quando a foto é igual a uma já enviada (no protótipo: mesmo tipo e tamanho de arquivo).
- `open_ticket` só guarda a intenção de abrir chamado (chamados virão na Parte 2).
