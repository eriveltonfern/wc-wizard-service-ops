import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHelp } from "@/components/layout/PageHeader";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { changeUserRole, deleteUser, getUser, getUserHistory, inactivateUser, listCompanies, reactivateUser } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { canManageUser, meQuery, roleLabel } from "@/lib/auth";
import { fmtPeriod, fmtShort, todayIso } from "@/lib/format";
import type { AuditEvent, Membership, Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserForm } from "@/components/people/UserForm";
import {
  ConfirmDialog, EmptyBlock, ErrorBlock, Field, FormDialog, FormError, HistoryNotice, LoadingBlock, NativeSelect, PendingButton, ReasonDialog, StatusBadge, useAction,
} from "@/components/contracts/kit";

export const Route = createFileRoute("/_app/pessoas/$id")({
  head: () => ({
    meta: [
      { title: "Pessoa · WCCheck 2.0" },
      { name: "description", content: "Dados da pessoa, equipes e linha do tempo." },
      { property: "og:title", content: "Pessoa · WCCheck 2.0" },
      { property: "og:description", content: "Dados da pessoa, equipes e linha do tempo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PersonPage,
});

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function describe(e: AuditEvent, memberships: Membership[]) {
  const team = (id: unknown) => memberships.find((m) => m.team_id === Number(id))?.team_name ?? "outra equipe";
  const b = e.before ?? {}; const a = e.after ?? {};
  switch (e.action) {
    case "user.created": return "Criou o cadastro";
    case "user.updated": return "Editou os dados";
    case "user.role_changed": return `Mudou o perfil de ${roleLabel[b["role"] as Role] ?? "—"} para ${roleLabel[a["role"] as Role] ?? "—"}`;
    case "team_member.added": return `Entrou na equipe ${team(a["team_id"])}`;
    case "team_member.removed": return `Saiu da equipe ${team(b["team_id"])}`;
    case "team_member.moved": return `Trocou da equipe ${team(b["team_id"])} para ${team(a["team_id"])}`;
    case "user.inactivated": return "Inativou o cadastro";
    case "user.reactivated": return "Reativou o cadastro";
    case "fiscal.linked": return "Foi vinculado como fiscal de um contrato";
    case "fiscal.unlinked": return "Teve o vínculo de fiscal encerrado";
    default: return "Alteração no cadastro";
  }
}

function PersonPage() {
  const { id } = Route.useParams();
  const uid = Number(id);
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(meQuery);
  const q = useQuery({ queryKey: ["user", uid], queryFn: () => getUser(uid), retry: false });
  const history = useQuery({ queryKey: ["user-history", uid], queryFn: () => getUserHistory(uid), enabled: q.isSuccess });
  const [editing, setEditing] = useState(false);
  const [inactivating, setInactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const inact = useAction((reason: string) => inactivateUser(uid, { reason }), { success: "Pessoa inativada." });
  const react = useAction(() => reactivateUser(uid), { success: "Pessoa reativada." });
  const del = useAction(() => deleteUser(uid), { success: "Pessoa excluída.", onSuccess: () => { setDeleting(false); void navigate({ to: "/pessoas" }); } });

  const back = <Link to="/pessoas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Voltar para pessoas</Link>;
  if (q.isLoading) return <div className="space-y-4">{back}<LoadingBlock label="Carregando…" /></div>;
  if (q.isError || !q.data) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="space-y-4">{back}<ErrorBlock message={nf ? "Pessoa não encontrada." : "Não foi possível carregar a pessoa."} onRetry={nf ? undefined : () => void q.refetch()} /></div>;
  }
  const u = q.data;
  const manage = canManageUser(me, u);
  const today = todayIso();
  const current = u.memberships.filter((m) => !m.ends_on || m.ends_on > today);
  const past = u.memberships.filter((m) => m.ends_on && m.ends_on <= today);

  return (
    <div className="space-y-6">
      {back}
      <PageHelp>Dados da pessoa, equipes atuais e antigas e a linha do tempo com tudo o que mudou.</PageHelp>
      <header className="rounded-[10px] border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold tracking-tight text-ink">{u.name}</h1><StatusBadge status={u.status} /></div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">E-mail</dt><dd className="break-all font-medium text-foreground">{u.email}</dd></div>
          <div><dt className="text-muted-foreground">Telefone</dt><dd className="font-medium text-foreground">{u.phone ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Perfil</dt><dd className="font-medium text-foreground">{roleLabel[u.role]}</dd></div>
        </dl>
        {u.must_change_password && <p className="mt-3 text-sm text-muted-foreground">Ainda não trocou a senha temporária.</p>}
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar</Button>
            {me.role === "admin" && <Button variant="outline" className="min-h-11" onClick={() => setRoleOpen(true)}>Mudar perfil</Button>}
            {u.id !== me.id && (u.status === "active"
              ? <Button variant="outline" className="min-h-11" onClick={() => { inact.reset(); setInactivating(true); }}>Inativar</Button>
              : <PendingButton variant="outline" pending={react.pending} onClick={() => void react.run()}>Reativar</PendingButton>)}
            {u.id !== me.id && <Button variant="outline" className="min-h-11 text-danger" onClick={() => { del.reset(); setDeleting(true); }}><Trash2 className="h-4 w-4" />Excluir</Button>}
          </div>
        )}
        <div className="mt-3"><FormError error={react.error} /></div>
      </header>

      <section className="rounded-[10px] border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Equipes</h2>
        {u.memberships.length === 0 ? <div className="mt-3"><EmptyBlock title="Nunca fez parte de uma equipe." /></div> : (
          <div className="mt-3 space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atuais</h3>
              {current.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nenhuma equipe atual.</p> : (
                <ul className="mt-1 divide-y">{current.map((m) => (
                  <li key={m.id} className="py-2">
                    <Link to="/contratos/$id" params={{ id: String(m.contract_id) }} search={{ tab: "equipes" }} className="font-medium text-primary hover:underline">{m.team_name}</Link>
                    <p className="text-sm text-muted-foreground">{m.contract_code} · {m.contract_name} · desde {fmtShort(m.starts_on)}</p>
                  </li>
                ))}</ul>
              )}
            </div>
            {past.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anteriores</h3>
                <ul className="mt-1 divide-y">{past.map((m) => (
                  <li key={m.id} className="py-2 text-sm">
                    <span className="font-medium text-foreground">{m.team_name}</span>
                    <span className="text-muted-foreground"> · {m.contract_code} · {fmtPeriod(m.starts_on, m.ends_on)}{m.removal_reason ? ` · ${m.removal_reason}` : ""}</span>
                  </li>
                ))}</ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[10px] border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Linha do tempo</h2>
        {history.isLoading ? <div className="mt-3"><LoadingBlock /></div>
          : history.isError ? <div className="mt-3"><ErrorBlock message="Não foi possível carregar a linha do tempo." onRetry={() => void history.refetch()} /></div>
          : !history.data?.events.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum registro ainda.</p>
          : (
            <ol className="mt-3 space-y-4 border-l-2 border-border pl-4">
              {history.data.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                  <p className="font-medium text-foreground">{describe(e, history.data.memberships)}</p>
                  <p className="text-sm text-muted-foreground">{fmtDateTime(e.created_at)}{e.actor ? ` · por ${e.actor.name}` : ""}</p>
                  {e.reason && <p className="text-sm text-foreground">Motivo: {e.reason}</p>}
                </li>
              ))}
            </ol>
          )}
      </section>

      <UserForm open={editing} onOpenChange={setEditing} roles={[]} user={u} />
      {roleOpen && <RoleDialog userId={u.id} currentRole={u.role} currentCompany={u.company_id} onClose={() => setRoleOpen(false)} />}
      <ReasonDialog open={inactivating} onOpenChange={setInactivating} title="Inativar pessoa" submitLabel="Inativar" destructive
        description="A pessoa sai das equipes e perde o acesso." error={inact.error} onConfirm={(r) => inact.run(r)} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Excluir pessoa" description={`Excluir ${u.name}? Esta ação não pode ser desfeita.`}
        submitLabel="Excluir" pending={del.pending} error={del.error} onConfirm={() => void del.run()}>
        {del.error?.code === "has_history" && (
          <HistoryNotice>
            {u.status === "active"
              ? <Button type="button" variant="outline" className="min-h-11" onClick={() => { setDeleting(false); inact.reset(); setInactivating(true); }}>Inativar</Button>
              : <span className="text-muted-foreground">O cadastro já está inativo.</span>}
          </HistoryNotice>
        )}
      </ConfirmDialog>
    </div>
  );
}

function RoleDialog({ userId, currentRole, currentCompany, onClose }: { userId: number; currentRole: Role; currentCompany?: number | undefined; onClose: () => void }) {
  const [f, setF] = useState({ role: currentRole as string, company_id: currentCompany ? String(currentCompany) : "", reason: "" });
  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: f.role === "fiscal" });
  const save = useAction(() => changeUserRole(userId, { role: f.role, reason: f.reason, ...(f.role === "fiscal" && f.company_id ? { company_id: Number(f.company_id) } : {}) }),
    { success: "Perfil alterado.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Mudar perfil" submitLabel="Mudar perfil" pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Novo perfil" id="r_role" error={save.fields["role"]}>
        <NativeSelect id="r_role" autoFocus value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </NativeSelect>
      </Field>
      {f.role === "fiscal" && (
        <Field label="Empresa" id="r_company" error={save.fields["company_id"]}>
          <NativeSelect id="r_company" value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>
            <option value="">{companies.isLoading ? "Carregando…" : "Escolha a empresa"}</option>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label="Motivo" id="r_reason" error={save.fields["reason"]}><Textarea id="r_reason" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      {save.error && Object.keys(save.fields).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}
