import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { listContracts, listPendingTasks } from "@/lib/endpoints";
import { fmtDate, shiftLabel } from "@/lib/format";
import type { PendingTask } from "@/lib/types";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { NativeSelect } from "@/components/contracts/kit";
import { fmtAgo } from "@/components/tickets/kit";
import { cn } from "@/lib/utils";

type Search = { contrato?: number | undefined; turno?: string | undefined; tipo?: string | undefined };
const SHIFTS = ["manha", "tarde", "noite"];
const KINDS = ["late", "not_done", "pending"];
const RANK: Record<string, number> = { late: 0, not_done: 1, pending: 2 };

export const Route = createFileRoute("/_app/pendencias")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    const c = Number(s["contrato"]); if (c > 0) out.contrato = c;
    if (SHIFTS.includes(s["turno"] as string)) out.turno = s["turno"] as string;
    if (KINDS.includes(s["tipo"] as string)) out.tipo = s["tipo"] as string;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Pendências · WCCheck 2.0" },
      { name: "description", content: "Limpezas pendentes e atrasadas de hoje e não feitas dos últimos 7 dias, por contrato e banheiro." },
      { property: "og:title", content: "Pendências · WCCheck 2.0" },
      { property: "og:description", content: "Limpezas pendentes e atrasadas de hoje e não feitas dos últimos 7 dias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendenciasPage,
});

function KindPill({ t }: { t: PendingTask }) {
  if (t.kind === "not_done") return <Pill tone="danger">Não feita · venceu {fmtAgo(t.overdue_since!)}</Pill>;
  if (t.kind === "late") return <Pill tone="warning">Atrasada · venceu {fmtAgo(t.overdue_since!)}</Pill>;
  return <Pill tone="info">Pendente · até {t.shift_ends_at}</Pill>;
}

function PendenciasPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pendencias" });
  const set = (p: Partial<Search>) => void navigate({ search: { ...search, ...p }, replace: true });
  const params = { contract_id: search.contrato, shift: search.turno };
  const q = useQuery({ queryKey: ["pending-tasks", params], queryFn: () => listPendingTasks(params) });
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const all = q.data ?? [];
  const rows = [...(search.tipo ? all.filter((r) => r.kind === search.tipo) : all)]
    .sort((a, b) => RANK[a.kind]! - RANK[b.kind]! || b.date.localeCompare(a.date));
  const tabs = [["", "Todas"], ["late", "Atrasadas hoje"], ["not_done", "Não feitas"], ["pending", "Pendentes hoje"]] as const;
  const n = (k: PendingTask["kind"]) => (q.isPending ? "…" : q.isError ? "—" : all.filter((r) => r.kind === k).length);

  // agrupa por contrato → banheiro
  const groups = new Map<number, { contract: PendingTask["contract"]; baths: Map<number, PendingTask[]> }>();
  for (const r of rows) {
    const g = groups.get(r.contract.id) ?? { contract: r.contract, baths: new Map() };
    g.baths.set(r.bathroom.id, [...(g.baths.get(r.bathroom.id) ?? []), r]);
    groups.set(r.contract.id, g);
  }

  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        Aqui ficam as limpezas que ainda não foram feitas: as pendentes e atrasadas de hoje (ainda dá tempo até o fim do dia) e as não feitas dos últimos 7 dias.
        A lista é só para leitura. Filtre por contrato ou turno.
      </PageHelp>
      <PageHeader title="Pendências" subtitle="Limpezas que ainda faltam, por contrato e banheiro." />
      <KpiGrid>
        <KpiCard label="Pendentes hoje" tone="info" value={n("pending")} caption="turno ainda em andamento" />
        <KpiCard label="Atrasadas hoje" tone="warning" value={n("late")} caption="turno já passou, ainda dá tempo" />
        <KpiCard label="Não feitas" tone="danger" value={n("not_done")} caption="últimos 7 dias" />
        <KpiCard label="Banheiros" tone="neutral" value={q.isPending ? "…" : new Set(all.map((r) => r.bathroom.id)).size} caption="com alguma pendência" />
      </KpiGrid>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Situação" className="inline-flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
          {tabs.map(([k, label]) => (
            <button key={k || "all"} role="tab" aria-selected={(search.tipo ?? "") === k} onClick={() => set({ tipo: k || undefined })}
              className={cn("min-h-10 rounded-md px-3 text-sm font-semibold", (search.tipo ?? "") === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>
              {label} <span className="tabular-nums opacity-70">{k ? all.filter((r) => r.kind === k).length : all.length}</span>
            </button>
          ))}
        </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:w-[480px]">
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Turno" value={search.turno ?? ""} onChange={(e) => set({ turno: e.target.value || undefined })}>
          <option value="">Todos os turnos</option>
          {SHIFTS.map((s) => <option key={s} value={s}>{shiftLabel[s]}</option>)}
        </NativeSelect>
      </div>
      </div>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar as pendências." onRetry={() => void q.refetch()} />
        : rows.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhuma pendência." description="Todas as limpezas previstas foram feitas." />
        : [...groups.values()].map((g) => (
          <DataCard key={g.contract.id} title={`${g.contract.code} · ${g.contract.name}`} actions={<span className="text-sm tabular-nums text-muted-foreground">{[...g.baths.values()].flat().length}</span>}>
            <ul className="divide-y">
              {[...g.baths.values()].map((list) => (
                <li key={list[0]!.bathroom.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="truncate text-sm"><span className="font-bold text-ink">{list[0]!.bathroom.name}</span>{list[0]!.location && <span className="text-muted-foreground"> · {list[0]!.location}</span>}</p>
                    <p className="text-xs text-muted-foreground">{list.length} limpeza{list.length === 1 ? "" : "s"} em aberto</p>
                  </div>
                  <ul className="space-y-1.5 sm:text-right">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm sm:justify-end">
                        <span className="text-muted-foreground tabular-nums">{fmtDate(t.date)} · {shiftLabel[t.shift]}</span>
                        <KindPill t={t} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </DataCard>
        ))}
    </div>
  );
}
