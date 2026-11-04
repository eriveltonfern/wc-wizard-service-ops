import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Wrench } from "lucide-react";
import { meQuery } from "@/lib/auth";
import { getTicket, getTicketSummary, listContracts, listTickets } from "@/lib/endpoints";
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState, KpiCard, KpiGrid, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, SimOfflineToggle } from "@/components/field/kit";
import { NativeSelect } from "@/components/contracts/kit";
import { CATEGORIES, CATEGORY, ManagerActions, PRIORITIES, PRIORITY_LABEL, TicketCard, TicketDetailView, TicketForm, fmtDuration } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Search = {
  f?: "abertos" | "comigo" | "todos" | undefined; banheiro?: number | undefined; contrato?: number | undefined;
  categoria?: TicketCategory | undefined; prioridade?: TicketPriority | undefined; chamado?: number | undefined; coluna?: "open" | "in_progress" | "done" | undefined;
};

export const Route = createFileRoute("/_app/chamados/")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (s["f"] === "abertos" || s["f"] === "comigo" || s["f"] === "todos") out.f = s["f"];
    const n = (k: string) => { const v = Number(s[k]); return v > 0 ? v : undefined; };
    const b = n("banheiro"); if (b) out.banheiro = b;
    const c = n("contrato"); if (c) out.contrato = c;
    const t = n("chamado"); if (t) out.chamado = t;
    if (CATEGORIES.includes(s["categoria"] as TicketCategory)) out.categoria = s["categoria"] as TicketCategory;
    if (PRIORITIES.includes(s["prioridade"] as TicketPriority)) out.prioridade = s["prioridade"] as TicketPriority;
    if (s["coluna"] === "open" || s["coluna"] === "in_progress" || s["coluna"] === "done") out.coluna = s["coluna"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Chamados · WCCheck 2.0" },
      { name: "description", content: "Chamados de manutenção dos banheiros: abertos, em andamento e concluídos." },
      { property: "og:title", content: "Chamados · WCCheck 2.0" },
      { property: "og:description", content: "Chamados de manutenção dos banheiros: abertos, em andamento e concluídos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketsPage,
});

function TicketsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  return me.role === "manutencao" ? <MaintenanceList /> : <ManagerBoard readOnly={me.role === "fiscal"} />;
}

// ---------- Manutenção (celular) ----------
function MaintenanceList() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/chamados/" });
  const f = search.f ?? "abertos";
  const q = useQuery({
    queryKey: ["tickets", "maint", f, search.banheiro],
    queryFn: () => listTickets({
      status: f === "todos" ? undefined : "active", mine: f === "comigo" ? 1 : undefined, bathroom_id: search.banheiro,
    }),
  });
  const rows = (q.data ?? []).filter((t) => (f === "abertos" ? t.status === "open" : true));
  const tabs: [NonNullable<Search["f"]>, string][] = [["abertos", "Abertos"], ["comigo", "Comigo"], ["todos", "Todos"]];
  const bathroomName = search.banheiro ? q.data?.find((t) => t.bathroom.id === search.banheiro)?.bathroom.name : undefined;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PreviewBanner />
      <PageHelp>
        Os urgentes ficam no topo. Toque num chamado para ver os detalhes, iniciar o atendimento e concluir com a foto do reparo.
        <br /><SimOfflineToggle />
      </PageHelp>
      <PageHeader title="Chamados" subtitle="Problemas para resolver nos banheiros." />
      {search.banheiro && (
        <div className="flex items-center justify-between gap-2 rounded-[10px] border bg-info-soft px-3 py-2 text-sm text-info">
          <span>Só do banheiro {bathroomName ?? "lido no QR"}</span>
          <Button variant="outline" className="min-h-10" onClick={() => void navigate({ search: { f } })}>Ver todos</Button>
        </div>
      )}
      <div role="tablist" aria-label="Filtro" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={f === k} onClick={() => void navigate({ search: { ...search, f: k } })}
            className={cn("min-h-11 rounded-md text-sm font-semibold", f === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      {q.isPending ? <SkeletonBlock rows={5} /> : q.isError ? <ErrorState message="Não foi possível carregar os chamados." onRetry={() => void q.refetch()} /> :
        rows.length === 0 ? <EmptyState icon={Wrench} title="Nenhum chamado aqui." description={f === "comigo" ? "Você não está atendendo nenhum chamado." : "Tudo resolvido por enquanto."} /> : (
          <ul className="space-y-2">{rows.map((t) => <li key={t.id}><TicketCard t={t} to /></li>)}</ul>
        )}
    </div>
  );
}

// ---------- Gestor, diretoria e fiscal ----------
const COLUMNS: { key: "open" | "in_progress" | "done"; title: string }[] = [
  { key: "open", title: "Aberto" }, { key: "in_progress", title: "Em andamento" }, { key: "done", title: "Concluído (últimos 7 dias)" },
];

function ManagerBoard({ readOnly }: { readOnly: boolean }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/chamados/" });
  const [creating, setCreating] = useState(false);
  const filters = { contract_id: search.contrato, category: search.categoria, priority: search.prioridade };
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const summary = useQuery({ queryKey: ["tickets", "summary", filters], queryFn: () => getTicketSummary(filters) });
  const list = useQuery({ queryKey: ["tickets", "board", filters], queryFn: () => listTickets(filters) });
  const set = (patch: Partial<Search>) => void navigate({ search: { ...search, ...patch }, replace: true });
  const col = search.coluna ?? "open";
  const byCol = (k: TicketStatus) => (list.data ?? []).filter((t) => t.status === k);
  const n = (v: number | undefined) => (summary.isPending ? "…" : summary.isError ? "—" : v ?? 0);

  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        Os números do topo resumem os chamados dos seus contratos. No quadro, cada coluna mostra uma etapa: aberto, em andamento e concluído nos
        últimos 7 dias. Clique num chamado para ver os detalhes{readOnly ? "." : ", atribuir a alguém da manutenção, mudar a prioridade, comentar ou cancelar."}
      </PageHelp>
      <PageHeader title="Chamados" subtitle="Problemas de manutenção nos banheiros dos contratos."
        actions={!readOnly && <Button className="min-h-10" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo chamado</Button>} />

      <KpiGrid>
        <KpiCard label="Abertos" tone="info" value={n(summary.data?.open)} caption="esperando a manutenção" />
        <KpiCard label="Urgentes" tone="danger" value={n(summary.data?.urgent)} caption="abertos ou em andamento" />
        <KpiCard label="Em andamento" tone="warning" value={n(summary.data?.in_progress)} caption="com alguém da manutenção" />
        <KpiCard label="Concluídos (7 dias)" tone="success" value={n(summary.data?.done_7d)}
          caption={summary.data ? `tempo médio: ${fmtDuration(summary.data.avg_resolution_minutes)}` : " "} />
      </KpiGrid>

      <div className="grid gap-3 sm:grid-cols-3">
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Categoria" value={search.categoria ?? ""} onChange={(e) => set({ categoria: (e.target.value || undefined) as TicketCategory | undefined })}>
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Prioridade" value={search.prioridade ?? ""} onChange={(e) => set({ prioridade: (e.target.value || undefined) as TicketPriority | undefined })}>
          <option value="">Todas as prioridades</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </NativeSelect>
      </div>

      {list.isPending ? <SkeletonBlock rows={6} label="Carregando chamados…" /> : list.isError ? <ErrorState message="Não foi possível carregar os chamados." onRetry={() => void list.refetch()} /> : (
        <>
          <div role="tablist" aria-label="Etapas" className="grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1 lg:hidden">
            {COLUMNS.map((c) => (
              <button key={c.key} role="tab" aria-selected={col === c.key} onClick={() => set({ coluna: c.key })}
                className={cn("min-h-11 rounded-md px-1 text-xs font-semibold", col === c.key ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>
                {c.key === "done" ? "Concluído" : c.title} ({byCol(c.key).length})
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((c) => (
              <section key={c.key} aria-label={c.title} className={cn("rounded-[10px] border bg-secondary/50 p-3", col !== c.key && "hidden lg:block")}>
                <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-bold text-ink">
                  {c.title}<span className="tabular-nums text-muted-foreground">{byCol(c.key).length}</span>
                </h2>
                {byCol(c.key).length === 0 ? <p className="px-1 py-6 text-center text-sm text-muted-foreground">Nenhum chamado.</p> : (
                  <ul className="space-y-2">{byCol(c.key).map((t) => <li key={t.id}><TicketCard t={t} showContract onOpen={() => set({ chamado: t.id })} /></li>)}</ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <Sheet open={!!search.chamado} onOpenChange={(o) => { if (!o) set({ chamado: undefined }); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetTitle className="sr-only">Detalhe do chamado</SheetTitle>
          <SheetDescription className="sr-only">Informações, linha do tempo e ações do chamado.</SheetDescription>
          {search.chamado && <TicketPanel id={search.chamado} />}
        </SheetContent>
      </Sheet>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo chamado</DialogTitle>
            <DialogDescription>Escolha o banheiro e descreva o problema.</DialogDescription>
          </DialogHeader>
          {creating && <TicketForm onDone={(t: Ticket) => { setCreating(false); toast.success(`Chamado ${t.code} aberto.`); set({ chamado: t.id }); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TicketPanel({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["tickets", "one", id], queryFn: () => getTicket(id) });
  if (q.isPending) return <div className="pt-8"><SkeletonBlock rows={5} /></div>;
  if (q.isError) return <div className="pt-8"><ErrorState message="Não foi possível abrir o chamado." onRetry={() => void q.refetch()} /></div>;
  return <div className="pt-6"><TicketDetailView t={q.data}><ManagerActions key={`${q.data.id}-${q.data.events.length}`} t={q.data} /></TicketDetailView></div>;
}
