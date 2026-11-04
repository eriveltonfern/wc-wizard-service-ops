import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, ListChecks } from "lucide-react";
import { listMyCleanings } from "@/lib/endpoints";
import { isQueuedCleaning, useOutbox } from "@/lib/outbox";
import { fmtDate, todayIso } from "@/lib/format";
import type { Cleaning } from "@/lib/types";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { CleaningPills, PreviewBanner, fmtTime, isoDay } from "@/components/field/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/minhas-limpezas/")({
  head: () => ({
    meta: [
      { title: "Minhas limpezas · WCCheck 2.0" },
      { name: "description", content: "Histórico das limpezas que você registrou." },
      { property: "og:title", content: "Minhas limpezas · WCCheck 2.0" },
      { property: "og:description", content: "Histórico das limpezas que você registrou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyCleaningsPage,
});

function dayTitle(day: string) {
  const t = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yIso = isoDay(y.toISOString());
  return day === t ? `Hoje · ${fmtDate(day)}` : day === yIso ? `Ontem · ${fmtDate(day)}` : fmtDate(day);
}

function MyCleaningsPage() {
  const q = useQuery({ queryKey: ["field", "mine"], queryFn: listMyCleanings });
  const queued = useOutbox().items.filter(isQueuedCleaning);
  const groups = new Map<string, Cleaning[]>();
  for (const c of q.data ?? []) {
    const k = isoDay(c.registered_at);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PreviewBanner />
      <PageHelp>Aqui ficam as limpezas que você registrou nos últimos dias. Toque numa limpeza para ver os detalhes.</PageHelp>
      <PageHeader title="Minhas limpezas" subtitle="Suas últimas limpezas, por dia." />
      {queued.length > 0 && (
        <DataCard title={<span className="flex items-center gap-2"><CloudOff className="h-4 w-4 text-pending" />Aguardando internet</span>}>
          <ul className="divide-y">
            {queued.map((x) => (
              <li key={x.idempotency_key} className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm">
                <span className="w-12 font-semibold tabular-nums text-muted-foreground">{fmtTime(x.client_finished_at)}</span>
                <span className="flex-1 font-bold text-ink">{x.bathroom_name}</span>
                <Pill tone="warning">Guardada no celular</Pill>
              </li>
            ))}
          </ul>
        </DataCard>
      )}
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar suas limpezas." onRetry={() => void q.refetch()} /> :
        q.data.length === 0 ? (
          <EmptyState icon={ListChecks} title="Você ainda não registrou limpezas." description="Quando registrar, elas aparecem aqui.">
            <Button asChild className="h-12"><Link to="/hoje">Ver o meu dia</Link></Button>
          </EmptyState>
        ) : [...groups.entries()].map(([day, list]) => (
          <DataCard key={day} title={dayTitle(day)} actions={<span className="text-sm tabular-nums text-muted-foreground">{list.length}</span>}>
            <ul className="divide-y">
              {list.map((c) => (
                <li key={c.id}>
                  <Link to="/minhas-limpezas/$id" params={{ id: String(c.id) }}
                    className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className="w-12 font-semibold tabular-nums text-muted-foreground">{fmtTime(c.registered_at)}</span>
                    <span className="min-w-0 flex-1"><span className="font-bold text-ink">{c.bathroom.name}</span>{c.location && <span className="text-muted-foreground"> · {c.location}</span>}</span>
                    <span className="flex flex-wrap gap-1.5"><CleaningPills c={c} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </DataCard>
        ))}
    </div>
  );
}
