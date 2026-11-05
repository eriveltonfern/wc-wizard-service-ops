import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ApiError } from "@/lib/api";
import { getCleaning } from "@/lib/endpoints";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataCard, ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { CleaningPills, PreviewBanner, fmtTime, isoDay, shiftTaskLabel } from "@/components/field/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/minhas-limpezas/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da limpeza · WCCheck 2.0" },
      { name: "description", content: "Fotos, checklist e horários de uma limpeza registrada." },
      { property: "og:title", content: "Detalhe da limpeza · WCCheck 2.0" },
      { property: "og:description", content: "Fotos, checklist e horários de uma limpeza registrada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CleaningDetailPage,
});

const answerPill = { ok: <Pill tone="success">OK</Pill>, not_ok: <Pill tone="danger">Não OK</Pill>, na: <Pill tone="neutral">Não se aplica</Pill> };

function CleaningDetailPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["field", "cleaning", id], queryFn: () => getCleaning(Number(id)), retry: false });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PreviewBanner />
      <Button asChild variant="outline" className="h-12"><Link to="/minhas-limpezas"><ArrowLeft className="h-5 w-5" />Minhas limpezas</Link></Button>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? (
        <ErrorState message={q.error instanceof ApiError ? q.error.message : "Não foi possível abrir a limpeza."} onRetry={() => void q.refetch()} />
      ) : (() => {
        const c = q.data;
        const offline = c.marks.includes("offline");
        return (
          <>
            <PageHeader title={c.bathroom.name} subtitle={`${c.location ?? "Sem local"} · ${c.contract.code} – ${c.contract.name}`}
              eyebrow={<>{c.link.kind === "extra" ? <Pill tone="info">Limpeza extra</Pill> : <Pill tone="success">{shiftTaskLabel[c.link.shift ?? ""] ?? "Tarefa do dia"}</Pill>}<CleaningPills c={c} /></>} />
            <DataCard title="Horários">
              <dl className="grid gap-2 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Registrada pelo servidor</dt><dd className="font-bold tabular-nums text-ink">{fmtDate(isoDay(c.registered_at))} às {fmtTime(c.registered_at)}</dd></div>
                {offline && <div><dt className="text-muted-foreground">Feita no celular (sem internet)</dt><dd className="font-bold tabular-nums text-ink">{fmtDate(isoDay(c.client_finished_at))} às {fmtTime(c.client_finished_at)}</dd></div>}
                <div><dt className="text-muted-foreground">Feita por</dt><dd className="font-bold text-ink">{c.user.name}</dd></div>
              </dl>
            </DataCard>
            {c.photo_deleted_at && <PhotoDeleted />}
            {c.photos_available_until && (c.photo_before_url || c.photo_after_url) && <p className="text-xs text-muted-foreground">Fotos disponíveis até {fmtDate(c.photos_available_until).slice(0, 5)}.</p>}
            {(c.photo_before_url || c.photo_after_url) && (
              <div className="grid grid-cols-2 gap-3">
                {[["Antes", c.photo_before_url], ["Depois", c.photo_after_url]].map(([label, src]) => (
                  <figure key={label} className="overflow-hidden rounded-[10px] border bg-card">
                    {src ? <img src={src} alt={`Foto ${label!.toLowerCase()}`} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-secondary text-xs text-muted-foreground">Sem foto</div>}
                    <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{label}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            <DataCard title="Checklist">
              <ul className="divide-y">
                {c.checklist.map((i) => (
                  <li key={i.item_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="text-ink">{i.label}{i.open_ticket && <span className="text-muted-foreground"> · pediu chamado</span>}</span>{answerPill[i.answer]}
                  </li>
                ))}
              </ul>
            </DataCard>
            {c.notes && <DataCard title="Observação"><p className="p-4 text-sm text-ink">{c.notes}</p></DataCard>}
          </>
        );
      })()}
    </div>
  );
}
