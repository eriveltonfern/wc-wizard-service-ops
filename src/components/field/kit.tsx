// Peças das telas de campo (limpeza) e da prévia. Só tokens de cor.
import { CloudOff, FlaskConical } from "lucide-react";
import { Pill } from "@/components/ui-kit";
import { setSimulatedOffline, useOutbox } from "@/lib/outbox";
import type { Cleaning, Task } from "@/lib/types";

/** Faixa âmbar das telas que usam rotas ainda não ligadas ao servidor. */
export function PreviewBanner() {
  return (
    <div role="note" className="flex items-start gap-2 rounded-[10px] border border-pending/30 bg-pending-soft px-4 py-2.5 text-sm font-semibold text-pending print:hidden">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Prévia — dados de exemplo. Esta tela ainda não está ligada ao servidor.</span>
    </div>
  );
}

/** Indicador fixo "Aguardando internet (N)". */
export function OutboxBar() {
  const { count, offline } = useOutbox();
  if (count === 0 && !offline) return null;
  return (
    <div role="status" className="sticky top-14 z-10 -mx-4 -mt-5 mb-4 flex items-center justify-center gap-2 border-b border-pending/30 bg-pending-soft px-4 py-2 text-sm font-semibold text-pending sm:-mx-8 sm:-mt-8 sm:mb-6 print:hidden">
      <CloudOff className="h-4 w-4" />
      {count > 0 ? `Aguardando internet (${count})` : "Sem internet no momento"}
    </div>
  );
}

/** Botão "escondido" dentro da Ajuda da tela para simular falta de internet. */
export function SimOfflineToggle() {
  const { simulated } = useOutbox();
  return (
    <button type="button" onClick={() => setSimulatedOffline(!simulated)}
      className="mt-2 text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-ink">
      {simulated ? "Voltar a ter internet (simulação)" : "Simular sem internet"}
    </button>
  );
}

export const fmtTime = (isoStr?: string | null) => {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const isoDay = (isoStr: string) => {
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function TaskPill({ task }: { task: Task }) {
  if (task.status === "done") return <Pill tone="success">Feita às {fmtTime(task.done_at)}</Pill>;
  if (task.status === "not_done") return <Pill tone="danger">Não feita</Pill>;
  if (task.status === "cancelled") return <Pill tone="neutral">Cancelada</Pill>;
  if (task.late) return <Pill tone="warning">Atrasada</Pill>;
  return <Pill tone="info">Pendente</Pill>;
}

export const shiftTaskLabel: Record<string, string> = { manha: "Tarefa da manhã", tarde: "Tarefa da tarde", noite: "Tarefa da noite" };

export function CleaningPills({ c }: { c: Cleaning }) {
  return (
    <>
      {c.status === "cancelled" && <Pill tone="danger">Cancelada pelo gestor{c.cancel_reason ? `: ${c.cancel_reason}` : ""}</Pill>}
      {c.marks.includes("offline") && <Pill tone="warning">Enviado sem internet</Pill>}
      {c.link.kind === "extra" && <Pill tone="info">Extra</Pill>}
      {c.marks.includes("no_location") && <Pill tone="neutral">Sem localização</Pill>}
    </>
  );
}
