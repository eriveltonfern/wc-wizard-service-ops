import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Star, Wrench } from "lucide-react";
import { toast } from "sonner";
import { meQuery } from "@/lib/auth";
import { listBathrooms, listContracts, listRatings } from "@/lib/endpoints";
import { RATING_PROBLEM_LABEL } from "@/lib/format";
import type { Rating } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard, EmptyState, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock, type Tone } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { NativeSelect } from "@/components/contracts/kit";
import { TicketForm, fmtDateTime } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Search = { dias?: number | undefined; contrato?: number | undefined; banheiro?: number | undefined };
const PERIODS = [7, 30, 90];

export const Route = createFileRoute("/_app/avaliacoes")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    const n = (k: string) => { const v = Number(s[k]); return v > 0 ? v : undefined; };
    const d = n("dias"); if (d && PERIODS.includes(d)) out.dias = d;
    const c = n("contrato"); if (c) out.contrato = c;
    const b = n("banheiro"); if (b) out.banheiro = b;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Avaliações dos banheiros · WCCheck 2.0" },
      { name: "description", content: "Notas que os usuários dão aos banheiros pelo QR: nota média, piores banheiros e problemas citados." },
      { property: "og:title", content: "Avaliações dos banheiros · WCCheck 2.0" },
      { property: "og:description", content: "Notas dadas pelo QR, piores banheiros e problemas citados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatingsPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Vermelho abaixo de 3, âmbar até 4, verde acima. */
export const scoreTone = (v: number): Tone => (v < 3 ? "danger" : v <= 4 ? "warning" : "success");
const fmtScore = (v: number) => v.toFixed(1).replace(".", ",");

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${fmtScore(value)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("h-4 w-4", i <= Math.round(value) ? "fill-pending text-pending" : "text-border")} aria-hidden />)}
    </span>
  );
}

function RatingsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const canOpen = me.role === "admin" || me.role === "gestor";
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/avaliacoes" });
  const set = (p: Partial<Search>) => void navigate({ search: (s) => ({ ...s, ...p }) });
  const dias = search.dias ?? 30;
  const to = new Date(); const from = new Date(); from.setDate(from.getDate() - (dias - 1));
  const contracts = useQuery({ queryKey: ["contracts", "list"], queryFn: () => listContracts() });
  const baths = useQuery({ queryKey: ["bathrooms", "ratings", search.contrato], queryFn: () => listBathrooms({ contract_id: search.contrato }) });
  const q = useQuery({
    queryKey: ["ratings", dias, search.contrato, search.banheiro],
    queryFn: () => listRatings({ from: iso(from), to: iso(to), contract_id: search.contrato, bathroom_id: search.banheiro }),
  });
  const [ticketFor, setTicketFor] = useState<Rating | null>(null);
  const s = q.data?.summary;
  const v = (x: string | number) => (q.isPending ? "…" : q.isError ? "—" : x);

  return (
    <div className="space-y-6">
      <PreviewBanner />
      <PageHelp>
        Quem usa o banheiro escaneia o QR da etiqueta e dá uma nota de 1 a 5, sem login. Aqui você vê a nota média, os banheiros com pior nota e os problemas citados.
        {canOpen ? " Em avaliações com Vazamento ou Outro, use \"Abrir chamado\" para mandar para a manutenção." : ""}
      </PageHelp>
      <PageHeader title="Avaliações" subtitle="O que os usuários acham dos banheiros." />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Período" className="flex gap-1 rounded-lg border bg-card p-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={dias === p} onClick={() => set({ dias: p === 30 ? undefined : p })}
              className={cn("min-h-10 rounded-md px-3 text-sm font-semibold", dias === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}>
              {p} dias
            </button>
          ))}
        </div>
        <NativeSelect aria-label="Contrato" className="sm:w-64" value={search.contrato ?? ""} onChange={(e) => set({ contrato: e.target.value ? Number(e.target.value) : undefined, banheiro: undefined })}>
          <option value="">Todos os contratos</option>
          {contracts.data?.map((c) => <option key={c.id} value={c.id}>{c.company.name} · {c.code}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Banheiro" className="sm:w-56" value={search.banheiro ?? ""} onChange={(e) => set({ banheiro: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os banheiros</option>
          {baths.data?.rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
      </div>

      <KpiGrid>
        <KpiCard label="Nota média" tone={s?.average ? scoreTone(s.average) : "neutral"} value={v(s?.average ? fmtScore(s.average) : "—")}
          caption={s?.average ? <Stars value={s.average} /> : "de 1 a 5"} />
        <KpiCard label="Avaliações no período" tone="info" value={v(s?.count ?? 0)} caption={`últimos ${dias} dias`} />
        <KpiCard label="% negativas (nota 1–2)" tone={s?.negative_share ? (s.negative_share > 0.2 ? "danger" : "warning") : "success"}
          value={v(s?.negative_share === null || s?.negative_share === undefined ? "—" : `${Math.round(s.negative_share * 100)}%`)} caption="das avaliações do período" />
        <KpiCard label="Problema mais citado" tone="warning" value={v(s?.top_problem ? RATING_PROBLEM_LABEL[s.top_problem] : "—")} caption="nas notas até 3" />
      </KpiGrid>

      {q.isError ? <ErrorState message="Não foi possível carregar as avaliações." onRetry={() => void q.refetch()} /> : q.isPending ? <SkeletonBlock rows={6} /> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <DataCard title="Banheiros com pior nota">
            {!s!.worst.length ? <EmptyState icon={Star} title="Nenhuma avaliação no período." /> : (
              <ul className="divide-y">
                {s!.worst.map((w) => (
                  <li key={w.bathroom.id}>
                    <button type="button" onClick={() => set({ banheiro: w.bathroom.id })} className="w-full px-4 py-3 text-left hover:bg-secondary">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-sm"><strong className="text-ink">{w.bathroom.name}</strong> <span className="text-muted-foreground">· {w.company.name}</span></p>
                        <Pill tone={scoreTone(w.average)}>{fmtScore(w.average)}</Pill>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
                        <div className={cn("h-full rounded-full", { danger: "bg-danger", warning: "bg-warning", success: "bg-success", info: "bg-primary", neutral: "bg-muted-foreground" }[scoreTone(w.average)])}
                          style={{ width: `${(w.average / 5) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{w.count} avaliaç{w.count === 1 ? "ão" : "ões"}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DataCard>
          <DataCard title={<>Avaliações recentes <span className="text-sm font-normal text-muted-foreground">({q.data.rows.length}{s!.count > q.data.rows.length ? ` de ${s!.count}` : ""})</span></>}>
            {!q.data.rows.length ? <EmptyState icon={Star} title="Nenhuma avaliação no período." description="Troque o período ou os filtros." /> : (
              <ul className="divide-y">
                {q.data.rows.map((r) => {
                  const maint = r.problems.some((p) => p === "vazamento" || p === "outro");
                  return (
                    <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <Pill tone={scoreTone(r.score)}>{r.score} ★</Pill>
                      <div className="min-w-0 flex-1 text-sm">
                        <p><strong className="text-ink">{r.bathroom.name}</strong> <span className="text-muted-foreground">· {r.company.name}</span></p>
                        {r.problems.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.problems.map((p) => <Pill key={p} tone="neutral">{RATING_PROBLEM_LABEL[p]}</Pill>)}</div>}
                        {r.comment && <p className="mt-1 text-ink">“{r.comment}”</p>}
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{fmtDateTime(r.created_at)}</p>
                      </div>
                      {canOpen && maint && (
                        <Button variant="outline" className="min-h-10" onClick={() => setTicketFor(r)}><Wrench className="h-4 w-4" />Abrir chamado</Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </DataCard>
        </div>
      )}

      <Dialog open={!!ticketFor} onOpenChange={(o) => !o && setTicketFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Abrir chamado</DialogTitle><DialogDescription>Já preenchido com a avaliação do usuário. Confira e envie.</DialogDescription></DialogHeader>
          {ticketFor && (
            <TicketForm
              bathroom={{ id: ticketFor.bathroom.id, name: ticketFor.bathroom.name, detail: `${ticketFor.company.name} · ${ticketFor.contract.code}` }}
              initial={{
                category: ticketFor.problems.includes("vazamento") ? "hidraulica" : "outros",
                description: `Avaliação do usuário (nota ${ticketFor.score}): ${ticketFor.problems.map((p) => RATING_PROBLEM_LABEL[p]).join(", ")}${ticketFor.comment ? `. "${ticketFor.comment}"` : "."}`,
              }}
              onDone={(t) => { setTicketFor(null); toast.success(`Chamado ${t.code} aberto.`); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
