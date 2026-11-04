import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreVertical, Plus, UserPlus } from "lucide-react";
import { addTeamMember, createTeam, deleteTeam, endTeamMember, listTeamMembers, listTeams, listUsers, moveTeamMember, updateTeam } from "@/lib/endpoints";
import type { ContractDetail, Member, Team } from "@/lib/types";
import { fmtPeriod, fmtShort, shiftLabel, teamKindLabel, todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ContractCtx } from "./ctx";
import { ConfirmDialog, DateInput, EmptyBlock, ErrorBlock, Field, FormDialog, FormError, HistoryNotice, LoadingBlock, NativeSelect, StatusBadge, useAction } from "./kit";

export function TeamsTab({ contract: c, ctx }: { contract: ContractDetail; ctx: ContractCtx }) {
  const q = useQuery({ queryKey: ["teams", c.id], queryFn: () => listTeams(c.id) });
  const [form, setForm] = useState<{ team?: Team } | null>(null);

  return (
    <div className="space-y-4">
      {ctx.canManage && (
        <div className="flex justify-end"><Button className="min-h-11" onClick={() => setForm({})}><Plus className="h-4 w-4" />Nova equipe</Button></div>
      )}
      {q.isLoading ? <LoadingBlock label="Carregando equipes…" />
        : q.isError ? <ErrorBlock message="Não foi possível carregar as equipes." onRetry={() => void q.refetch()} />
        : !q.data?.length ? <EmptyBlock title="Nenhuma equipe neste contrato.">{ctx.canManage && <Button className="min-h-11" onClick={() => setForm({})}>Criar equipe</Button>}</EmptyBlock>
        : <div className="grid gap-4 md:grid-cols-2">{q.data.map((t) => <TeamCard key={t.id} team={t} teams={q.data} ctx={ctx} onEdit={() => setForm({ team: t })} />)}</div>}
      {form && <TeamForm contractId={c.id} team={form.team} onClose={() => setForm(null)} />}
    </div>
  );
}

function TeamForm({ contractId, team, onClose }: { contractId: number; team?: Team | undefined; onClose: () => void }) {
  const [f, setF] = useState({ name: team?.name ?? "", kind: team?.kind ?? "limpeza", shift: team?.shift ?? "" });
  const save = useAction(
    () => team ? updateTeam(team.id, { name: f.name, shift: f.shift, status: team.status }) : createTeam(contractId, { name: f.name, kind: f.kind, ...(f.shift ? { shift: f.shift } : {}) }),
    { success: team ? "Equipe atualizada." : "Equipe criada.", onSuccess: onClose },
  );
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={team ? "Editar equipe" : "Nova equipe"} submitLabel={team ? "Salvar" : "Criar equipe"}
      pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Nome" id="team_name" error={save.fields["name"]}>
        <Input id="team_name" autoFocus className="h-11" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      {!team && (
        <Field label="Tipo" id="team_kind" error={save.fields["kind"]}>
          <NativeSelect id="team_kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Team["kind"] })}>
            <option value="limpeza">Limpeza</option><option value="manutencao">Manutenção</option>
          </NativeSelect>
        </Field>
      )}
      <Field label="Turno (opcional)" id="team_shift" error={save.fields["shift"]}>
        <NativeSelect id="team_shift" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
          <option value="">Sem turno fixo</option>
          {Object.entries(shiftLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </Field>
      {save.error && Object.keys(save.fields).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}

function TeamCard({ team: t, teams, ctx, onEdit }: { team: Team; teams: Team[]; ctx: ContractCtx; onEdit: () => void }) {
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [removeM, setRemoveM] = useState<Member | null>(null);
  const [moveM, setMoveM] = useState<Member | null>(null);
  const toggle = useAction((status: string) => updateTeam(t.id, { name: t.name, shift: t.shift ?? "", status }),
    { success: t.status === "active" ? "Equipe inativada." : "Equipe reativada." });
  const del = useAction(() => deleteTeam(t.id), { success: "Equipe excluída.", onSuccess: () => setDeleting(false) });
  const past = useQuery({ queryKey: ["members", t.id, "past"], queryFn: () => listTeamMembers(t.id, true), enabled: showPast });
  const exMembers = past.data?.filter((m) => m.ends_on && m.ends_on <= todayIso()) ?? [];

  return (
    <article className="flex flex-col rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">{t.name}</h3>
          <p className="text-sm text-muted-foreground">{teamKindLabel[t.kind]} · {t.shift ? `Turno ${shiftLabel[t.shift]?.toLowerCase()}` : "Sem turno fixo"}</p>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={t.status} />
          {ctx.canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Ações da equipe ${t.name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="min-h-11" onSelect={onEdit}>Editar</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onSelect={() => void toggle.run(t.status === "active" ? "inactive" : "active")}>{t.status === "active" ? "Inativar" : "Reativar"}</DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => { del.reset(); setDeleting(true); }}>Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Membros atuais</h4>
      {t.members.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Ninguém nesta equipe.</p> : (
        <ul className="mt-1 divide-y">
          {t.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div><p className="font-medium text-foreground">{m.name}</p><p className="text-xs text-muted-foreground">desde {fmtShort(m.starts_on)}</p></div>
              {ctx.canManage && (
                <div className="flex gap-1">
                  <Button variant="ghost" className="min-h-11" onClick={() => setMoveM(m)}>Trocar de equipe</Button>
                  <Button variant="ghost" className="min-h-11 text-destructive" onClick={() => setRemoveM(m)}>Tirar da equipe</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {ctx.canManage && t.status === "active" && <Button variant="outline" className="min-h-11" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />Adicionar pessoa</Button>}
        <Button variant="ghost" className="min-h-11" aria-expanded={showPast} onClick={() => setShowPast((s) => !s)}>{showPast ? "Esconder ex-membros" : "Ver ex-membros"}</Button>
      </div>
      {showPast && (
        <div className="mt-2 rounded-md bg-muted/50 p-3">
          {past.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
            : exMembers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum ex-membro.</p>
            : <ul className="space-y-2">{exMembers.map((m) => (
                <li key={m.id} className="text-sm"><span className="font-medium text-foreground">{m.name}</span>
                  <span className="text-muted-foreground"> · {fmtPeriod(m.starts_on, m.ends_on)}{m.removal_reason ? ` · ${m.removal_reason}` : ""}</span></li>
              ))}</ul>}
        </div>
      )}
      <FormError error={toggle.error} />

      {adding && <AddMemberDialog team={t} onClose={() => setAdding(false)} />}
      {removeM && <EndMemberDialog member={removeM} onClose={() => setRemoveM(null)} />}
      {moveM && <MoveMemberDialog member={moveM} options={teams.filter((x) => x.id !== t.id && x.kind === t.kind && x.status === "active")} onClose={() => setMoveM(null)} />}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Excluir equipe" description={`Excluir a equipe ${t.name}?`} submitLabel="Excluir"
        pending={del.pending} error={del.error} onConfirm={() => void del.run()}>
        {del.error?.code === "has_history" && t.status === "active" && (
          <HistoryNotice><Button type="button" variant="outline" className="min-h-11" onClick={() => { setDeleting(false); void toggle.run("inactive"); }}>Inativar</Button></HistoryNotice>
        )}
        {del.error?.code === "has_history" && t.status !== "active" && <HistoryNotice><span className="text-muted-foreground">A equipe já está inativa.</span></HistoryNotice>}
      </ConfirmDialog>
    </article>
  );
}

function AddMemberDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const [f, setF] = useState({ user_id: "", starts_on: todayIso() });
  const people = useQuery({ queryKey: ["users", { role: team.kind, status: "active" }], queryFn: () => listUsers({ role: team.kind, status: "active" }) });
  const current = new Set(team.members.map((m) => m.user_id));
  const add = useAction(() => addTeamMember(team.id, { user_id: Number(f.user_id) || (undefined as unknown as number), starts_on: f.starts_on }),
    { success: "Pessoa adicionada à equipe.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Adicionar pessoa · ${team.name}`} submitLabel="Adicionar" pending={add.pending} onSubmit={() => void add.run()}>
      <Field label="Pessoa" id="member_user" error={add.fields["user_id"]}>
        <NativeSelect id="member_user" autoFocus value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
          <option value="">{people.isLoading ? "Carregando…" : `Escolha uma pessoa de ${teamKindLabel[team.kind]?.toLowerCase()}`}</option>
          {people.data?.filter((u) => !current.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Data de início" id="member_start" error={add.fields["starts_on"]}><DateInput id="member_start" value={f.starts_on} onChange={(v) => setF({ ...f, starts_on: v })} /></Field>
      {add.error && Object.keys(add.fields).length === 0 && <FormError error={add.error} />}
    </FormDialog>
  );
}

function EndMemberDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [f, setF] = useState({ ends_on: todayIso(), reason: "" });
  const end = useAction(() => endTeamMember(member.id, f), { success: "Pessoa retirada da equipe.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Tirar ${member.name} da equipe`} submitLabel="Tirar da equipe" destructive
      pending={end.pending} onSubmit={() => void end.run()}>
      <Field label="Data de saída" id="end_date" error={end.fields["ends_on"]}><DateInput id="end_date" value={f.ends_on} onChange={(v) => setF({ ...f, ends_on: v })} /></Field>
      <Field label="Motivo" id="end_reason" error={end.fields["reason"]}><Textarea id="end_reason" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      {end.error && Object.keys(end.fields).length === 0 && <FormError error={end.error} />}
    </FormDialog>
  );
}

function MoveMemberDialog({ member, options, onClose }: { member: Member; options: Team[]; onClose: () => void }) {
  const [f, setF] = useState({ to_team_id: "", date: todayIso(), reason: "" });
  const move = useAction(() => moveTeamMember(member.id, { to_team_id: Number(f.to_team_id) || (undefined as unknown as number), date: f.date, reason: f.reason }),
    { success: "Pessoa trocada de equipe.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Trocar ${member.name} de equipe`} submitLabel="Trocar de equipe"
      pending={move.pending} onSubmit={() => void move.run()}>
      <Field label="Equipe de destino" id="move_team" error={move.fields["to_team_id"]}>
        <NativeSelect id="move_team" autoFocus value={f.to_team_id} onChange={(e) => setF({ ...f, to_team_id: e.target.value })}>
          <option value="">{options.length ? "Escolha a equipe" : "Não há outra equipe do mesmo tipo neste contrato"}</option>
          {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Data da troca" id="move_date" error={move.fields["date"]}><DateInput id="move_date" value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label="Motivo" id="move_reason" error={move.fields["reason"]}><Textarea id="move_reason" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      {move.error && Object.keys(move.fields).length === 0 && <FormError error={move.error} />}
    </FormDialog>
  );
}
