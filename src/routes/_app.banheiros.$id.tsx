import { useState } from "react";
import { PageHelp } from "@/components/layout/PageHeader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRightLeft, Printer, Trash2 } from "lucide-react";
import { CleanersCard, TransferDialog } from "@/components/bathrooms/manage";
import { getBathroom, getContract, inactivateBathroom, reactivateBathroom } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { canManageContracts, meQuery } from "@/lib/auth";
import { bathroomKindLabel, fmtPeriod, hasOwnPlan, planLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { QrSvg } from "@/components/QrSvg";
import { ErrorBlock, FormError, LoadingBlock, PendingButton, StatusBadge, useAction } from "@/components/contracts/kit";
import { BathroomForm, DeleteBathroom, PeriodsDialog, RegenerateQr } from "@/components/contracts/BathroomsTab";

export const Route = createFileRoute("/_app/banheiros/$id")({
  head: () => ({
    meta: [
      { title: "Banheiro · WCCheck 2.0" },
      { name: "description", content: "Dados, QR, interdições e ações de um banheiro." },
      { property: "og:title", content: "Banheiro · WCCheck 2.0" },
      { property: "og:description", content: "Dados, QR, interdições e ações de um banheiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BathroomPage,
});

type Dlg = "edit" | "qr" | "periods" | "delete" | "transfer" | null;

function BathroomPage() {
  const { id } = Route.useParams();
  const bid = Number(id);
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(meQuery);
  const canManage = canManageContracts(me.role);
  const q = useQuery({ queryKey: ["bathroom", bid], queryFn: () => getBathroom(bid), retry: false });
  const [dlg, setDlg] = useState<Dlg>(null);
  const contract = useQuery({ queryKey: ["contract", q.data?.contract_id], queryFn: () => getContract(q.data!.contract_id), enabled: !!q.data });
  const toggle = useAction(() => (q.data!.status === "active" ? inactivateBathroom : reactivateBathroom)(bid), { success: "Situação do banheiro atualizada." });

  const back = <Link to="/banheiros" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" />Voltar para banheiros</Link>;
  if (q.isLoading) return <div className="space-y-4">{back}<LoadingBlock label="Carregando banheiro…" /></div>;
  if (q.isError || !q.data) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return <div className="space-y-4">{back}<ErrorBlock message={nf ? "Banheiro não encontrado." : "Não foi possível carregar o banheiro."} onRetry={nf ? undefined : () => void q.refetch()} /></div>;
  }
  const b = q.data;
  const url = `${window.location.origin}/q/${b.qr_token}`;
  const close = () => setDlg(null);

  return (
    <div className="space-y-5">
      {back}
      <PageHelp>Dados do banheiro, QR atual e interdições. O QR serve para os usuários avaliarem o banheiro. Gerar novo QR faz a etiqueta antiga parar de funcionar. "Transferir" passa o banheiro para outro contrato mantendo o mesmo QR e o histórico.</PageHelp>
      <header className="rounded-[10px] border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{b.name}</h1>
          <StatusBadge status={b.status} />
        </div>
        <p className="mt-1 text-muted-foreground">
          {me.role === "admin"
            ? <Link to="/empresas/$id" params={{ id: String(b.company.id) }} className="text-primary hover:underline">{b.company.name}</Link>
            : <span className="font-medium text-foreground">{b.company.name}</span>}
          {" · "}
          <Link to="/contratos/$id" params={{ id: String(b.contract.id) }} search={{ tab: "banheiros" }} className="text-primary hover:underline">{b.contract.code} {b.contract.name}</Link>
        </p>
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setDlg("edit")}>Editar</Button>
            <PendingButton variant="outline" pending={toggle.pending} onClick={() => void toggle.run()}>{b.status === "active" ? "Inativar" : "Reativar"}</PendingButton>
            <Button variant="outline" className="min-h-11" onClick={() => setDlg("qr")}>Gerar novo QR</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setDlg("periods")}>Interdições</Button>
            {b.status === "active" && <Button asChild variant="outline" className="min-h-11"><Link to="/etiquetas" search={{ contrato: b.contract_id, banheiro: b.id }}><Printer className="h-4 w-4" />Imprimir etiqueta</Link></Button>}
            <Button variant="outline" className="min-h-11" onClick={() => setDlg("transfer")}><ArrowRightLeft className="h-4 w-4" />Transferir</Button>
            <Button variant="outline" className="min-h-11 text-danger" onClick={() => setDlg("delete")}><Trash2 className="h-4 w-4" />Excluir</Button>
          </div>
        )}
        <div className="mt-3"><FormError error={toggle.error} /></div>
      </header>

      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <section className="rounded-[10px] border bg-card p-5">
          <h2 className="text-lg font-semibold text-foreground">Dados</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Item k="Local" v={b.location?.name ?? "—"} />
            <Item k="Tipo" v={bathroomKindLabel[b.kind] ?? b.kind} />
            <Item k="Andar" v={b.floor ?? "—"} />
            <Item k="Plano de limpeza" v={hasOwnPlan(b) ? planLabel(b.effective_plan) : `Padrão do contrato (${planLabel(b.effective_plan)})`} />
            {b.notes && <div className="sm:col-span-2"><Item k="Observações" v={b.notes} /></div>}
          </dl>
        </section>
        <section className="rounded-[10px] border bg-card p-5 text-center">
          <h2 className="text-lg font-semibold text-foreground">QR atual</h2>
          <QrSvg value={url} label={`QR de ${b.name}`} className="mx-auto mt-3 h-44 w-44" />
          <p className="mt-2 break-all text-xs text-muted-foreground">{url.replace(/^https?:\/\//, "")}</p>
        </section>
      </div>

      {contract.data?.rules.cleaning_access === "assigned" && <CleanersCard bathroomId={b.id} canManage={canManage} />}

      <section className="rounded-[10px] border bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Interdições</h2>
        {b.status_periods.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma interdição registrada.</p> : (
          <ul className="mt-2 divide-y">
            {b.status_periods.map((p) => <li key={p.id} className="py-2 text-sm"><span className="font-medium">{fmtPeriod(p.starts_on, p.ends_on)}</span><span className="text-muted-foreground"> · {p.reason}</span></li>)}
          </ul>
        )}
      </section>

      {dlg === "edit" && (contract.data ? <BathroomForm contract={contract.data} bathroom={b} onClose={close} /> : null)}
      {dlg === "transfer" && <TransferDialog ids={[b.id]} currentContractIds={[b.contract_id]} onClose={close} />}
      {dlg === "qr" && <RegenerateQr b={b} onClose={close} />}
      {dlg === "periods" && <PeriodsDialog b={b} onClose={close} />}
      {dlg === "delete" && <DeleteBathroom b={b} onClose={close} onDeleted={() => void navigate({ to: "/banheiros" })} />}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="text-foreground">{v}</dd></div>;
}
