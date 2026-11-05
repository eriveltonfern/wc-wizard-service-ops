import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHelp } from "@/components/layout/PageHeader";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getContract } from "@/lib/endpoints";
import { ApiError } from "@/lib/api";
import { canManageContracts, isAdminRole, meQuery } from "@/lib/auth";
import { fmtPeriod } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBlock, LoadingBlock, StatusBadge } from "@/components/contracts/kit";
import { OverviewTab } from "@/components/contracts/OverviewTab";
import { BathroomsTab } from "@/components/contracts/BathroomsTab";
import { TeamsTab } from "@/components/contracts/TeamsTab";
import { RulesTab } from "@/components/contracts/RulesTab";
import type { ContractCtx, ContractTab } from "@/components/contracts/ctx";
import { PreviewBanner } from "@/components/field/kit";
import { ClosingPanel, PrintButton } from "@/components/reports/kit";
import { isModuleOn } from "@/lib/modules";

const TABS: ContractTab[] = ["geral", "banheiros", "equipes", "regras", "relatorio"];

export const Route = createFileRoute("/_app/contratos/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: ContractTab } =>
    TABS.includes(s["tab"] as ContractTab) ? { tab: s["tab"] as ContractTab } : {},
  head: () => ({
    meta: [
      { title: "Contrato · WCCheck 2.0" },
      { name: "description", content: "Dados, banheiros, equipes e regras do contrato." },
      { property: "og:title", content: "Contrato · WCCheck 2.0" },
      { property: "og:description", content: "Dados, banheiros, equipes e regras do contrato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractPage,
});


function ContractPage() {
  const { id } = Route.useParams();
  const { tab = "geral" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useSuspenseQuery(meQuery);
  const q = useQuery({ queryKey: ["contract", Number(id)], queryFn: () => getContract(Number(id)), retry: false });
  const ctx: ContractCtx = {
    canManage: canManageContracts(me.role), isAdmin: isAdminRole(me.role),
    goTab: (t) => void navigate({ search: { tab: t } }),
  };

  const back = (
    <Link to="/contratos" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" />Voltar para contratos
    </Link>
  );

  if (q.isLoading) return <div className="space-y-4">{back}<LoadingBlock label="Carregando contrato…" /></div>;
  if (q.isError || !q.data) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        <ErrorBlock message={nf ? "Contrato não encontrado." : "Não foi possível carregar o contrato."} onRetry={nf ? undefined : () => void q.refetch()} />
      </div>
    );
  }
  const c = q.data;

  return (
    <div className="space-y-6">
      {back}
      <PageHelp>Use as abas para ver a visão geral, os banheiros, as equipes e as regras do contrato. Um rascunho só pode ser ativado quando todas as pendências estiverem resolvidas.</PageHelp>
      <header className="rounded-[10px] border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-muted-foreground">{c.code}</span>
          <StatusBadge status={c.status} />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{c.name}</h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Empresa</dt><dd className="font-medium text-foreground">{c.company.name}</dd></div>
          <div><dt className="text-muted-foreground">Gestor</dt><dd className="font-medium text-foreground">{c.manager?.name ?? "Não definido"}</dd></div>
          <div><dt className="text-muted-foreground">Período</dt><dd className="font-medium text-foreground">{fmtPeriod(c.starts_on, c.ends_on)}</dd></div>
        </dl>
      </header>

      <Tabs value={tab} onValueChange={(v) => ctx.goTab(v as ContractTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-grid sm:grid-cols-5 sm:w-auto">
          <TabsTrigger value="geral" className="min-h-10">Visão geral</TabsTrigger>
          <TabsTrigger value="banheiros" className="min-h-10">Banheiros</TabsTrigger>
          <TabsTrigger value="equipes" className="min-h-10">Equipes</TabsTrigger>
          <TabsTrigger value="regras" className="min-h-10">Regras</TabsTrigger>
          {isModuleOn("fechamento") && <TabsTrigger value="relatorio" className="min-h-10">Relatório</TabsTrigger>}
        </TabsList>
        <TabsContent value="geral" className="mt-4"><OverviewTab contract={c} ctx={ctx} /></TabsContent>
        <TabsContent value="banheiros" className="mt-4"><BathroomsTab contract={c} ctx={ctx} /></TabsContent>
        <TabsContent value="equipes" className="mt-4"><TeamsTab contract={c} ctx={ctx} /></TabsContent>
        <TabsContent value="regras" className="mt-4"><RulesTab contract={c} ctx={ctx} /></TabsContent>
        {isModuleOn("fechamento") && <TabsContent value="relatorio" className="mt-4 space-y-4">
          <PreviewBanner />
          <div className="flex justify-end"><PrintButton /></div>
          <ClosingPanel contractId={c.id} />
        </TabsContent>}
      </Tabs>
    </div>
  );
}
