import { createFileRoute } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { getContractActivation, listBathrooms, listContracts } from "@/lib/endpoints";
import type { ActivationMissing } from "@/lib/types";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { AttentionList, AttentionRow, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({
    meta: [
      { title: "Painel · WCCheck 2.0" },
      { name: "description", content: "Contratos ativos, rascunhos, banheiros e equipes, com o que precisa de atenção agora." },
      { property: "og:title", content: "Painel · WCCheck 2.0" },
      { property: "og:description", content: "Contratos ativos, rascunhos, banheiros e equipes, com o que precisa de atenção agora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelPage,
});

const missingPill: Partial<Record<ActivationMissing, string>> = {
  manager: "sem gestor",
  bathroom: "sem banheiro",
  cleaning_team: "sem equipe de limpeza",
  company: "empresa inativa",
};

function PainelPage() {
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const active = useQuery({ queryKey: ["bathrooms", "active-count"], queryFn: () => listBathrooms({ status: "active" }) });
  const inactive = useQuery({ queryKey: ["bathrooms", "inactive-count"], queryFn: () => listBathrooms({ status: "inactive" }) });

  const all = contracts.data ?? [];
  const drafts = all.filter((c) => c.status === "draft");
  const suspended = all.filter((c) => c.status === "suspended");
  const activations = useQueries({
    queries: drafts.map((c) => ({ queryKey: ["contract", c.id, "activation"], queryFn: () => getContractActivation(c.id) })),
  });

  const num = (loading: boolean, error: boolean, v: number | undefined) => (loading ? "…" : error ? "—" : v ?? "—");
  const teams = all.reduce((n, c) => n + c.counts.teams, 0);
  const inactiveN = inactive.data?.total ?? 0;
  const attentionCount = drafts.length + suspended.length;

  return (
    <div className="space-y-6">
      <PageHelp>
        Os números do topo resumem os contratos, banheiros e equipes que você acompanha. Em "Precisa de atenção" aparecem os contratos em
        rascunho (com o que falta para ativar) e os suspensos. Clique numa linha para abrir o contrato.
      </PageHelp>
      <PageHeader title="Painel" subtitle="O que precisa da sua atenção agora nos contratos." />

      <KpiGrid>
        <KpiCard label="Contratos ativos" tone="info" value={num(contracts.isLoading, contracts.isError, all.filter((c) => c.status === "active").length)}
          caption="em operação" to="/contratos" search={{ status: "active" }} />
        <KpiCard label="Em rascunho" tone="warning" value={num(contracts.isLoading, contracts.isError, drafts.length)}
          caption="aguardando ativação" to="/contratos" search={{ status: "draft" }} />
        <KpiCard label="Banheiros ativos" tone="neutral" value={num(active.isLoading, active.isError, active.data?.total)}
          caption={inactive.isLoading ? " " : `${inactiveN} inativo${inactiveN === 1 ? "" : "s"}`} to="/banheiros" />
        <KpiCard label="Equipes" tone="neutral" value={num(contracts.isLoading, contracts.isError, teams)} caption="nos contratos" />
      </KpiGrid>

      {contracts.isLoading ? <SkeletonBlock label="Carregando contratos…" />
        : contracts.isError ? <ErrorState message="Não foi possível carregar os contratos." onRetry={() => void contracts.refetch()} />
        : (
          <AttentionList title="Precisa de atenção" count={attentionCount}
            empty={<p className="flex items-center justify-center gap-2 text-sm font-semibold text-success"><CheckCircle2 className="h-5 w-5" />Tudo em dia.</p>}>
            {drafts.map((c, i) => {
              const act = activations[i]?.data;
              return (
                <AttentionRow key={c.id} to="/contratos/$id" params={{ id: String(c.id) }} name={c.name} detail={`${c.code} · ${c.company.name}`}
                  pills={<>
                    <Pill tone="info">Rascunho</Pill>
                    {act?.missing.map((m) => missingPill[m] && <Pill key={m} tone="warning">{missingPill[m]}</Pill>)}
                  </>} />
              );
            })}
            {suspended.map((c) => (
              <AttentionRow key={c.id} to="/contratos/$id" params={{ id: String(c.id) }} name={c.name} detail={`${c.code} · ${c.company.name}`}
                pills={<Pill tone="warning">Suspenso</Pill>} />
            ))}
          </AttentionList>
        )}
    </div>
  );
}
