// Ajustar limpeza ou chamado (gestor/diretoria). O ajuste fica visível para todos, com motivo.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adjustCleaning, adjustTicket, listUsers } from "@/lib/endpoints";
import type { ChecklistAnswer, Cleaning, Ticket, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";
import { Field, FormDialog, FormError, NativeSelect, useAction } from "@/components/contracts/kit";
import { CATEGORIES, CATEGORY, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL } from "@/components/tickets/kit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** ISO -> valor de <input type="datetime-local"> no horário local. */
const toLocal = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso); const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

export function AdjustCleaningDialog({ c, onClose }: { c: Cleaning; onClose: () => void }) {
  const [f, setF] = useState({
    when: toLocal(c.client_finished_at), user_id: String(c.user.id), status: c.status, notes: c.notes ?? "", reason: "",
    checklist: Object.fromEntries(c.checklist.map((i) => [i.item_id, i.answer])) as Record<number, ChecklistAnswer>,
  });
  const people = useQuery({ queryKey: ["users", { role: "limpeza" }], queryFn: () => listUsers({ role: "limpeza" }) });
  const save = useAction(() => adjustCleaning(c.id, {
    client_finished_at: fromLocal(f.when), user_id: Number(f.user_id), status: f.status, notes: f.notes, reason: f.reason,
    checklist: Object.entries(f.checklist).map(([k, v]) => ({ item_id: Number(k), answer: v })),
  }), { success: "Limpeza ajustada.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Ajustar limpeza" submitLabel="Salvar ajuste" pending={save.pending} onSubmit={() => void save.run()}
      description="O ajuste e o motivo ficam visíveis no registro para todos.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data e hora" id="adj_when" error={save.fields["client_finished_at"]}>
          <Input id="adj_when" type="datetime-local" className="h-11" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
        </Field>
        <Field label="Situação" id="adj_status" error={save.fields["status"]}>
          <NativeSelect id="adj_status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Cleaning["status"] })}>
            <option value="valid">Feita</option><option value="cancelled">Não feita (cancelada)</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Quem fez" id="adj_user" error={save.fields["user_id"]}>
        <NativeSelect id="adj_user" value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
          {!people.data?.some((u) => u.id === c.user.id) && <option value={c.user.id}>{c.user.name}</option>}
          {people.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
      </Field>
      {c.checklist.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Checklist</legend>
          <ul className="divide-y rounded-md border">
            {c.checklist.map((i) => (
              <li key={i.item_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span>{i.label}</span>
                <NativeSelect aria-label={i.label} className="w-40" value={f.checklist[i.item_id]}
                  onChange={(e) => setF({ ...f, checklist: { ...f.checklist, [i.item_id]: e.target.value as ChecklistAnswer } })}>
                  <option value="ok">OK</option><option value="not_ok">Não OK</option><option value="na">Não se aplica</option>
                </NativeSelect>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <Field label="Observação" id="adj_notes"><Textarea id="adj_notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Field label="Motivo do ajuste" id="adj_reason" error={save.fields["reason"]}>
        <Textarea id="adj_reason" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      {save.error && Object.keys(save.fields).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}

export function AdjustTicketDialog({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const [f, setF] = useState({
    category: t.category, priority: t.priority, status: t.status, description: t.description, assignee: t.assignee ? String(t.assignee.id) : "",
    opened_at: toLocal(t.opened_at), done_at: toLocal(t.done_at), done_note: t.done_note ?? "", reason: "",
  });
  const people = useQuery({ queryKey: ["users", { role: "manutencao" }], queryFn: () => listUsers({ role: "manutencao" }) });
  const save = useAction(() => adjustTicket(t.id, {
    category: f.category, priority: f.priority, status: f.status, description: f.description,
    assignee_id: f.assignee ? Number(f.assignee) : null, opened_at: fromLocal(f.opened_at),
    ...(f.status === "done" ? { done_at: fromLocal(f.done_at), done_note: f.done_note } : {}), reason: f.reason,
  }), { success: "Chamado ajustado.", onSuccess: onClose });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Ajustar chamado ${t.code}`} submitLabel="Salvar ajuste" pending={save.pending} onSubmit={() => void save.run()}
      description="O ajuste e o motivo aparecem na linha do tempo para todos.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo" id="adt_cat" error={save.fields["category"]}>
          <NativeSelect id="adt_cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TicketCategory })}>
            {CATEGORIES.map((k) => <option key={k} value={k}>{CATEGORY[k].label}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Prioridade" id="adt_pri" error={save.fields["priority"]}>
          <NativeSelect id="adt_pri" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TicketPriority })}>
            {PRIORITIES.map((k) => <option key={k} value={k}>{PRIORITY_LABEL[k]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Situação" id="adt_st" error={save.fields["status"]}>
          <NativeSelect id="adt_st" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TicketStatus })}>
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Descrição" id="adt_desc" error={save.fields["description"]}>
        <Textarea id="adt_desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsável" id="adt_who" error={save.fields["assignee_id"]}>
          <NativeSelect id="adt_who" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
            <option value="">Ninguém</option>
            {people.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Aberto em" id="adt_open" error={save.fields["opened_at"]}>
          <Input id="adt_open" type="datetime-local" className="h-11" value={f.opened_at} onChange={(e) => setF({ ...f, opened_at: e.target.value })} />
        </Field>
      </div>
      {f.status === "done" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Concluído em" id="adt_done" error={save.fields["done_at"]}>
            <Input id="adt_done" type="datetime-local" className="h-11" value={f.done_at} onChange={(e) => setF({ ...f, done_at: e.target.value })} />
          </Field>
          <Field label="Nota do reparo" id="adt_note"><Input id="adt_note" className="h-11" value={f.done_note} onChange={(e) => setF({ ...f, done_note: e.target.value })} /></Field>
        </div>
      )}
      <Field label="Motivo do ajuste" id="adt_reason" error={save.fields["reason"]}>
        <Textarea id="adt_reason" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      {save.error && Object.keys(save.fields).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}
