import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { approveCleaning, cancelCleaning, getCleaning, listContracts, listReview } from "@/lib/endpoints";
import { fmtDate } from "@/lib/format";
import type { CancelEffect, Cleaning, ReviewFlag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { CleaningDetail, MarkPills, timeLine } from "@/components/field/CleaningDetail";
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
          <SheetDescription className="sr-only">Fotos, checklist e ações.</SheetDescription>
          {search.limpeza && <CleaningDetail id={search.limpeza} onClose={() => set({ limpeza: undefined })} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
