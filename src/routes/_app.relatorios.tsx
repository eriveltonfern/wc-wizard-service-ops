import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getStats, listContracts } from "@/lib/endpoints";
import { fmtShort, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { AttentionRow, DataCard, EmptyState, ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { NativeSelect } from "@/components/contracts/kit";
import { ClosingPanel, ComplianceKpis, GoalPills, PrintButton, complianceTone, metGoal, monthLabel, pct } from "@/components/reports/kit";
import { Button } from "@/components/ui/button";

type Tab = "cumprimento" | "abaixo" | "pessoas" | "fechamento";
type Search = { mes?: string | undefined; contrato?: number | undefined; aba?: Tab | undefined };
const TABS: [Tab, string][] = [["cumprimento", "Cumprimento do contrato"], ["abaixo", "Banheiros abaixo da meta"], ["pessoas", "Por pessoa e equipe"], ["fechamento", "Fechamento do mês"]];

export const Route = createFileRoute("/_app/relatorios")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (/^\d{4}-\d{2}$/.test(String(s["mes"] ?? ""))) out.mes = String(s["mes"]);
    const c = Number(s["contrato"]); if (c > 0) out.contrato = c;
    if (TABS.some(([k]) => k === s["aba"])) out.aba = s["aba"] as Tab;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Relatórios · WCCheck 2.0" },
      { name: "description", content: "Cumprimento do contrato por mês, banheiros abaixo da meta, desempenho por pessoa e fechamento do mês." },
      { property: "og:title", content: "Relatórios · WCCheck 2.0" },
      { property: "og:description", content: "Cumprimento do contrato, banheiros abaixo da meta e fechamento do mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function monthOptions() {
  const now = new Date();
  return [0, 1].map((back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
}

function RelatoriosPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/relatorios" });
  const set = (p: Partial<Search>) => void navigate({ search: { ...search, ...p }, replace: true });
  const month = search.mes ?? todayIso().slice(0, 7);
  const tab = search.aba ?? "cumprimento";
  const filter = { month, contract_id: search.contrato };
  const q = useQuery({ queryKey: ["stats", filter], queryFn: () => getStats(filter) });
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const contractName = contracts.data?.find((c) => c.id === search.contrato);

  return (
    <div className="space-y-6">
      <div className="print:hidden"><PreviewBanner /></div>
      <div className="print:hidden">
        <PageHelp>
          Escolha o mês e o contrato. "Cumprimento do contrato" mostra limpezas feitas ÷ previstas, dia a dia e por banheiro. "Banheiros abaixo da meta" lista
          quem ficou abaixo de 95% e o que faltou. "Por pessoa e equipe" mostra quem fez as limpezas. Em "Fechamento do mês" o gestor fecha o mês do contrato.
          Os números são os mesmos do Painel e do Histórico.
        </PageHelp>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Relatórios" subtitle={`${monthLabel(month)} · ${contractName ? `${contractName.code} ${contractName.name}` : "Todos os contratos"}`} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <span className="flex flex-col items-end">
            <Button variant="outline" className="min-h-10" disabled><Download className="h-4 w-4" />Baixar Excel</Button>
            <span className="text-xs text-muted-foreground">Disponível quando os dados reais existirem</span>
          </span>
          <PrintButton />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <NativeSelect aria-label="Mês" value={month} onChange={(e) => set({ mes: e.target.value })}>
          {monthOptions().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
      </div>
      <div role="tablist" aria-label="Relatório" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1 print:hidden">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => set({ aba: k })}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", tab === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Os dados de exemplo cobrem os últimos 30 dias; dias anteriores não entram na conta.</p>

      {tab === "fechamento" ? (
        search.contrato ? <ClosingPanel contractId={search.contrato} />
          : <DataCard title="Fechamento por contrato">
              <ul className="divide-y">
                {(contracts.data ?? []).filter((c) => c.status === "active" || c.status === "suspended").map((c) => (
                  <AttentionRow key={c.id} to="/relatorios" search={{ ...search, contrato: c.id }} name={c.name} detail={c.code} pills={<Pill tone="info">Ver fechamento</Pill>} />
                ))}
              </ul>
            </DataCard>
      ) : q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar o relatório." onRetry={() => void q.refetch()} />
        : q.data.totals.expected === 0 && q.data.totals.extras === 0 ? <EmptyState icon={BarChart3} title="Nenhuma limpeza prevista neste mês." description="Escolha outro mês ou contrato." />
        : tab === "cumprimento" ? (
          <>
            <ComplianceKpis t={q.data.totals} />
            <DataCard title="Limpezas por dia">
              <div className="h-72 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data.by_day.map((d) => ({ dia: fmtShort(d.date), Feitas: d.done, "Não feitas": d.not_done, Extras: d.extras }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Feitas" stackId="a" fill="var(--success)" />
                    <Bar dataKey="Não feitas" stackId="a" fill="var(--danger)" />
                    <Bar dataKey="Extras" fill="var(--neutral)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DataCard>
            <DataCard title="Por banheiro">
              <ul className="divide-y">
                {q.data.by_bathroom.map((b) => (
                  <AttentionRow key={b.bathroom.id} name={b.bathroom.name} detail={`${b.contract.code} · ${b.done} de ${b.expected}`}
                    progress={{ value: (b.compliance ?? 0) * 100, tone: complianceTone(b.compliance) }}
                    pills={<><Pill tone={complianceTone(b.compliance)}>{pct(b.compliance)}</Pill>{metGoal(b.compliance) ? <Pill tone="success">Meta atingida</Pill> : <Pill tone="warning">Não atingida</Pill>}</>} />
                ))}
              </ul>
            </DataCard>
          </>
        ) : tab === "abaixo" ? (() => {
          const below = q.data.by_bathroom.filter((b) => b.expected > 0 && !metGoal(b.compliance));
          return below.length === 0 ? <EmptyState icon={BarChart3} title="Todos os banheiros atingiram a meta." /> : (
            <DataCard title="Banheiros abaixo da meta (95%)" actions={<span className="text-sm tabular-nums text-muted-foreground">{below.length}</span>}>
              <ol className="divide-y">
                {below.map((b, i) => (
                  <AttentionRow key={b.bathroom.id} to="/banheiros/$id" params={{ id: String(b.bathroom.id) }} name={`${i + 1}. ${b.bathroom.name}`}
                    detail={`${b.contract.code} · faltaram ${b.expected - b.done} de ${b.expected}`}
                    progress={{ value: (b.compliance ?? 0) * 100, tone: complianceTone(b.compliance) }} pills={<GoalPills t={b} />} />
                ))}
              </ol>
            </DataCard>
          );
        })() : (
          <DataCard title="Por pessoa e equipe">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">Pessoa</th><th className="px-4 py-2">Equipe</th><th className="px-4 py-2 text-right">Limpezas feitas</th><th className="px-4 py-2 text-right">% no prazo</th></tr>
              </thead>
              <tbody className="divide-y">
                {q.data.by_person.map((p) => (
                  <tr key={p.user.id}>
                    <td className="px-4 py-2.5 font-semibold text-ink">{p.user.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.teams.join(", ") || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.done}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(p.done ? p.on_time / p.done : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Extras não entram nesta conta.</p>
          </DataCard>
        )}
    </div>
  );
}
