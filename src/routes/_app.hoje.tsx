import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MapPin } from "lucide-react";
import { getMyToday } from "@/lib/endpoints";
import { fmtDate, shiftLabel } from "@/lib/format";
import type { Task } from "@/lib/types";
import { PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, SimOfflineToggle, TaskPill } from "@/components/field/kit";
import { Button } from "@/components/ui/button";

export const todayQuery = { queryKey: ["field", "today"], queryFn: getMyToday };

export const Route = createFileRoute("/_app/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje · WCCheck 2.0" },
      { name: "description", content: "Banheiros que você precisa limpar hoje." },
      { property: "og:title", content: "Hoje · WCCheck 2.0" },
      { property: "og:description", content: "Banheiros que você precisa limpar hoje." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TodayPage,
});

function greeting(nowIso: string) {
  const h = new Date(nowIso).getHours();
  return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
}

function TodayPage() {
  const q = useQuery({ ...todayQuery, refetchInterval: 60000 });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PreviewBanner />
      <PageHelp>
        Aqui estão os banheiros do seu dia, separados por turno. Toque em "Começar limpeza" para registrar.
        "Atrasada" é uma limpeza de um turno que já passou, mas que ainda dá para fazer até o fim do dia.
        <br /><SimOfflineToggle />
      </PageHelp>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar o seu dia." onRetry={() => void q.refetch()} /> : (() => {
        const t = q.data;
        const pct = t.summary.total ? Math.round((t.summary.done / t.summary.total) * 100) : 0;
        const byShift = (["manha", "tarde", "noite"] as const).map((s) => [s, t.tasks.filter((x) => x.shift === s)] as const).filter(([, l]) => l.length);
        return (
          <>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink">{greeting(t.now)}, {t.first_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {fmtDate(t.date)}{t.contracts.length > 0 && <> · {t.contracts.map((c) => c.name).join(" · ")}</>}
              </p>
            </div>

            <section aria-label="Progresso do dia" className="rounded-[10px] border bg-card p-4">
              <p className="text-sm font-semibold text-ink"><span className="text-xl font-extrabold tabular-nums">{t.summary.done} de {t.summary.total}</span> feitas hoje</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% feitas`}>
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            </section>

            {t.next ? <NextCard task={t.next} /> : (
              <EmptyState icon={CheckCircle2} title="Tudo feito por hoje." description="Não há limpeza pendente agora. Se precisar, registre uma limpeza extra pela busca.">
                <Button asChild variant="outline" className="h-12"><Link to="/buscar">Buscar banheiro</Link></Button>
              </EmptyState>
            )}

            {byShift.length === 0 ? (
              <EmptyState title="Nenhuma limpeza planejada para hoje." description="Você não tem banheiros no plano de hoje." />
            ) : byShift.map(([s, list]) => (
              <DataCard key={s} title={shiftLabel[s]} actions={<span className="text-sm text-muted-foreground tabular-nums">{list.filter((x) => x.status === "done").length}/{list.length}</span>}>
                <ul className="divide-y">
                  {list.map((task) => <TaskRow key={task.id} task={task} />)}
                </ul>
              </DataCard>
            ))}
          </>
        );
      })()}
    </div>
  );
}

function NextCard({ task }: { task: Task }) {
  return (
    <section aria-label="Próxima limpeza" className="rounded-[10px] border-2 border-primary bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Próxima limpeza</p>
      <h2 className="mt-1 text-xl font-extrabold text-ink">{task.bathroom.name}</h2>
      {task.location && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{task.location}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />{shiftLabel[task.shift]} · até {task.shift_ends_at}
        {task.late && <TaskPill task={task} />}
      </p>
      <Button asChild className="mt-4 h-12 w-full text-base">
        <Link to="/registrar/$id" params={{ id: String(task.bathroom.id) }}>Começar limpeza</Link>
      </Button>
    </section>
  );
}

function TaskRow({ task }: { task: Task }) {
  const inner = (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <p className="min-w-0 flex-1 text-sm"><span className="font-bold text-ink">{task.bathroom.name}</span>{task.location && <span className="text-muted-foreground"> · {task.location}</span>}</p>
      <TaskPill task={task} />
    </div>
  );
  const cls = "block hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  if (task.status === "pending") return <li><Link to="/registrar/$id" params={{ id: String(task.bathroom.id) }} className={cls}>{inner}</Link></li>;
  if (task.status === "done" && task.cleaning_id) return <li><Link to="/minhas-limpezas/$id" params={{ id: String(task.cleaning_id) }} className={cls}>{inner}</Link></li>;
  return <li>{inner}</li>;
}
