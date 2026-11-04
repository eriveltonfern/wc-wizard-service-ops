import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Pencil, Trash2, UserPlus, X } from "lucide-react";
import {
  activateContract, addContractFiscal, deleteContract, endContract, endContractFiscal, listUsers, reactivateContract, suspendContract,
} from "@/lib/endpoints";
import type { ActivationMissing, ContractDetail, FiscalLink, User } from "@/lib/types";
import { TempPasswordDialog, UserForm } from "@/components/people/UserForm";
import { fmtPeriod, missingLabel, todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ContractForm } from "./ContractForm";
import type { ContractCtx, ContractTab } from "./ctx";
import { ConfirmDialog, DateInput, EmptyBlock, Field, FormDialog, FormError, HistoryNotice, NativeSelect, PendingButton, ReasonDialog, useAction } from "./kit";

const ALL_MISSING: ActivationMissing[] = ["manager", "bathroom", "cleaning_team", "fiscal", "company"];
const missingTab: Partial<Record<ActivationMissing, ContractTab>> = { bathroom: "banheiros", cleaning_team: "equipes" };

export function OverviewTab({ contract: c, ctx }: { contract: ContractDetail; ctx: ContractCtx }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [reasonFor, setReasonFor] = useState<null | "suspend" | "reactivate" | "end">(null);
  const [deleting, setDeleting] = useState(false);
  const [fiscalReq, setFiscalReq] = useState(0);

  const activate = useAction(() => activateContract(c.id, { reason: "" }), { success: "Contrato ativado." });
  const statusAction = useAction(
    (kind: "suspend" | "reactivate" | "end", reason: string) =>
      (kind === "suspend" ? suspendContract : kind === "reactivate" ? reactivateContract : endContract)(c.id, { reason }),
    { success: "Situação do contrato atualizada." },
  );
  const del = useAction(() => deleteContract(c.id), {
    success: "Contrato excluído.", onSuccess: () => { setDeleting(false); void navigate({ to: "/contratos" }); },
  });
  const hasHistory = del.error?.code === "has_history";

  const reasonTitles = {
    suspend: ["Suspender contrato", "Suspender"],
    reactivate: ["Reativar contrato", "Reativar"],
    end: ["Encerrar contrato", "Encerrar"],
  } as const;

  return (
    <div className="space-y-6">
      {c.status === "draft" && (
        <section className="rounded-[10px] border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Para ativar este contrato</h2>
          <ul className="mt-3 space-y-2">
            {ALL_MISSING.map((m) => {
              const pending = c.activation.missing.includes(m);
              const tab = missingTab[m];
              return (
                <li key={m} className="flex min-h-11 flex-wrap items-center gap-3">
                  <span className={pending ? "flex h-7 w-7 items-center justify-center rounded-full bg-destructive/10 text-danger" : "flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"}>
                    {pending ? <X className="h-4 w-4" aria-label="Pendente" /> : <Check className="h-4 w-4" aria-label="Feito" />}
                  </span>
                  <span className={pending ? "font-medium text-foreground" : "text-muted-foreground"}>{missingLabel[m]}</span>
                  {pending && ctx.canManage && (
                    m === "manager" ? (ctx.isAdmin && <Button variant="link" className="h-auto p-0" onClick={() => setEditing(true)}>Definir agora</Button>)
                    : m === "fiscal" ? <Button variant="link" className="h-auto p-0" onClick={() => setFiscalReq((n) => n + 1)}>Vincular agora</Button>
                    : m === "company" ? (ctx.isAdmin && <Button variant="link" className="h-auto p-0" onClick={() => void navigate({ to: "/empresas" })}>Ver empresas</Button>)
                    : tab && <Button variant="link" className="h-auto p-0" onClick={() => ctx.goTab(tab)}>Ir para {tab === "banheiros" ? "Banheiros" : "Equipes"}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          {ctx.canManage && (
            <div className="mt-4 space-y-3">
              <PendingButton pending={activate.pending} disabled={!c.activation.ready} onClick={() => void activate.run()}>Ativar contrato</PendingButton>
              {!c.activation.ready && <p className="text-sm text-muted-foreground">Resolva as pendências acima para ativar.</p>}
              <FormError error={activate.error} />
            </div>
          )}
        </section>
      )}

      {ctx.canManage && (
        <section className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar</Button>
          {c.status === "active" && <Button variant="outline" className="min-h-11" onClick={() => setReasonFor("suspend")}>Suspender</Button>}
          {c.status === "suspended" && <Button variant="outline" className="min-h-11" onClick={() => setReasonFor("reactivate")}>Reativar</Button>}
          {ctx.isAdmin && c.status !== "ended" && <Button variant="outline" className="min-h-11" onClick={() => setReasonFor("end")}>Encerrar</Button>}
          {ctx.isAdmin && <Button variant="outline" className="min-h-11 text-danger" onClick={() => { del.reset(); setDeleting(true); }}><Trash2 className="h-4 w-4" />Excluir</Button>}
        </section>
      )}

      <FiscalsSection contract={c} ctx={ctx} openRequest={fiscalReq} />

      <ContractForm open={editing} onOpenChange={setEditing} isAdmin={ctx.isAdmin} contract={c} />
      {reasonFor && (
        <ReasonDialog open onOpenChange={(o) => { if (!o) { setReasonFor(null); statusAction.reset(); } }}
          title={reasonTitles[reasonFor][0]} submitLabel={reasonTitles[reasonFor][1]} destructive={reasonFor !== "reactivate"}
          error={statusAction.error} onConfirm={(r) => statusAction.run(reasonFor, r)} />
      )}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Excluir contrato"
        description={`Excluir o contrato ${c.code}? Esta ação não pode ser desfeita.`} submitLabel="Excluir"
        pending={del.pending} error={del.error} onConfirm={() => void del.run()}>
        {hasHistory && (
          <HistoryNotice>
            {c.status === "active" && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setDeleting(false); setReasonFor("suspend"); }}>Suspender</Button>}
            {c.status !== "ended" && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setDeleting(false); setReasonFor("end"); }}>Encerrar</Button>}
          </HistoryNotice>
        )}
      </ConfirmDialog>
    </div>
  );
}

function FiscalsSection({ contract: c, ctx, openRequest }: { contract: ContractDetail; ctx: ContractCtx; openRequest: number }) {
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<{ user: User; password: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [ending, setEnding] = useState<FiscalLink | null>(null);
  const [form, setForm] = useState({ user_id: "", starts_on: todayIso(), ends_on: "" });
  const [endDate, setEndDate] = useState(todayIso());
  const fiscals = useQuery({
    queryKey: ["users", { role: "fiscal", status: "active" }], queryFn: () => listUsers({ role: "fiscal", status: "active" }), enabled: adding,
  });
  const add = useAction(
    () => addContractFiscal(c.id, { user_id: Number(form.user_id) || (undefined as unknown as number), starts_on: form.starts_on, ...(form.ends_on ? { ends_on: form.ends_on } : {}) }),
    { success: "Fiscal vinculado.", onSuccess: () => setAdding(false) },
  );
  const openAdd = (userId = "") => { add.reset(); setForm({ user_id: userId, starts_on: todayIso(), ends_on: "" }); setAdding(true); };
  // Link do checklist de ativação: rola até esta seção e abre "Vincular fiscal".
  useEffect(() => {
    if (!openRequest) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    openAdd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);
  const companyFiscals = fiscals.data?.filter((u) => u.company_id === c.company.id) ?? [];
  const noFiscal = fiscals.isSuccess && companyFiscals.length === 0;
  const end = useAction((l: FiscalLink) => endContractFiscal(c.id, l.id, { ends_on: endDate }), { success: "Vínculo encerrado.", onSuccess: () => setEnding(null) });

  return (
    <section ref={sectionRef} id="fiscais" className="scroll-mt-20 rounded-[10px] border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Fiscais do contrato</h2>
        {ctx.canManage && (
          <Button variant="outline" className="min-h-11" onClick={() => openAdd()}>
            <UserPlus className="h-4 w-4" />Vincular fiscal
          </Button>
        )}
      </div>
      {c.fiscals.length === 0 ? <div className="mt-3"><EmptyBlock title="Nenhum fiscal vinculado." /></div> : (
        <ul className="mt-3 divide-y">
          {c.fiscals.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium text-foreground">{f.name}</p>
                <p className="text-sm text-muted-foreground">{f.email} · {fmtPeriod(f.starts_on, f.ends_on)}</p>
              </div>
              {ctx.canManage && (!f.ends_on || f.ends_on >= todayIso()) && (
                <Button variant="ghost" className="min-h-11" onClick={() => { end.reset(); setEndDate(todayIso()); setEnding(f); }}>Encerrar vínculo</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormDialog open={adding} onOpenChange={setAdding} title="Vincular fiscal" submitLabel="Vincular" pending={add.pending} onSubmit={() => void add.run()}>
        {noFiscal && (
          <div role="alert" className="space-y-3 rounded-md border border-danger/30 bg-danger-soft p-3">
            <p className="text-sm font-semibold text-danger">Esta empresa ainda não tem fiscal.</p>
            {ctx.isAdmin
              ? <Button type="button" className="min-h-11" onClick={() => { setAdding(false); setCreating(true); }}><UserPlus className="h-4 w-4" />Cadastrar fiscal</Button>
              : <p className="text-sm text-foreground">Peça à diretoria para cadastrar o fiscal de {c.company.name}.</p>}
          </div>
        )}
        <Field label="Fiscal" id="fiscal_user" error={add.fields["user_id"]} hint="Só aparecem fiscais da mesma empresa do contrato.">
          <NativeSelect id="fiscal_user" autoFocus value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">{fiscals.isLoading ? "Carregando…" : "Escolha o fiscal"}</option>
            {companyFiscals.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Início" id="fiscal_start" error={add.fields["starts_on"]}><DateInput id="fiscal_start" value={form.starts_on} onChange={(v) => setForm({ ...form, starts_on: v })} /></Field>
          <Field label="Fim (opcional)" id="fiscal_end" error={add.fields["ends_on"]}><DateInput id="fiscal_end" value={form.ends_on} onChange={(v) => setForm({ ...form, ends_on: v })} /></Field>
        </div>
        {add.error && Object.keys(add.fields).length === 0 && <FormError error={add.error} />}
      </FormDialog>

      <FormDialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)} title="Encerrar vínculo de fiscal"
        description={ending ? `${ending.name} deixa de acompanhar este contrato a partir da data escolhida.` : undefined}
        submitLabel="Encerrar vínculo" pending={end.pending} destructive onSubmit={() => ending && void end.run(ending)}>
        <Field label="Data final" id="fiscal_end_date" error={end.fields["ends_on"]}><DateInput id="fiscal_end_date" value={endDate} onChange={setEndDate} /></Field>
        {end.error && Object.keys(end.fields).length === 0 && <FormError error={end.error} />}
      </FormDialog>
      <UserForm open={creating} onOpenChange={setCreating} roles={["fiscal"]} title="Cadastrar fiscal"
        preset={{ role: "fiscal", company_id: c.company.id, company_name: c.company.name }}
        onCreated={(user, password) => setTemp({ user, password })} />
      <TempPasswordDialog data={temp} onClose={() => { const id = temp?.user.id; setTemp(null); openAdd(id ? String(id) : ""); }} />
    </section>
  );
}
