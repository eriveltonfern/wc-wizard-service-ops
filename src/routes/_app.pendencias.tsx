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

type Search = { contrato?: number | undefined; turno?: string | undefined };
const SHIFTS = ["manha", "tarde", "noite"];

export const Route = createFileRoute("/_app/pendencias")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    const c = Number(s["contrato"]); if (c > 0) out.contrato = c;
    if (SHIFTS.includes(s["turno"] as string)) out.turno = s["turno"] as string;
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
  const rows = q.data ?? [];
  const n = (k: PendingTask["kind"]) => (q.isPending ? "…" : q.isError ? "—" : rows.filter((r) => r.kind === k).length);

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
        <KpiCard label="Banheiros" tone="neutral" value={q.isPending ? "…" : new Set(rows.map((r) => r.bathroom.id)).size} caption="com alguma pendência" />
      </KpiGrid>
      <div className="grid gap-3 sm:grid-cols-2">
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Turno" value={search.turno ?? ""} onChange={(e) => set({ turno: e.target.value || undefined })}>
          <option value="">Todos os turnos</option>
          {SHIFTS.map((s) => <option key={s} value={s}>{shiftLabel[s]}</option>)}
        </NativeSelect>
      </div>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar as pendências." onRetry={() => void q.refetch()} />
        : rows.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhuma pendência." description="Todas as limpezas previstas foram feitas." />
        : [...groups.values()].map((g) => (
          <DataCard key={g.contract.id} title={`${g.contract.code} · ${g.contract.name}`} actions={<span className="text-sm tabular-nums text-muted-foreground">{[...g.baths.values()].flat().length}</span>}>
            <ul className="divide-y">
              {[...g.baths.values()].map((list) => (
                <li key={list[0]!.bathroom.id} className="px-4 py-3">
                  <p className="text-sm"><span className="font-bold text-ink">{list[0]!.bathroom.name}</span>{list[0]!.location && <span className="text-muted-foreground"> · {list[0]!.location}</span>}</p>
                  <ul className="mt-2 space-y-1.5">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{fmtDate(t.date)} · {shiftLabel[t.shift]}</span>
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
