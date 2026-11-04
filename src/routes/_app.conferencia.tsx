import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { approveCleaning, cancelCleaning, getCleaning, listContracts, listReview } from "@/lib/endpoints";
import { fmtDate } from "@/lib/format";
import type { CancelEffect, Cleaning, ReviewFlag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, fmtTime, shiftTaskLabel } from "@/components/field/kit";
import { NativeSelect, PendingButton, ReasonDialog, useAction } from "@/components/contracts/kit";
import { fmtDateTime } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const FLAGS: { key: ReviewFlag; label: string }[] = [
  { key: "repeated_photo", label: "Foto repetida" }, { key: "offline", label: "Enviado sem internet" }, { key: "out_of_shift", label: "Fora do turno" },
];
type Search = { aba?: "conferidas" | undefined; marca?: ReviewFlag | undefined; contrato?: number | undefined; limpeza?: number | undefined };

export const Route = createFileRoute("/_app/conferencia")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (s["aba"] === "conferidas") out.aba = "conferidas";
    if (FLAGS.some((f) => f.key === s["marca"])) out.marca = s["marca"] as ReviewFlag;
    const c = Number(s["contrato"]); if (c > 0) out.contrato = c;
    const l = Number(s["limpeza"]); if (l > 0) out.limpeza = l;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Conferência · WCCheck 2.0" },
      { name: "description", content: "Limpezas com foto repetida, enviadas sem internet ou fora do turno para conferir." },
      { property: "og:title", content: "Conferência · WCCheck 2.0" },
      { property: "og:description", content: "Limpezas com foto repetida, enviadas sem internet ou fora do turno para conferir." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

export function MarkPills({ c }: { c: Cleaning }) {
  return (
    <>
      {c.marks.includes("repeated_photo") && <Pill tone="danger">Foto repetida</Pill>}
      {c.marks.includes("offline") && <Pill tone="warning">Enviado sem internet</Pill>}
      {c.marks.includes("out_of_shift") && <Pill tone="warning">Fora do turno</Pill>}
    </>
  );
}
const dayOf = (iso: string) => { const d = new Date(iso); return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); };
function timeLine(c: Cleaning) {
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

function ReviewPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/conferencia" });
  const set = (p: Partial<Search>) => void navigate({ search: { ...search, ...p }, replace: true });
  const reviewed = search.aba === "conferidas";
  const params = { flag: search.marca, contract_id: search.contrato, reviewed: reviewed ? (1 as const) : undefined };
  const q = useQuery({ queryKey: ["review", params], queryFn: () => listReview(params) });
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const counts = q.data?.counts;
  const n = (v: number | undefined) => (q.isPending ? "…" : q.isError ? "—" : v ?? 0);

  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        Aqui aparecem as limpezas que o sistema marcou para você olhar: foto repetida, enviada sem internet ou feita fora do turno. Abra uma limpeza,
        confira as fotos e escolha "Está certo" ou "Cancelar limpeza". Na aba "Conferidas" fica o histórico de quem conferiu.
      </PageHelp>
      <PageHeader title="Conferência" subtitle="Limpezas com marca para conferir." />
      <KpiGrid>
        <KpiCard label="Para conferir" tone="info" value={n(counts?.total)} caption="limpezas com marca" />
        <KpiCard label="Foto repetida" tone="danger" value={n(counts?.repeated_photo)} caption="mesma foto de outra limpeza" />
        <KpiCard label="Enviado sem internet" tone="warning" value={n(counts?.offline)} caption="chegaram depois" />
        <KpiCard label="Fora do turno" tone="warning" value={n(counts?.out_of_shift)} caption="feitas após o turno" />
      </KpiGrid>

      <div role="tablist" aria-label="Ver" className="inline-grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {([[undefined, "Para conferir"], ["conferidas", "Conferidas"]] as const).map(([k, label]) => (
          <button key={label} role="tab" aria-selected={search.aba === k} onClick={() => set({ aba: k })}
            className={cn("min-h-10 rounded-md px-4 text-sm font-semibold", search.aba === k ? "bg-card text-ink shadow-sm" : "text-muted-foreground")}>{label}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os contratos</option>
          {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Marca" value={search.marca ?? ""} onChange={(e) => set({ marca: (e.target.value || undefined) as ReviewFlag | undefined })}>
          <option value="">Todas as marcas</option>
          {FLAGS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </NativeSelect>
      </div>

      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? <ErrorState message="Não foi possível carregar a conferência." onRetry={() => void q.refetch()} /> :
        q.data.rows.length === 0 ? (
          <EmptyState icon={reviewed ? ClipboardCheck : CheckCircle2} title={reviewed ? "Nenhuma limpeza conferida nos últimos 30 dias." : "Nada para conferir."}
            {...(reviewed ? {} : { description: "Todas as limpezas com marca já foram conferidas." })} />
        ) : (
          <DataCard title={reviewed ? "Conferidas (últimos 30 dias)" : "Limpezas para conferir"} actions={<span className="text-sm tabular-nums text-muted-foreground">{q.data.rows.length}</span>}>
            <ul className="divide-y">
              {q.data.rows.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => set({ limpeza: c.id })}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-ink">{c.bathroom.name}</span><span className="text-muted-foreground"> · {c.contract.code} {c.contract.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.user.name} · <span className="tabular-nums">{timeLine(c)}</span></span>
                      {c.review && <span className="block text-xs text-muted-foreground">Conferida por {c.review.by.name} em {fmtDateTime(c.review.at)}</span>}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <MarkPills c={c} />
                      {c.review && (c.review.outcome === "cancelled" ? <Pill tone="neutral">Cancelada</Pill> : <Pill tone="success">Está certo</Pill>)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DataCard>
        )}

      <Sheet open={!!search.limpeza} onOpenChange={(o) => { if (!o) set({ limpeza: undefined }); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetTitle className="sr-only">Conferir limpeza</SheetTitle>
          <SheetDescription className="sr-only">Fotos, checklist, localização e ações.</SheetDescription>
          {search.limpeza && <ReviewDetail id={search.limpeza} onClose={() => set({ limpeza: undefined })} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Photo({ src, label }: { src?: string | undefined; label: string }) {
  return (
    <figure className="overflow-hidden rounded-[10px] border bg-card">
      {src ? <img src={src} alt={label} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-secondary text-xs text-muted-foreground">Sem foto</div>}
      <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function ReviewDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ["review", "one", id], queryFn: () => getCleaning(id) });
  const other = useQuery({ queryKey: ["review", "one", q.data?.repeated_with], queryFn: () => getCleaning(q.data!.repeated_with!), enabled: !!q.data?.repeated_with });
  const [cancelOpen, setCancelOpen] = useState(false);
  const approve = useAction(() => approveCleaning(id), { success: "Limpeza conferida.", onSuccess: onClose });
  const cancel = useAction((reason: string) => cancelCleaning(id, reason), {
    onSuccess: (r) => { toast.success(`Limpeza cancelada. ${effectText(r.effect, r.cleaning)}`); onClose(); },
  });
  if (q.isPending) return <div className="pt-8"><SkeletonBlock rows={6} /></div>;
  if (q.isError) return <div className="pt-8"><ErrorState message="Não foi possível abrir a limpeza." onRetry={() => void q.refetch()} /></div>;
  const c = q.data;
  const open = c.status === "valid" && !c.review;
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
      <p className="flex items-center gap-2 rounded-[10px] border bg-card px-4 py-3 text-sm">
        {c.position ? <><MapPin className="h-4 w-4 text-success" />Localização registrada ({c.position.latitude.toFixed(4)}, {c.position.longitude.toFixed(4)}{c.position.accuracy ? ` · ±${c.position.accuracy} m` : ""})</>
          : <><MapPinOff className="h-4 w-4 text-muted-foreground" />Sem localização</>}
      </p>
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
