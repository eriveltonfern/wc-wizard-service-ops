import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHelp } from "@/components/layout/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Pencil, Trash2, UserCheck, UserPlus } from "lucide-react";
import { deleteCompany, getCompany, inactivateCompany, reactivateCompany } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { fmtPeriod } from "@/lib/format";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "@/components/people/CompanyForm";
import { FiscalPickerDialog } from "@/components/people/FiscalPickerDialog";
import { TempPasswordDialog, UserForm } from "@/components/people/UserForm";
import { ConfirmDialog, EmptyBlock, ErrorBlock, FormError, HistoryNotice, LoadingBlock, PendingButton, ReasonDialog, StatusBadge, useAction } from "@/components/contracts/kit";

export const Route = createFileRoute("/_app/empresas/$id")({
  head: () => ({
    meta: [
      { title: "Empresa · WCCheck 2.0" },
      { name: "description", content: "Dados da empresa contratante, contratos e fiscais." },
      { property: "og:title", content: "Empresa · WCCheck 2.0" },
      { property: "og:description", content: "Dados da empresa contratante, contratos e fiscais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["company", Number(id)], queryFn: () => getCompany(Number(id)), retry: false });
  const [editing, setEditing] = useState(false);
  const [inactivating, setInactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newFiscal, setNewFiscal] = useState(false);
  const [picker, setPicker] = useState(false);
  const [temp, setTemp] = useState<{ user: User; password: string } | null>(null);
  const inact = useAction((reason: string) => inactivateCompany(Number(id), { reason }), { success: "Empresa inativada." });
  const react = useAction(() => reactivateCompany(Number(id)), { success: "Empresa reativada." });
  const del = useAction(() => deleteCompany(Number(id)), { success: "Empresa excluída.", onSuccess: () => { setDeleting(false); void navigate({ to: "/empresas" }); } });

  const back = <Link to="/empresas" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Voltar para empresas</Link>;
  if (q.isLoading) return <div className="space-y-4">{back}<LoadingBlock label="Carregando empresa…" /></div>;
  if (q.isError || !q.data) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="space-y-4">{back}<ErrorBlock message={nf ? "Empresa não encontrada." : "Não foi possível carregar a empresa."} onRetry={nf ? undefined : () => void q.refetch()} /></div>;
  }
  const c = q.data;

  return (
    <div className="space-y-6">
      {back}
      <PageHelp>Dados da empresa, seus contratos e fiscais. Toda empresa precisa de um fiscal para que os contratos dela possam ser ativados. Inativar a empresa suspende os contratos ativos dela.</PageHelp>
      {c.fiscals_count === 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-danger/30 bg-danger-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger"><AlertTriangle className="h-5 w-5 shrink-0" />Esta empresa ainda não tem fiscal. Os contratos dela não podem ser ativados.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => setNewFiscal(true)}><UserPlus className="h-4 w-4" />Cadastrar fiscal</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setPicker(true)}><UserCheck className="h-4 w-4" />Adicionar já cadastrado</Button>
          </div>
        </div>
      )}
      <header className="rounded-[10px] border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold tracking-tight text-ink">{c.name}</h1><StatusBadge status={c.status} /></div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">CNPJ</dt><dd className="font-medium text-foreground">{c.document ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Contato</dt><dd className="font-medium text-foreground">{c.contact_name ?? "—"}{c.contact_phone ? ` · ${c.contact_phone}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Observações</dt><dd className="font-medium text-foreground">{c.notes ?? "—"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar</Button>
          {c.status === "active"
            ? <Button variant="outline" className="min-h-11" onClick={() => { inact.reset(); setInactivating(true); }}>Inativar</Button>
            : <PendingButton variant="outline" pending={react.pending} onClick={() => void react.run()}>Reativar</PendingButton>}
          <Button variant="outline" className="min-h-11 text-danger" onClick={() => { del.reset(); setDeleting(true); }}><Trash2 className="h-4 w-4" />Excluir</Button>
        </div>
        <div className="mt-3"><FormError error={react.error} /></div>
      </header>

      <section className="rounded-[10px] border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Contratos</h2>
        {c.contracts.length === 0 ? <div className="mt-3"><EmptyBlock title="Nenhum contrato desta empresa." /></div> : (
          <ul className="mt-2 divide-y">
            {c.contracts.map((ct) => (
              <li key={ct.id}>
                <Link to="/contratos/$id" params={{ id: String(ct.id) }} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 hover:text-primary">
                  <span><span className="font-mono text-xs text-muted-foreground">{ct.code}</span> <span className="font-medium">{ct.name}</span></span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">{fmtPeriod(ct.starts_on, ct.ends_on)}<StatusBadge status={ct.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[10px] border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Fiscais</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setPicker(true)}><UserCheck className="h-4 w-4" />Adicionar já cadastrado</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setNewFiscal(true)}><UserPlus className="h-4 w-4" />Novo fiscal</Button>
          </div>
        </div>
        {c.fiscals.length === 0 ? <div className="mt-3"><EmptyBlock title="Nenhum fiscal desta empresa." /></div> : (
          <ul className="mt-2 divide-y">
            {c.fiscals.map((f) => (
              <li key={f.id}>
                <Link to="/pessoas/$id" params={{ id: String(f.id) }} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-3 hover:text-primary">
                  <span><span className="font-medium">{f.name}</span> <span className="text-sm text-muted-foreground">{f.email}</span></span>
                  <StatusBadge status={f.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CompanyForm open={editing} onOpenChange={setEditing} company={c} />
      <UserForm open={newFiscal} onOpenChange={setNewFiscal} roles={["fiscal"]} preset={{ role: "fiscal", company_id: c.id, company_name: c.name }}
        onCreated={(user, password) => setTemp({ user, password })} />
      <FiscalPickerDialog open={picker} onOpenChange={setPicker} companyId={c.id} companyName={c.name} />
      <TempPasswordDialog data={temp} onClose={() => setTemp(null)} />
      <ReasonDialog open={inactivating} onOpenChange={setInactivating} title="Inativar empresa" submitLabel="Inativar" destructive
        description="Os contratos ativos desta empresa serão suspensos." error={inact.error} onConfirm={(r) => inact.run(r)} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Excluir empresa" description={`Excluir ${c.name}? Esta ação não pode ser desfeita.`}
        submitLabel="Excluir" pending={del.pending} error={del.error} onConfirm={() => void del.run()}>
        {del.error?.code === "has_history" && (
          <HistoryNotice>
            {c.status === "active"
              ? <Button type="button" variant="outline" className="min-h-11" onClick={() => { setDeleting(false); inact.reset(); setInactivating(true); }}>Inativar</Button>
              : <span className="text-muted-foreground">A empresa já está inativa.</span>}
          </HistoryNotice>
        )}
      </ConfirmDialog>
    </div>
  );
}
