import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BarChart3, ChevronRight, Download, History, Search as SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getStats } from "@/lib/endpoints";
import { fmtShort } from "@/lib/format";
import type { StatTotals } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { ClosingPanel, ComplianceKpis, PrintButton, complianceTone, metGoal, pct } from "@/components/reports/kit";
import { FilterBar, type FilterSearch, filterKeys, parseFilters, periodText, toStatsFilter, useFilterOptions } from "@/components/reports/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "geral" | "empresas" | "banheiros" | "pessoas" | "fechamento";
type Search = FilterSearch & { aba?: Tab | undefined };
const TABS: [Tab, string][] = [["geral", "Visão geral"], ["empresas", "Empresas e contratos"], ["banheiros", "Banheiros"], ["pessoas", "Funcionários"], ["fechamento", "Fechamento do mês"]];

export const Route = createFileRoute("/_app/relatorios")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = parseFilters(s);
    if (TABS.some(([k]) => k === s["aba"])) out.aba = s["aba"] as Tab;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Relatórios · WCCheck 2.0" },
      { name: "description", content: "Cumprimento por empresa, contrato, banheiro e funcionário, com filtros combinados e fechamento do mês." },
      { property: "og:title", content: "Relatórios · WCCheck 2.0" },
      { property: "og:description", content: "Cumprimento por empresa, contrato, banheiro e funcionário, com filtros combinados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/relatorios" });
  const set = (p: Partial<Search>) => void navigate({ search: { ...search, ...p }, replace: true });
  const tab = search.aba ?? "geral";
  const filter = toStatsFilter(search);
  const q = useQuery({ queryKey: ["stats", filter], queryFn: () => getStats(filter) });
  const o = useFilterOptions(search);
  const scopeText = [o.companies.find((c) => c.id === search.empresa)?.name, o.allContracts.find((c) => c.id === search.contrato)?.code].filter(Boolean).join(" · ") || "Todas as empresas";

  return (
    <div className="space-y-5">
      <div className="print:hidden"><PreviewBanner /></div>
      <div className="print:hidden">
        <PageHelp>
          1) Escolha o período e, se quiser, a empresa, o contrato, o banheiro ou o funcionário — os filtros se combinam. 2) Escolha a visão nas abas.
          Clique numa linha para aprofundar: a empresa vira filtro, depois o contrato, depois o banheiro. "Ver no histórico" abre as limpezas com os mesmos filtros.
          Os números são os mesmos do Painel e do Histórico.
        </PageHelp>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Relatórios" subtitle={`${periodText(search)} · ${scopeText}`} />
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button asChild variant="outline" className="min-h-10">
            <Link to="/historico" search={filterKeys(search)}><History className="h-4 w-4" />Ver no histórico</Link>
          </Button>
          <Button variant="outline" className="min-h-10" disabled title="Disponível quando os dados reais existirem"><Download className="h-4 w-4" />Baixar Excel</Button>
          <PrintButton />
        </div>
      </div>

      <FilterBar search={search} onChange={set} />

      <div role="tablist" aria-label="Visão do relatório" className="flex gap-1 overflow-x-auto rounded-lg bg-secondary p-1 print:hidden">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => set({ aba: k })}
            className={cn("min-h-10 shrink-0 rounded-md px-4 text-sm font-semibold", tab === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground hover:text-ink")}>{label}</button>
        ))}
      </div>

      {tab === "fechamento" ? (
        search.contrato ? <ClosingPanel contractId={search.contrato} />
          : <DataCard title="Escolha o contrato para fechar o mês">
              <ul className="divide-y">
                {o.contracts.filter((c) => c.status === "active" || c.status === "suspended").map((c) => (
                  <DrillRow key={c.id} onClick={() => set({ contrato: c.id })} title={`${c.code} · ${c.name}`} detail={c.company.name} />
                ))}
              </ul>
            </DataCard>
      ) : q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message={q.error.message || "Não foi possível carregar o relatório."} onRetry={() => void q.refetch()} />
        : q.data.totals.expected === 0 && q.data.totals.extras === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhuma limpeza prevista com estes filtros." description="Aumente o período ou tire algum filtro.">
            <Button variant="outline" onClick={() => set({ empresa: undefined, contrato: undefined, banheiro: undefined, pessoa: undefined, periodo: "30d" })}>Limpar filtros</Button>
          </EmptyState>
        ) : tab === "geral" ? (
          <>
            <ComplianceKpis t={q.data.totals} />
            <DataCard title="Limpezas por dia">
              <div className="h-64 p-4">
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
            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard title="Piores banheiros" actions={<Button variant="link" className="h-auto p-0" onClick={() => set({ aba: "banheiros" })}>Ver todos</Button>}>
                <ul className="divide-y">
                  {q.data.by_bathroom.filter((b) => b.expected > 0).slice(0, 5).map((b) => (
                    <DrillRow key={b.bathroom.id} onClick={() => set({ banheiro: b.bathroom.id, contrato: b.contract.id })} title={b.bathroom.name}
                      detail={`${b.company.name} · ${b.contract.code} · ${b.done} de ${b.expected}`} t={b} />
                  ))}
                </ul>
              </DataCard>
              <DataCard title={search.empresa ? "Por contrato" : "Por empresa"} actions={<Button variant="link" className="h-auto p-0" onClick={() => set({ aba: "empresas" })}>Detalhar</Button>}>
                <ul className="divide-y">
                  {search.empresa
                    ? q.data.by_contract.map((c) => <DrillRow key={c.contract.id} onClick={() => set({ contrato: c.contract.id })} title={`${c.contract.code} · ${c.contract.name}`} detail={`${c.done} de ${c.expected}`} t={c} />)
                    : q.data.by_company.map((c) => <DrillRow key={c.company.id} onClick={() => set({ empresa: c.company.id })} title={c.company.name} detail={`${c.done} de ${c.expected}`} t={c} />)}
                </ul>
              </DataCard>
            </div>
          </>
        ) : tab === "empresas" ? (
          <div className="space-y-4">
            {!search.empresa && (
              <SortTable title="Por empresa" rows={q.data.by_company.map((c) => ({ key: c.company.id, name: c.company.name, sub: "", t: c, onClick: () => set({ empresa: c.company.id }) }))} />
            )}
            <SortTable title="Por contrato" rows={q.data.by_contract.map((c) => ({
              key: c.contract.id, name: `${c.contract.code} · ${c.contract.name}`, sub: o.allContracts.find((x) => x.id === c.contract.id)?.company.name ?? "",
              t: c, onClick: () => set({ contrato: c.contract.id, aba: "banheiros" }),
            }))} />
          </div>
        ) : tab === "banheiros" ? (
          <SortTable title="Banheiros" searchable rows={q.data.by_bathroom.map((b) => ({
            key: b.bathroom.id, name: b.bathroom.name, sub: `${b.location ? `${b.location} · ` : ""}${b.company.name} · ${b.contract.code}`, t: b,
            to: { banheiro: b.bathroom.id, contrato: b.contract.id },
          }))} historySearch={filterKeys(search)} />
        ) : (
          <PeopleTable rows={q.data.by_person} onPick={(id) => set({ pessoa: id })} selected={search.pessoa} historySearch={filterKeys(search)} />
        )}
    </div>
  );
}

function DrillRow({ title, detail, t, onClick }: { title: string; detail?: string; t?: StatTotals; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-ink">{title}</span>
          {detail && <span className="block truncate text-muted-foreground">{detail}</span>}
          {t && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary"><span className={cn("block h-full rounded-full", barTone(t.compliance))} style={{ width: `${Math.round((t.compliance ?? 0) * 100)}%` }} /></span>}
        </span>
        {t && <Pill tone={complianceTone(t.compliance)}>{pct(t.compliance)}</Pill>}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}
const barTone = (v: number | null) => ({ danger: "bg-danger", warning: "bg-warning", success: "bg-success", neutral: "bg-muted-foreground", info: "bg-primary" })[complianceTone(v)];

type SortKey = "name" | "expected" | "done" | "not_done" | "extras" | "compliance";
type Row = { key: number; name: string; sub: string; t: StatTotals; onClick?: () => void; to?: { banheiro: number; contrato: number } };

function SortTable({ title, rows, searchable, historySearch }: { title: string; rows: Row[]; searchable?: boolean; historySearch?: FilterSearch }) {
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "compliance", asc: true });
  const [text, setText] = useState("");
  const [onlyBelow, setOnlyBelow] = useState(false);
  const norm = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const list = useMemo(() => {
    const out = rows.filter((r) => (!text || norm(`${r.name} ${r.sub}`).includes(norm(text))) && (!onlyBelow || (r.t.expected > 0 && !metGoal(r.t.compliance))));
    const val = (r: Row) => (sort.k === "name" ? r.name : (r.t[sort.k] ?? -1));
    return out.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : (x as number) - (y as number); return sort.asc ? c : -c; });
  }, [rows, text, onlyBelow, sort]);
  const below = rows.filter((r) => r.t.expected > 0 && !metGoal(r.t.compliance)).length;
  const Th = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={cn("px-4 py-2", right && "text-right")} aria-sort={sort.k === k ? (sort.asc ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 font-semibold uppercase hover:text-ink" onClick={() => setSort({ k, asc: sort.k === k ? !sort.asc : k === "name" || k === "compliance" })}>
        {children}{sort.k === k && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  return (
    <DataCard title={title} actions={<span className="text-sm tabular-nums text-muted-foreground">{list.length} de {rows.length}</span>}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 print:hidden">
        {searchable && (
          <div className="relative min-w-56 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Buscar na lista" placeholder="Buscar banheiro, local ou empresa" className="pl-9" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <button type="button" aria-pressed={onlyBelow} onClick={() => setOnlyBelow(!onlyBelow)}
          className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold", onlyBelow ? "border-pending bg-pending-soft text-pending" : "text-muted-foreground hover:bg-secondary")}>
          Só abaixo da meta ({below})
        </button>
      </div>
      {list.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada encontrado com esta busca.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr><Th k="name">Nome</Th><Th k="expected" right>Previstas</Th><Th k="done" right>Feitas</Th><Th k="not_done" right>Não feitas</Th><Th k="extras" right>Extras</Th><Th k="compliance" right>Cumprimento</Th><th className="w-10 print:hidden" /></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r) => (
                <tr key={r.key} className={cn((r.onClick || r.to) && "cursor-pointer hover:bg-secondary/60")} onClick={r.onClick}>
                  <td className="px-4 py-2.5">
                    {r.to ? <Link to="/historico" search={{ ...historySearch, ...r.to }} className="font-bold text-ink hover:underline">{r.name}</Link> : <span className="font-bold text-ink">{r.name}</span>}
                    {r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.t.expected}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.t.done}</td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", r.t.not_done > 0 && "font-semibold text-danger")}>{r.t.not_done}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{r.t.extras}</td>
                  <td className="px-4 py-2.5 text-right"><Pill tone={complianceTone(r.t.compliance)}>{pct(r.t.compliance)}</Pill></td>
                  <td className="px-2 text-muted-foreground print:hidden">{(r.onClick || r.to) && <ChevronRight className="h-4 w-4" aria-hidden />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Meta: 95%. Extras não entram no cumprimento. {searchable ? "Clique no banheiro para ver as limpezas dele." : "Clique na linha para aprofundar."}</p>
    </DataCard>
  );
}

function PeopleTable({ rows, onPick, selected, historySearch }: {
  rows: { user: { id: number; name: string }; teams: string[]; done: number; on_time: number }[]; onPick: (id: number) => void; selected?: number | undefined; historySearch: FilterSearch;
}) {
  const max = Math.max(1, ...rows.map((r) => r.done));
  if (rows.length === 0) return <EmptyState icon={BarChart3} title="Nenhuma limpeza de funcionário com estes filtros." />;
  return (
    <DataCard title="Funcionários" actions={<span className="text-sm tabular-nums text-muted-foreground">{rows.length}</span>}>
      <ul className="divide-y">
        {rows.map((p) => (
          <li key={p.user.id} className={cn("flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center", selected === p.user.id && "bg-info-soft")}>
            <button type="button" onClick={() => onPick(p.user.id)} className="min-w-0 flex-1 text-left">
              <span className="block font-bold text-ink hover:underline">{p.user.name}</span>
              <span className="block text-muted-foreground">{p.teams.join(", ") || "—"}</span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-primary" style={{ width: `${(p.done / max) * 100}%` }} /></span>
            </button>
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone="info">{p.done} feita{p.done === 1 ? "" : "s"}</Pill>
              <Pill tone={complianceTone(p.done ? p.on_time / p.done : null)}>{pct(p.done ? p.on_time / p.done : null)} no prazo</Pill>
              <Button asChild variant="outline" size="sm" className="print:hidden"><Link to="/historico" search={{ ...historySearch, pessoa: p.user.id }}>Limpezas</Link></Button>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Conta só as limpezas de tarefas (extras ficam fora). Clique no nome para filtrar o relatório por esse funcionário.</p>
    </DataCard>
  );
}
