import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { listAudit, listBathrooms, listCleaningHistory, listContracts, listUsers } from "@/lib/endpoints";
import { fmtDate, todayIso } from "@/lib/format";
import type { HistorySituation, StatsFilter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, fmtTime, isoDay } from "@/components/field/kit";
import { CleaningDetail, MarkPills } from "@/components/field/CleaningDetail";
import { NativeSelect } from "@/components/contracts/kit";
import { fmtDateTime } from "@/components/tickets/kit";
import { pct } from "@/components/reports/kit";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type Period = "hoje" | "7d" | "mes" | "custom";
type Search = {
  aba?: "alteracoes" | undefined; periodo?: Period | undefined; de?: string | undefined; ate?: string | undefined;
  contrato?: number | undefined; banheiro?: number | undefined; pessoa?: number | undefined; situacao?: HistorySituation | undefined;
  tipo?: string | undefined; limpeza?: number | undefined;
};
const SITUATIONS: [HistorySituation, string][] = [["on_time", "No prazo"], ["late", "Atrasada"], ["extra", "Extra"], ["cancelled", "Cancelada"]];
const TYPES: [string, string][] = [["contract", "Contrato"], ["bathroom", "Banheiro"], ["team", "Equipe"], ["user", "Pessoa"], ["company", "Empresa"]];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/_app/historico")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (s["aba"] === "alteracoes") out.aba = "alteracoes";
    if (["hoje", "7d", "mes", "custom"].includes(s["periodo"] as string)) out.periodo = s["periodo"] as Period;
    if (dateRe.test(String(s["de"] ?? ""))) out.de = String(s["de"]);
    if (dateRe.test(String(s["ate"] ?? ""))) out.ate = String(s["ate"]);
    for (const k of ["contrato", "banheiro", "pessoa", "limpeza"] as const) { const v = Number(s[k]); if (v > 0) out[k] = v; }
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

function periodFilter(s: Search): StatsFilter {
  const today = todayIso();
  const minus = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  switch (s.periodo ?? "7d") {
    case "hoje": return { from: today, to: today };
    case "mes": return { month: today.slice(0, 7) };
    case "custom": return { from: s.de ?? minus(6), to: s.ate ?? today };
    default: return { from: minus(6), to: today };
  }
}

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
        Em "Limpezas" você vê o que foi feito no período escolhido, com os mesmos números do Painel e dos Relatórios. Clique numa limpeza para ver fotos,
        checklist e localização. Em "Alterações" aparece quem mudou o quê nos cadastros (contratos, banheiros, equipes, pessoas e empresas).
      </PageHelp>
      <PageHeader title="Histórico" subtitle="Limpezas feitas e alterações nos cadastros." />
      <Tabs value={search.aba ?? ""} onChange={(aba) => set({ aba })} />
      {search.aba === "alteracoes" ? <AuditTab tipo={search.tipo} onTipo={(tipo) => set({ tipo })} /> : <CleaningsTab search={search} set={set} />}
    </div>
  );
}

function CleaningsTab({ search, set }: { search: Search; set: (p: Partial<Search>) => void }) {
  const f = periodFilter(search);
  const params = { ...f, contract_id: search.contrato, bathroom_id: search.banheiro, user_id: search.pessoa, situation: search.situacao };
  const q = useQuery({ queryKey: ["history", params], queryFn: () => listCleaningHistory(params) });
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const baths = useQuery({ queryKey: ["bathrooms", { contract_id: search.contrato }], queryFn: () => listBathrooms(search.contrato ? { contract_id: search.contrato } : {}) });
  const people = useQuery({ queryKey: ["users", "limpeza"], queryFn: () => listUsers({ role: "limpeza" }), retry: false });
  const t = q.data?.totals;
  const n = (v: React.ReactNode) => (q.isPending ? "…" : q.isError ? "—" : v);
  const days = new Map<string, NonNullable<typeof q.data>["rows"]>();
  for (const c of q.data?.rows ?? []) { const k = isoDay(c.client_finished_at); days.set(k, [...(days.get(k) ?? []), c]); }

  return (
    <>
      <KpiGrid>
        <KpiCard label="Realizadas" tone="info" value={n(t?.done)} caption={t ? `de ${t.expected} previstas · ${t.extras} extra${t.extras === 1 ? "" : "s"}` : " "} />
        <KpiCard label="% no prazo" tone="success" value={n(t && t.done ? pct(t.on_time / t.done) : "—")} caption="feitas dentro do turno" />
        <KpiCard label="Atrasadas" tone="warning" value={n(t?.late_done)} caption="feitas depois do turno" />
        <KpiCard label="Não feitas" tone="danger" value={n(t?.not_done)} caption="o dia passou sem limpeza" />
      </KpiGrid>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <NativeSelect aria-label="Período" value={search.periodo ?? "7d"} onChange={(e) => set({ periodo: e.target.value as Period })}>
          <option value="hoje">Hoje</option><option value="7d">7 dias</option><option value="mes">Este mês</option><option value="custom">Personalizado</option>
        </NativeSelect>
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined, banheiro: undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Banheiro" value={search.banheiro ?? ""} onChange={(e) => set({ banheiro: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os banheiros</option>
          {(baths.data?.rows ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Pessoa" value={search.pessoa ?? ""} onChange={(e) => set({ pessoa: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todas as pessoas</option>
          {(people.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Situação" value={search.situacao ?? ""} onChange={(e) => set({ situacao: (e.target.value || undefined) as HistorySituation | undefined })}>
          <option value="">Todas as situações</option>
          {SITUATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </div>
      {search.periodo === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="de" className="text-muted-foreground">De</label>
          <Input id="de" type="date" className="w-auto" value={f.from ?? ""} onChange={(e) => set({ de: e.target.value || undefined })} />
          <label htmlFor="ate" className="text-muted-foreground">até</label>
          <Input id="ate" type="date" className="w-auto" value={f.to ?? ""} onChange={(e) => set({ ate: e.target.value || undefined })} />
          <span className="text-xs text-muted-foreground">Os dados de exemplo cobrem os últimos 30 dias.</span>
        </div>
      )}
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
          <SheetDescription className="sr-only">Fotos, checklist, localização e marcas.</SheetDescription>
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
