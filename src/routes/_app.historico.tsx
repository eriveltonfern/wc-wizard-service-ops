import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, History, X } from "lucide-react";
import { listAudit, listCleaningHistory } from "@/lib/endpoints";
import { fmtDate } from "@/lib/format";
import type { HistorySituation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, fmtTime, isoDay } from "@/components/field/kit";
import { CleaningDetail, MarkPills } from "@/components/field/CleaningDetail";
import { NativeSelect } from "@/components/contracts/kit";
import { fmtDateTime } from "@/components/tickets/kit";
import { pct } from "@/components/reports/kit";
import { Button } from "@/components/ui/button";
import { FilterBar, type FilterSearch, filterKeys, parseFilters, toStatsFilter } from "@/components/reports/filters";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type Search = FilterSearch & {
  aba?: "alteracoes" | undefined; situacao?: HistorySituation | undefined; tipo?: string | undefined; limpeza?: number | undefined;
};
const SITUATIONS: [HistorySituation, string][] = [["on_time", "No prazo"], ["late", "Atrasada"], ["extra", "Extra"], ["cancelled", "Cancelada"]];
const TYPES: [string, string][] = [["contract", "Contrato"], ["bathroom", "Banheiro"], ["team", "Equipe"], ["user", "Pessoa"], ["company", "Empresa"]];

export const Route = createFileRoute("/_app/historico")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = parseFilters(s);
    if (s["aba"] === "alteracoes") out.aba = "alteracoes";
    const l = Number(s["limpeza"]); if (l > 0) out.limpeza = l;
    if (SITUATIONS.some(([k]) => k === s["situacao"])) out.situacao = s["situacao"] as HistorySituation;
    if (TYPES.some(([k]) => k === s["tipo"])) out.tipo = s["tipo"] as string;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Histórico · WCCheck 2.0" },
      { name: "description", content: "Limpezas feitas por período, contrato, banheiro e pessoa, e quem alterou cada cadastro." },
      { property: "og:title", content: "Histórico · WCCheck 2.0" },
      { property: "og:description", content: "Limpezas feitas por período e alterações nos cadastros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoPage,
});

function Tabs({ value, onChange }: { value: string; onChange: (v: "alteracoes" | undefined) => void }) {
  return (
    <div role="tablist" aria-label="Ver" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
      {([[undefined, "Limpezas"], ["alteracoes", "Alterações"]] as const).map(([k, label]) => (
        <button key={label} role="tab" aria-selected={value === (k ?? "")} onClick={() => onChange(k)}
          className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", value === (k ?? "") ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>{label}</button>
      ))}
    </div>
  );
}

function HistoricoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/historico" });
  const set = (p: Partial<Search>) => void navigate({ search: { ...search, ...p }, replace: true });
  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        Em "Limpezas", escolha o período e combine empresa, contrato, banheiro, funcionário e situação — os filtros ficam no endereço da página.
        Os números são os mesmos do Painel e dos Relatórios; "Ver relatório" abre a análise com os mesmos filtros. Clique numa limpeza para ver fotos e checklist. Em "Alterações" aparece quem mudou o quê nos cadastros (contratos, banheiros, equipes, pessoas e empresas).
      </PageHelp>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Histórico" subtitle="Limpezas feitas e alterações nos cadastros." />
        {search.aba !== "alteracoes" && (
          <Button asChild variant="outline" className="min-h-10">
            <Link to="/relatorios" search={{ ...filterKeys(search), periodo: search.periodo ?? "7d" }}><BarChart3 className="h-4 w-4" />Ver relatório</Link>
          </Button>
        )}
      </div>
      <Tabs value={search.aba ?? ""} onChange={(aba) => set({ aba })} />
      {search.aba === "alteracoes" ? <AuditTab tipo={search.tipo} onTipo={(tipo) => set({ tipo })} /> : <CleaningsTab search={search} set={set} />}
    </div>
  );
}

function CleaningsTab({ search, set }: { search: Search; set: (p: Partial<Search>) => void }) {
  const f = toStatsFilter(search, "7d");
  const params = { ...f, situation: search.situacao };
  const q = useQuery({ queryKey: ["history", params], queryFn: () => listCleaningHistory(params) });
  const t = q.data?.totals;
  const n = (v: React.ReactNode) => (q.isPending ? "…" : q.isError ? "—" : v);
  const days = new Map<string, NonNullable<typeof q.data>["rows"]>();
  for (const c of q.data?.rows ?? []) { const k = isoDay(c.client_finished_at); days.set(k, [...(days.get(k) ?? []), c]); }

  return (
    <>
      <FilterBar search={search} onChange={set} fallback="7d" onClearExtra={() => set({ situacao: undefined })}
        extra={
          <NativeSelect aria-label="Situação" value={search.situacao ?? ""} onChange={(e) => set({ situacao: (e.target.value || undefined) as HistorySituation | undefined })}>
            <option value="">Todas as situações</option>
            {SITUATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        }
        extraChips={search.situacao && (
          <button type="button" onClick={() => set({ situacao: undefined })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-info-soft px-3 text-xs font-semibold text-info hover:opacity-80">
            {SITUATIONS.find(([k]) => k === search.situacao)?.[1]}<X className="h-3.5 w-3.5" />
          </button>
        )} />
      {(search.pessoa || search.situacao) && <p className="text-xs text-muted-foreground">Os números do topo seguem período, empresa, contrato e banheiro; funcionário e situação filtram a lista.</p>}
      <KpiGrid>
        <KpiCard label="Realizadas" tone="info" value={n(t?.done)} caption={t ? `de ${t.expected} previstas · ${t.extras} extra${t.extras === 1 ? "" : "s"}` : " "} />
        <KpiCard label="% no prazo" tone="success" value={n(t && t.done ? pct(t.on_time / t.done) : "—")} caption="feitas dentro do turno" />
        <KpiCard label="Atrasadas" tone="warning" value={n(t?.late_done)} caption="feitas depois do turno" />
        <KpiCard label="Não feitas" tone="danger" value={n(t?.not_done)} caption="o dia passou sem limpeza" />
      </KpiGrid>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message={q.error.message || "Não foi possível carregar o histórico."} onRetry={() => void q.refetch()} />
        : q.data.rows.length === 0 ? <EmptyState icon={History} title="Nenhuma limpeza neste filtro." description="Troque o período ou os filtros." />
        : (
          <>
            {q.data.total > q.data.limit && <p className="text-sm text-muted-foreground">Mostrando {q.data.limit} de {q.data.total}. Refine o filtro.</p>}
            {[...days].map(([day, list]) => (
              <DataCard key={day} title={fmtDate(day)} actions={<span className="text-sm tabular-nums text-muted-foreground">{list.length}</span>}>
                <ul className="divide-y">
                  {list.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => set({ limpeza: c.id })}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                        <span className="w-12 font-semibold tabular-nums text-ink">{fmtTime(c.client_finished_at)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-bold text-ink">{c.bathroom.name}</span><span className="text-muted-foreground"> · {c.contract.code} · {c.user.name}</span>
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          <MarkPills c={c} />
                          {c.status === "cancelled" ? <Pill tone="neutral">Cancelada</Pill> : c.link.kind === "extra" ? <Pill tone="info">Extra</Pill>
                            : c.marks.includes("out_of_shift") ? null : <Pill tone="success">No prazo</Pill>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DataCard>
            ))}
          </>
        )}
      <Sheet open={!!search.limpeza} onOpenChange={(o) => { if (!o) set({ limpeza: undefined }); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetTitle className="sr-only">Limpeza</SheetTitle>
          <SheetDescription className="sr-only">Fotos, checklist e marcas.</SheetDescription>
          {search.limpeza && <CleaningDetail id={search.limpeza} readOnly onClose={() => set({ limpeza: undefined })} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "cadastrou", updated: "alterou", inactivated: "inativou", reactivated: "reativou", deleted: "excluiu", activated: "ativou",
  suspended: "suspendeu", ended: "encerrou", role_changed: "mudou o perfil de", moved: "remanejou", added: "incluiu", removed: "retirou",
  regenerated_qr: "gerou novo QR de", password_reset: "redefiniu a senha de",
};
const actionText = (a: string) => ACTION_LABEL[a.split(".").pop() ?? ""] ?? "alterou";

function AuditTab({ tipo, onTipo }: { tipo?: string | undefined; onTipo: (t: string | undefined) => void }) {
  const q = useQuery({ queryKey: ["audit", tipo], queryFn: () => listAudit({ entity: tipo }) });
  return (
    <>
      <div className="max-w-xs">
        <NativeSelect aria-label="Tipo de cadastro" value={tipo ?? ""} onChange={(e) => onTipo(e.target.value || undefined)}>
          <option value="">Todos os cadastros</option>
          {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar as alterações." onRetry={() => void q.refetch()} />
        : q.data.length === 0 ? <EmptyState icon={History} title="Nenhuma alteração registrada." description="Quando alguém mudar um cadastro, aparece aqui." />
        : (
          <DataCard title="Alterações" actions={<span className="text-sm tabular-nums text-muted-foreground">{q.data.length}</span>}>
            <ol className="divide-y">
              {q.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="w-32 shrink-0 tabular-nums text-muted-foreground">{fmtDateTime(a.created_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-ink">{a.actor?.name ?? "Sistema"}</span> {actionText(a.action)}{" "}
                    <span className="text-ink">{a.entity_label.toLowerCase()} {a.entity_name ?? `nº ${a.entity_id}`}</span>
                    {a.reason && <span className="block text-xs text-muted-foreground">Motivo: {a.reason}</span>}
                  </span>
                  <Pill tone="neutral">{a.entity_label}</Pill>
                </li>
              ))}
            </ol>
          </DataCard>
        )}
    </>
  );
}
