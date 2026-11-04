import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { meQuery } from "@/lib/auth";
import { CheckCircle2 } from "lucide-react";
import { getContractActivation, getStats, listBathrooms, listCompanies, listContracts, listTickets } from "@/lib/endpoints";
import type { ActivationMissing } from "@/lib/types";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { AttentionList, AttentionRow, DataCard, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { GoalPills, complianceTone, metGoal, pct } from "@/components/reports/kit";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({
    meta: [
      { title: "Painel · WCCheck 2.0" },
      { name: "description", content: "Cumprimento das limpezas, pendências, banheiros abaixo da meta e o que precisa de atenção agora." },
      { property: "og:title", content: "Painel · WCCheck 2.0" },
      { property: "og:description", content: "Cumprimento das limpezas, pendências, banheiros abaixo da meta e o que precisa de atenção agora." },
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
  fiscal: "sem fiscal",
  company: "empresa inativa",
};

function PainelPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const isAdmin = me.role === "admin";
  const readOnly = me.role === "fiscal";
  const [period, setPeriod] = useState<"hoje" | "mes">("mes");
  const today = todayIso();
  const filter = period === "hoje" ? { from: today, to: today } : { month: today.slice(0, 7) };
  const stats = useQuery({ queryKey: ["stats", filter], queryFn: () => getStats(filter) });
  const todayStats = useQuery({ queryKey: ["stats", { from: today, to: today }], queryFn: () => getStats({ from: today, to: today }) });
  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: isAdmin });
  const noFiscal = (companies.data ?? []).filter((c) => c.status === "active" && c.fiscals_count === 0);
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const active = useQuery({ queryKey: ["bathrooms", "active-count"], queryFn: () => listBathrooms({ status: "active" }) });
  const urgent = useQuery({ queryKey: ["tickets", "urgent"], queryFn: () => listTickets({ status: "active", priority: "urgente" }) });
  const urgentRows = urgent.data ?? [];
  const all = contracts.data ?? [];
  const drafts = readOnly ? [] : all.filter((c) => c.status === "draft");
  const suspended = readOnly ? [] : all.filter((c) => c.status === "suspended");
  const activations = useQueries({
    queries: drafts.map((c) => ({ queryKey: ["contract", c.id, "activation"], queryFn: () => getContractActivation(c.id) })),
  });

  const t = stats.data?.totals;
  const td = todayStats.data?.totals;
  const below = (stats.data?.by_bathroom ?? []).filter((b) => b.expected > 0 && !metGoal(b.compliance));
  const num = (loading: boolean, error: boolean, v: ReactNode) => (loading ? "…" : error ? "—" : v ?? "—");
  const LIMIT = 8;
  type Row = { key: string; node: ReactNode };
  const rows: Row[] = [
    ...urgentRows.map((tk) => ({ key: `tk-${tk.id}`, node: (
      <AttentionRow key={`tk-${tk.id}`} to="/chamados" search={{ chamado: tk.id }} name={`Chamado urgente · ${tk.bathroom.name}`}
        detail={`${tk.description} · ${tk.company.name} · ${tk.contract.code}`}
        pills={<><Pill tone="danger">Urgente</Pill><Pill tone={tk.status === "open" ? "info" : "warning"}>{tk.status === "open" ? "Aberto" : "Em andamento"}</Pill></>} />) })),
    ...noFiscal.map((co) => ({ key: `co-${co.id}`, node: (
      <AttentionRow key={`co-${co.id}`} to="/empresas/$id" params={{ id: String(co.id) }} name={co.name}
        detail={`Empresa · ${co.contracts_count} contrato${co.contracts_count === 1 ? "" : "s"}`} pills={<Pill tone="danger">Sem fiscal</Pill>} />) })),
    ...below.map((b) => ({ key: `b-${b.bathroom.id}`, node: (
      <AttentionRow key={`b-${b.bathroom.id}`} to="/banheiros/$id" params={{ id: String(b.bathroom.id) }} name={b.bathroom.name}
        detail={`${b.location ? `${b.location} · ` : ""}${b.company.name} · ${b.contract.code}`}
        progress={{ value: (b.compliance ?? 0) * 100, tone: complianceTone(b.compliance) }} pills={<GoalPills t={b} />} />) })),
    ...drafts.map((c, i) => ({ key: `c-${c.id}`, node: (
      <AttentionRow key={c.id} to="/contratos/$id" params={{ id: String(c.id) }} name={c.name} detail={`${c.code} · ${c.company.name}`}
        pills={<><Pill tone="info">Rascunho</Pill>{activations[i]?.data?.missing.map((m) => missingPill[m] && <Pill key={m} tone="warning">{missingPill[m]}</Pill>)}</>} />) })),
    ...suspended.map((c) => ({ key: `s-${c.id}`, node: (
      <AttentionRow key={c.id} to="/contratos/$id" params={{ id: String(c.id) }} name={c.name} detail={`${c.code} · ${c.company.name}`} pills={<Pill tone="warning">Suspenso</Pill>} />) })),
  ];
  const periodLabel = period === "hoje" ? "de hoje" : "do mês";

  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        {readOnly ? "Os números mostram o cumprimento dos contratos que você acompanha. É só para leitura." : "Os números do topo mostram o cumprimento das limpezas."}{" "}
        Cumprimento = limpezas feitas ÷ limpezas previstas. Limpezas extras aparecem à parte e não entram no percentual. Use "Hoje" ou "Este mês" para trocar o período.
        Em "Precisa de atenção" ficam os chamados urgentes, as empresas sem fiscal, os banheiros abaixo da meta (95%) e os contratos parados.
      </PageHelp>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title={readOnly ? "Painel do contrato" : "Painel"} subtitle="O que precisa da sua atenção agora." />
        <div role="tablist" aria-label="Período" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
          {([["hoje", "Hoje"], ["mes", "Este mês"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
              className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", period === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>
      </div>

      <KpiGrid>
        <KpiCard label="Cumprimento geral" tone={complianceTone(t?.compliance)} value={num(stats.isLoading, stats.isError, pct(t?.compliance))}
          caption={t ? `${t.done} de ${t.expected} limpezas da meta ${periodLabel}` : " "} />
        <KpiCard label="Limpezas pendentes" tone={td?.late_pending ? "warning" : "info"} value={num(todayStats.isLoading, todayStats.isError, td?.pending)}
          caption={td ? `hoje · ${td.late_pending} atrasada${td.late_pending === 1 ? "" : "s"}` : " "} {...(readOnly ? {} : { to: "/pendencias" })} />
        <KpiCard label="Abaixo da meta" tone={below.length ? "danger" : "success"} value={num(stats.isLoading, stats.isError, below.length)}
          caption={`banheiros abaixo de 95% ${periodLabel}`} />
        <KpiCard label="Banheiros ativos" tone="neutral" value={num(active.isLoading, active.isError, active.data?.total)} caption="no seu escopo" to="/banheiros" />
      </KpiGrid>

      {stats.isLoading || contracts.isLoading ? <SkeletonBlock label="Carregando…" />
        : stats.isError || contracts.isError ? <ErrorState message="Não foi possível carregar o painel." onRetry={() => { void stats.refetch(); void contracts.refetch(); }} />
        : (
          <AttentionList title="Precisa de atenção" count={rows.length}
            empty={<p className="flex items-center justify-center gap-2 text-sm font-semibold text-success"><CheckCircle2 className="h-5 w-5" />Tudo em dia.</p>}
            footer={rows.length > LIMIT ? (readOnly ? `Mais ${rows.length - LIMIT} itens.` : <>Mais {rows.length - LIMIT} em <Link to="/pendencias" className="font-semibold text-primary hover:underline">Pendências</Link></>) : undefined}>
            {rows.slice(0, LIMIT).map((r) => r.node)}
          </AttentionList>
        )}

      {stats.data && (
        <DataCard title="Cumprimento por contrato" actions={<span className="text-sm text-muted-foreground">{period === "hoje" ? "Hoje" : "Este mês"}</span>}>
          {stats.data.by_contract.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum contrato ativo com limpezas no período.</p> : (
            <ul className="divide-y">
              {stats.data.by_contract.map((c) => (
                <AttentionRow key={c.contract.id} to="/contratos/$id" params={{ id: String(c.contract.id) }} name={c.contract.name}
                  detail={`${c.contract.code} · ${c.done} de ${c.expected}${c.extras ? ` · ${c.extras} extra${c.extras === 1 ? "" : "s"}` : ""}`}
                  progress={{ value: (c.compliance ?? 0) * 100, tone: complianceTone(c.compliance) }}
                  pills={<Pill tone={complianceTone(c.compliance)}>{pct(c.compliance)}</Pill>} />
              ))}
            </ul>
          )}
        </DataCard>
      )}
    </div>
  );
}
