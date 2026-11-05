// Peças dos números de cumprimento (Painel, Histórico, Relatórios, Fechamento). Os números vêm prontos do servidor.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Printer } from "lucide-react";
import { closeMonth, listClosings, reopenMonth } from "@/lib/endpoints";
import type { Closing, StatTotals } from "@/lib/types";
import { DataCard, ErrorState, KpiCard, KpiGrid, Pill, SkeletonBlock, type Tone } from "@/components/ui-kit";
import { ConfirmDialog, ReasonDialog, useAction } from "@/components/contracts/kit";
import { fmtDateTime } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`.replace(".", ","));
/** Meta vem do contrato (t.target, 0–1). Atingiu = ok; até 15 pontos abaixo = atenção; mais que isso = perigo. */
export const complianceTone = (v: number | null | undefined, target = 0.95): Tone => (v === null || v === undefined ? "neutral" : v < target - 0.15 ? "danger" : v < target ? "warning" : "success");
export const metGoal = (v: number | null | undefined, target = 0.95) => v !== null && v !== undefined && v >= target;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${MONTHS[mo! - 1]} de ${y}`; };

/** Selos de um banheiro/contrato abaixo da meta. */
export function GoalPills({ t }: { t: StatTotals }) {
  return (
    <>
      {t.pending > 0 && <Pill tone="info">faltam {t.pending}</Pill>}
      {t.not_done > 0 && <Pill tone="danger">{plural(t.not_done, "vencida", "vencidas")}</Pill>}
      {metGoal(t.compliance, t.target) ? <Pill tone="success">Meta atingida</Pill> : <Pill tone="warning">Meta não atingida</Pill>}
      <Pill tone={complianceTone(t.compliance, t.target)}>{pct(t.compliance)}</Pill>
    </>
  );
}

/** Os 4 números do cumprimento (Relatórios e Fechamento). */
export function ComplianceKpis({ t }: { t: StatTotals }) {
  return (
    <KpiGrid>
      <KpiCard label="Cumprimento" tone={complianceTone(t.compliance, t.target)} value={pct(t.compliance)} caption={`realizadas ÷ previstas · meta ${pct(t.target)}`} />
      <KpiCard label="Realizadas × previstas" tone="info" value={`${t.done} / ${t.expected}`} caption={`${t.pending} ainda pendente${t.pending === 1 ? "" : "s"}`} />
      <KpiCard label="Não feitas" tone={t.not_done ? "danger" : "success"} value={t.not_done} caption="o dia passou sem limpeza" />
      <KpiCard label="Extras" tone="neutral" value={t.extras} caption="não entram no %" />
    </KpiGrid>
  );
}

export function PrintButton() {
  return <Button variant="outline" className="min-h-10 print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir / PDF</Button>;
}

/** Fechamento do mês de um contrato (aba Relatório do contrato e seção em Relatórios). */
export function ClosingPanel({ contractId }: { contractId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["closings", contractId], queryFn: () => listClosings(contractId) });
  if (q.isPending) return <SkeletonBlock rows={3} label="Carregando fechamento…" />;
  if (q.isError) return <ErrorState message="Não foi possível carregar o fechamento." onRetry={() => void q.refetch()} />;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["closings", contractId] }); void qc.invalidateQueries({ queryKey: ["stats"] }); };
  return <div className="space-y-4">{q.data.map((c) => <ClosingCard key={c.month} c={c} onChange={refresh} />)}</div>;
}

function ClosingCard({ c, onChange }: { c: Closing; onChange: () => void }) {
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const close = useAction(() => closeMonth(c.contract_id, c.month), { success: "Mês fechado.", onSuccess: () => { setCloseOpen(false); onChange(); } });
  const reopen = useAction((reason: string) => reopenMonth(c.id!, reason), { success: "Mês reaberto.", onSuccess: () => { setReopenOpen(false); onChange(); } });
  const t = c.totals;
  return (
    <DataCard
      title={monthLabel(c.month).replace(/^./, (x) => x.toUpperCase())}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {c.status === "closed" && c.closed_at && c.closed_by
            ? <Pill tone="neutral"><Lock className="h-3 w-3" />Fechado em {fmtDateTime(c.closed_at).slice(0, 5)} por {c.closed_by.name}</Pill>
            : <Pill tone="info">{c.ended ? "Aberto" : "Em andamento"}</Pill>}
          {c.can.close && <Button className="min-h-10 print:hidden" onClick={() => setCloseOpen(true)}>Fechar mês</Button>}
          {c.can.reopen && <Button variant="outline" className="min-h-10 print:hidden" onClick={() => setReopenOpen(true)}>Reabrir</Button>}
        </div>
      }>
      <dl className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-5">
        {[["Cumprimento", pct(t.compliance)], ["Previstas", t.expected], ["Realizadas", t.done], ["Não feitas", t.not_done], ["Extras (fora do %)", t.extras]].map(([k, v]) => (
          <div key={k as string}><dt className="text-xs font-semibold uppercase text-muted-foreground">{k}</dt><dd className="text-xl font-extrabold tabular-nums text-ink">{v}</dd></div>
        ))}
      </dl>
      {!c.ended && c.status === "open" && <p className="border-t px-4 py-2 text-xs text-muted-foreground">O mês ainda não terminou. Os números mudam até o último dia.</p>}
      {c.status === "closed" && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Totais congelados no fechamento.</p>}
      {c.reopenings.map((r) => (
        <p key={r.at} className="border-t px-4 py-2 text-xs text-muted-foreground">Reaberto em {fmtDateTime(r.at)} por {r.by.name}: {r.reason}</p>
      ))}
      <ConfirmDialog open={closeOpen} onOpenChange={(o) => { setCloseOpen(o); if (!o) close.reset(); }} title={`Fechar ${monthLabel(c.month)}?`}
        description="Depois de fechado, não dá para cancelar nem lançar limpezas deste mês. Os totais ficam congelados."
        submitLabel="Fechar mês" pending={close.pending} error={close.error} onConfirm={() => void close.run()} />
      <ReasonDialog open={reopenOpen} onOpenChange={(o) => { setReopenOpen(o); if (!o) reopen.reset(); }} title={`Reabrir ${monthLabel(c.month)}`}
        description="O mês volta a aceitar cancelamentos e lançamentos. Informe o motivo." submitLabel="Reabrir"
        error={reopen.error} onConfirm={(r) => reopen.run(r)} />
    </DataCard>
  );
}
