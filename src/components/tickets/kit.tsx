// Peças dos Chamados (manutenção, limpeza, gestor, fiscal). Só tokens de cor.
import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Ban, Camera, CircleHelp, Droplets, Hammer, Loader2, MessageSquare, Package, Play, RotateCcw, Search, UserCheck, UserPlus, Wrench, Zap,
  CheckCircle2, Flag, CirclePlus, type LucideIcon,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { assignTicket, cancelTicket, commentTicket, createTicket, listBathrooms, setTicketPriority } from "@/lib/endpoints";
import { dataUrlToBlob } from "@/lib/outbox";
import { shrinkPhoto } from "@/lib/photo";
import { fmtDate } from "@/lib/format";
import type { Bathroom, Ticket, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui-kit";
import { Field, FormError, NativeSelect, PendingButton, ReasonDialog, useAction } from "@/components/contracts/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const CATEGORY: Record<TicketCategory, { label: string; icon: LucideIcon }> = {
  hidraulica: { label: "Hidráulica", icon: Droplets },
  eletrica: { label: "Elétrica", icon: Zap },
  estrutura: { label: "Estrutura", icon: Hammer },
  abastecimento: { label: "Abastecimento", icon: Package },
  outros: { label: "Outros", icon: CircleHelp },
};
export const CATEGORIES = Object.keys(CATEGORY) as TicketCategory[];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { baixa: "Baixa", normal: "Normal", urgente: "Urgente" };
export const PRIORITIES: TicketPriority[] = ["urgente", "normal", "baixa"];
export const STATUS_LABEL: Record<TicketStatus, string> = { open: "Aberto", in_progress: "Em andamento", done: "Concluído", cancelled: "Cancelado" };

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const tone = status === "open" ? "info" : status === "in_progress" ? "warning" : status === "done" ? "success" : "neutral";
  return <Pill tone={tone}>{STATUS_LABEL[status]}</Pill>;
}
export function PriorityPill({ priority }: { priority: TicketPriority }) {
  return <Pill tone={priority === "urgente" ? "danger" : priority === "normal" ? "neutral" : "neutral"}>{PRIORITY_LABEL[priority]}</Pill>;
}

/** "há 5 min", "há 3 h", "há 2 dias". */
export function fmtAgo(isoStr: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(isoStr).getTime()) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d === 1 ? "" : "s"}`;
}
export const fmtDateTime = (isoStr: string) => {
  const d = new Date(isoStr);
  return `${fmtDate(isoStr.slice(0, 10) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const fmtDuration = (min: number | null) => {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export function CategoryIcon({ category, className }: { category: TicketCategory; className?: string }) {
  const Icon = CATEGORY[category].icon;
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info", className)} aria-hidden>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Cartão de chamado (lista da manutenção, quadro do gestor, "Meus chamados"). */
export function TicketCard({ t, showContract, onOpen, to }: { t: Ticket; showContract?: boolean; onOpen?: () => void; to?: boolean }) {
  const body = (
    <>
      <CategoryIcon category={t.category} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {t.priority === "urgente" && <PriorityPill priority="urgente" />}
          <span className="text-sm font-bold text-ink">{CATEGORY[t.category].label}</span>
          <span className="text-xs text-muted-foreground">· {t.code}</span>
        </div>
        <p className="text-sm text-ink">{t.bathroom.name}{t.location ? ` · ${t.location}` : ""} · {t.company.name}</p>
        {showContract && <p className="text-xs text-muted-foreground">{t.contract.code} – {t.contract.name}</p>}
        <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <TicketStatusPill status={t.status} />
          {t.priority !== "urgente" && <PriorityPill priority={t.priority} />}
          <span className="text-xs text-muted-foreground">
            {t.status === "done" && t.done_at ? `concluído ${fmtAgo(t.done_at)}` : `aberto ${fmtAgo(t.opened_at)}`}
            {t.assignee ? ` · ${t.assignee.name}` : t.status === "open" ? " · sem responsável" : ""}
          </span>
        </div>
      </div>
    </>
  );
  const cls = cn("flex w-full gap-3 rounded-[10px] border bg-card p-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    t.priority === "urgente" && (t.status === "open" || t.status === "in_progress") && "border-danger/40");
  if (to) return <Link to="/chamados/$id" params={{ id: String(t.id) }} className={cls}>{body}</Link>;
  return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
}

const EVENT_TEXT: Record<Ticket["events"][number]["kind"], { label: (t?: string) => string; icon: LucideIcon }> = {
  opened: { label: () => "abriu o chamado", icon: CirclePlus },
  assigned: { label: (t) => `atribuiu a ${t ?? "alguém"}`, icon: UserPlus },
  taken: { label: () => "assumiu o chamado", icon: UserCheck },
  started: { label: () => "iniciou o atendimento", icon: Play },
  done: { label: () => "concluiu o chamado", icon: CheckCircle2 },
  cancelled: { label: () => "cancelou o chamado", icon: Ban },
  comment: { label: () => "comentou", icon: MessageSquare },
  priority: { label: (t) => `mudou a prioridade para ${t ?? ""}`, icon: Flag },
};

/** Detalhe: fotos, descrição, quem abriu, linha do tempo. */
export function TicketDetailView({ t, children }: { t: Ticket; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CategoryIcon category={t.category} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{t.code} · {CATEGORY[t.category].label}</p>
          <h2 className="text-lg font-extrabold text-ink">{t.bathroom.name}</h2>
          <p className="text-sm text-muted-foreground">{t.location ? `${t.location} · ` : ""}{t.company.name} · {t.contract.code}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><TicketStatusPill status={t.status} /><PriorityPill priority={t.priority} /></div>
        </div>
      </div>
      {t.photo_open_url && <img src={t.photo_open_url} alt="Foto da abertura do chamado" className="aspect-[4/3] w-full rounded-[10px] border object-cover" />}
      <div className="rounded-[10px] border bg-card p-4 text-sm">
        <p className="text-ink">{t.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">Aberto por <strong className="text-ink">{t.opened_by.name}</strong> em {fmtDateTime(t.opened_at)} ({fmtAgo(t.opened_at)})</p>
        <p className="text-xs text-muted-foreground">Responsável: <strong className="text-ink">{t.assignee?.name ?? "ninguém ainda"}</strong></p>
        {t.cancel_reason && <p className="mt-2 rounded-md bg-neutral-soft px-3 py-2 text-xs text-muted-foreground">Cancelado: {t.cancel_reason}</p>}
      </div>
      {t.status === "done" && (
        <div className="space-y-2 rounded-[10px] border border-success/30 bg-success-soft p-4 text-sm">
          <p className="font-bold text-success">Reparo</p>
          {t.photo_done_url && <img src={t.photo_done_url} alt="Foto do reparo" className="aspect-[4/3] w-full rounded-lg border object-cover" />}
          <p className="text-ink">{t.done_note}</p>
        </div>
      )}
      {children}
      <section aria-label="Linha do tempo" className="rounded-[10px] border bg-card">
        <h3 className="border-b px-4 py-3 text-base font-bold text-ink">Linha do tempo</h3>
        <ol className="space-y-3 p-4">
          {t.events.map((e) => {
            const m = EVENT_TEXT[e.kind];
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><m.icon className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p><strong className="text-ink">{e.actor.name}</strong> <span className="text-muted-foreground">{m.label(e.text)}</span></p>
                  {e.text && (e.kind === "comment" || e.kind === "done" || e.kind === "cancelled") && <p className="mt-0.5 rounded-md bg-secondary px-2 py-1 text-ink">{e.text}</p>}
                  <p className="text-xs tabular-nums text-muted-foreground">{fmtDateTime(e.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** Ações do gestor/diretoria (atribuir, prioridade, comentar, cancelar). Só aparecem se o servidor permitir. */
export function ManagerActions({ t }: { t: Ticket }) {
  const [assignee, setAssignee] = useState<string>(t.assignee ? String(t.assignee.id) : "");
  const [comment, setComment] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const assign = useAction((uid: number) => assignTicket(t.id, uid), { success: "Chamado atribuído." });
  const prio = useAction((p: TicketPriority) => setTicketPriority(t.id, p), { success: "Prioridade alterada." });
  const com = useAction((text: string) => commentTicket(t.id, text), { success: "Comentário adicionado.", onSuccess: () => setComment("") });
  const cancel = useAction((reason: string) => cancelTicket(t.id, reason), { success: "Chamado cancelado." });
  if (!t.can.assign && !t.can.comment && !t.can.cancel && !t.can.priority) return null;
  return (
    <section aria-label="Ações do gestor" className="space-y-4 rounded-[10px] border bg-card p-4">
      {t.can.assign && (
        <Field label="Responsável" id={`assign-${t.id}`} error={assign.fields["user_id"]}
          hint={t.assignable?.length ? undefined : "Este contrato não tem equipe de manutenção."}>
          <div className="flex gap-2">
            <NativeSelect id={`assign-${t.id}`} value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!t.assignable?.length}>
              <option value="">Escolha alguém da manutenção</option>
              {t.assignable?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
            <PendingButton pending={assign.pending} disabled={!assignee} onClick={() => void assign.run(Number(assignee))}>Atribuir</PendingButton>
          </div>
        </Field>
      )}
      {t.can.priority && (
        <Field label="Prioridade" id={`prio-${t.id}`} error={prio.fields["priority"]}>
          <NativeSelect id={`prio-${t.id}`} value={t.priority} disabled={prio.pending} onChange={(e) => void prio.run(e.target.value as TicketPriority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </NativeSelect>
        </Field>
      )}
      {t.can.comment && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void com.run(comment); }}>
          <Field label="Comentário" id={`com-${t.id}`} error={com.fields["text"]}>
            <Textarea id={`com-${t.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um recado para a equipe" />
          </Field>
          <PendingButton type="submit" variant="outline" pending={com.pending} disabled={!comment.trim()}><MessageSquare className="h-4 w-4" />Comentar</PendingButton>
        </form>
      )}
      <FormError error={assign.error && !assign.fields["user_id"] ? assign.error : prio.error ?? (com.error && !com.fields["text"] ? com.error : null)} />
      {t.can.cancel && (
        <>
          <Button variant="outline" className="min-h-11 w-full border-danger/40 text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setCancelOpen(true)}>
            <Ban className="h-4 w-4" />Cancelar chamado
          </Button>
          <ReasonDialog open={cancelOpen} onOpenChange={(o) => { setCancelOpen(o); if (!o) cancel.reset(); }} title="Cancelar chamado"
            description="O chamado sai da fila da manutenção. O motivo fica na linha do tempo." submitLabel="Cancelar chamado" destructive
            error={cancel.error} onConfirm={(r) => cancel.run(r)} />
        </>
      )}
    </section>
  );
}

/** Campo de foto (câmera do celular) com miniatura e "Refazer". */
export function PhotoInput({ label, value, onChange, required, error }: {
  label: string; value?: string | undefined; onChange: (v: string | undefined) => void; required?: boolean; error?: string | undefined;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    try { onChange(await shrinkPhoto(f)); } catch { onChange(undefined); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink">{label}{required ? "" : " (opcional)"}</p>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={label} onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? (
        <div className="space-y-2">
          <img src={value} alt={label} className="aspect-[4/3] w-full rounded-[10px] border object-cover" />
          <Button type="button" variant="outline" className="h-12 w-full" onClick={() => input.current?.click()}><RotateCcw className="h-4 w-4" />Refazer</Button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className={cn("flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed bg-info-soft text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            error ? "border-danger" : "border-primary/40")}>
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}
          <span className="text-base font-bold">Tirar foto</span>
        </button>
      )}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}

/** Formulário de novo chamado. Com `bathroom` fixo (limpeza) ou com busca de banheiro (gestor/diretoria). */
export function TicketForm({ bathroom, initial, cleaningId, onDone, submitLabel = "Abrir chamado", showPriority = true }: {
  bathroom?: { id: number; name: string; detail?: string | undefined } | undefined;
  initial?: { category?: TicketCategory | undefined; description?: string | undefined } | undefined;
  cleaningId?: number | undefined; onDone: (t: Ticket) => void; submitLabel?: string; showPriority?: boolean;
}) {
  const [picked, setPicked] = useState<{ id: number; name: string; detail?: string | undefined } | undefined>(bathroom);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<TicketCategory | "">(initial?.category ?? "");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photo, setPhoto] = useState<string | undefined>();
  const key = useRef(crypto.randomUUID());
  const search = useQuery({
    queryKey: ["bathrooms", "ticket-search", q], enabled: !bathroom && !picked,
    queryFn: () => listBathrooms({ q: q.trim() || undefined, status: "active" }),
  });
  const create = useAction(() => createTicket({
    bathroom_id: picked?.id ?? 0, category: category as TicketCategory, priority: showPriority ? priority : undefined,
    description, photo: photo ? dataUrlToBlob(photo) : null, cleaning_id: cleaningId, idempotency_key: key.current,
  }), { onSuccess: (t) => onDone(t) });
  const f = create.fields;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
      {picked ? (
        <div className="flex items-center gap-3 rounded-[10px] border bg-card p-3">
          <Wrench className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1"><p className="font-bold text-ink">{picked.name}</p>{picked.detail && <p className="text-xs text-muted-foreground">{picked.detail}</p>}</div>
          {!bathroom && <Button type="button" variant="outline" className="min-h-11" onClick={() => setPicked(undefined)}>Trocar</Button>}
        </div>
      ) : (
        <Field label="Banheiro" id="tk-bathroom" error={f["bathroom_id"]}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="tk-bathroom" type="search" className="h-11 pl-9" placeholder="Buscar banheiro, local ou contrato" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-card" aria-label="Banheiros encontrados">
            {search.isPending ? <li className="px-3 py-2 text-sm text-muted-foreground">Buscando…</li> :
              (search.data?.rows ?? []).length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum banheiro encontrado.</li> :
              search.data!.rows.slice(0, 20).map((b: Bathroom) => (
                <li key={b.id}>
                  <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                    onClick={() => setPicked({ id: b.id, name: b.name, detail: `${b.location?.name ?? "Sem local"} · ${b.company.name} · ${b.contract.code}` })}>
                    <span className="font-semibold text-ink">{b.name}</span> <span className="text-muted-foreground">· {b.location?.name ?? "Sem local"} · {b.contract.code}</span>
                  </button>
                </li>
              ))}
          </ul>
        </Field>
      )}
      <Field label="Categoria" id="tk-category" error={f["category"]}>
        <div id="tk-category" role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY[c].icon; const on = category === c;
            return (
              <button key={c} type="button" role="radio" aria-checked={on} onClick={() => setCategory(c)}
                className={cn("flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-ink hover:bg-secondary")}>
                <Icon className="h-4 w-4" />{CATEGORY[c].label}
              </button>
            );
          })}
        </div>
      </Field>
      {showPriority && (
        <Field label="Prioridade" id="tk-priority" error={f["priority"]}>
          <div id="tk-priority" role="radiogroup" className="grid grid-cols-3 gap-2">
            {(["baixa", "normal", "urgente"] as TicketPriority[]).map((p) => {
              const on = priority === p;
              return (
                <button key={p} type="button" role="radio" aria-checked={on} onClick={() => setPriority(p)}
                  className={cn("min-h-12 rounded-lg border text-sm font-semibold", on ? (p === "urgente" ? "border-danger bg-danger text-destructive-foreground" : "border-primary bg-primary text-primary-foreground") : "bg-card text-ink hover:bg-secondary")}>
                  {PRIORITY_LABEL[p]}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      <Field label="Descrição do problema" id="tk-desc" error={f["description"]}>
        <Textarea id="tk-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que está acontecendo?" />
      </Field>
      <PhotoInput label="Foto do problema" value={photo} onChange={setPhoto} />
      <FormError error={create.error && !Object.keys(f).length ? create.error : create.error && f ? new ApiError(create.error.code, create.error.message, create.error.status) : null} />
      <PendingButton type="submit" pending={create.pending} className="h-12 w-full text-base">{submitLabel}</PendingButton>
    </form>
  );
}
