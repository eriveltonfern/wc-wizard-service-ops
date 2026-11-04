// Detalhe de uma limpeza (fotos, checklist, marcas). Usado na Conferência e no Histórico (só leitura).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { approveCleaning, cancelCleaning, getCleaning } from "@/lib/endpoints";
import { fmtDate } from "@/lib/format";
import type { CancelEffect, Cleaning } from "@/lib/types";
import { ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { fmtTime, shiftTaskLabel } from "@/components/field/kit";
import { PendingButton, ReasonDialog, useAction } from "@/components/contracts/kit";
import { fmtDateTime } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";

export function MarkPills({ c }: { c: Cleaning }) {
  return (
    <>
      {c.marks.includes("repeated_photo") && <Pill tone="danger">Foto repetida</Pill>}
      {c.marks.includes("offline") && <Pill tone="warning">Enviado sem internet</Pill>}
      {c.marks.includes("out_of_shift") && <Pill tone="warning">Fora do turno</Pill>}
    </>
  );
}
export const dayOf = (iso: string) => { const d = new Date(iso); return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); };
export function timeLine(c: Cleaning) {
  if (c.marks.includes("offline")) return `${dayOf(c.registered_at)} · feita ${fmtTime(c.client_finished_at)} no celular · recebida ${fmtTime(c.registered_at)}`;
  return `${dayOf(c.registered_at)} · ${fmtTime(c.registered_at)}`;
}
export function effectText(e: CancelEffect | undefined, c: Cleaning) {
  if (!e || e.kind === "extra") return "Era uma limpeza extra: nenhuma tarefa muda.";
  const shift = c.link.kind === "task" && c.link.shift ? shiftTaskLabel[c.link.shift]!.replace("Tarefa", "tarefa") : "tarefa";
  return e.kind === "pending"
    ? `A ${shift} de hoje volta a ficar pendente e a equipe pode fazer de novo.`
    : `A ${shift} de ${fmtDate(e.task_date)} passa a contar como não feita.`;
}

function Photo({ src, label }: { src?: string | undefined; label: string }) {
  return (
    <figure className="overflow-hidden rounded-[10px] border bg-card">
      {src ? <img src={src} alt={label} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-secondary text-xs text-muted-foreground">Sem foto</div>}
      <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function CleaningDetail({ id, onClose, readOnly }: { id: number; onClose: () => void; readOnly?: boolean }) {
  const q = useQuery({ queryKey: ["review", "one", id], queryFn: () => getCleaning(id) });
  const other = useQuery({ queryKey: ["review", "one", q.data?.repeated_with], queryFn: () => getCleaning(q.data!.repeated_with!), enabled: !!q.data?.repeated_with, retry: false });
  const [cancelOpen, setCancelOpen] = useState(false);
  const approve = useAction(() => approveCleaning(id), { success: "Limpeza conferida.", onSuccess: onClose });
  const cancel = useAction((reason: string) => cancelCleaning(id, reason), {
    onSuccess: (r) => { toast.success(`Limpeza cancelada. ${effectText(r.effect, r.cleaning)}`); onClose(); },
  });
  if (q.isPending) return <div className="pt-8"><SkeletonBlock rows={6} /></div>;
  if (q.isError) return <div className="pt-8"><ErrorState message="Não foi possível abrir a limpeza." onRetry={() => void q.refetch()} /></div>;
  const c = q.data;
  const open = !readOnly && c.status === "valid" && !c.review;
  return (
    <div className="space-y-4 pt-6">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">{c.contract.code} · {c.contract.name}</p>
        <h2 className="text-lg font-extrabold text-ink">{c.bathroom.name}</h2>
        <p className="text-sm text-muted-foreground">{c.location ? `${c.location} · ` : ""}{c.user.name}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{timeLine(c)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <MarkPills c={c} />
          {c.link.kind === "extra" ? <Pill tone="info">Extra</Pill> : <Pill tone="neutral">{shiftTaskLabel[c.link.shift ?? ""] ?? "Tarefa do dia"}</Pill>}
          {c.status === "cancelled" && <Pill tone="danger">Cancelada{c.cancel_reason ? `: ${c.cancel_reason}` : ""}</Pill>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Photo src={c.photo_before_url} label="Antes" />
        <Photo src={c.photo_after_url} label="Depois" />
      </div>
      {c.repeated_with && (
        <section className="space-y-2 rounded-[10px] border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm font-bold text-danger">Mesma foto de outra limpeza</p>
          {other.isPending ? <SkeletonBlock rows={2} /> : other.data ? (
            <div className="grid grid-cols-2 gap-3">
              <Photo src={c.photo_before_url ?? c.photo_after_url} label={`Esta · ${dayOf(c.registered_at)} ${fmtTime(c.registered_at)}`} />
              <Photo src={other.data.photo_before_url ?? other.data.photo_after_url} label={`${other.data.bathroom.name} · ${other.data.user.name} · ${dayOf(other.data.registered_at)} ${fmtTime(other.data.registered_at)}`} />
            </div>
          ) : <p className="text-sm text-muted-foreground">Não foi possível abrir a outra limpeza.</p>}
        </section>
      )}
      <section className="rounded-[10px] border bg-card">
        <h3 className="border-b px-4 py-3 text-base font-bold text-ink">Checklist</h3>
        <ul className="divide-y">
          {c.checklist.map((i) => (
            <li key={i.item_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="text-ink">{i.label}</span>
              {i.answer === "ok" ? <Pill tone="success">OK</Pill> : i.answer === "not_ok" ? <Pill tone="danger">Não OK</Pill> : <Pill tone="neutral">Não se aplica</Pill>}
            </li>
          ))}
        </ul>
      </section>
      {c.notes && <p className="rounded-[10px] border bg-card px-4 py-3 text-sm text-ink">Observação: {c.notes}</p>}
      {c.review && <p className="text-sm text-muted-foreground">Conferida por <strong className="text-ink">{c.review.by.name}</strong> em {fmtDateTime(c.review.at)}.</p>}
      {open && (
        <div className="grid gap-2 sm:grid-cols-2">
          <PendingButton pending={approve.pending} className="h-12" onClick={() => void approve.run()}><CheckCircle2 className="h-4 w-4" />Está certo</PendingButton>
          <Button variant="outline" className="h-12 border-danger/40 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelOpen(true)}>Cancelar limpeza</Button>
        </div>
      )}
      {approve.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{approve.error.message}</p>}
      <ReasonDialog open={cancelOpen} onOpenChange={(o) => { setCancelOpen(o); if (!o) cancel.reset(); }} title="Cancelar limpeza" destructive
        description={`A limpeza deixa de valer. ${effectText(c.cancel_effect, c)}`} submitLabel="Cancelar limpeza"
        error={cancel.error} onConfirm={(r) => cancel.run(r)} />
    </div>
  );
}
