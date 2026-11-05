import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { addChecklistItem, deleteChecklistItem, reorderChecklist, updateChecklistItem, updateContract } from "@/lib/endpoints";
import type { ChecklistItem, CleaningAccess, ContractDetail, ContractRules, PhotoRule, Shift } from "@/lib/types";
import { cleaningAccessLabel, photoRuleLabel, shiftLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractCtx } from "./ctx";
import { ConfirmDialog, Field, FormDialog, FormError, PendingButton, WeekdayChips, useAction } from "./kit";

function Options<T extends string>({ id, value, options, onChange, disabled }: { id: string; value: T; options: Record<T, string>; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <div id={id} role="radiogroup" className="flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} disabled={disabled} onClick={() => onChange(k)}
          className={cn("min-h-11 rounded-md border px-4 text-sm font-medium disabled:opacity-60",
            value === k ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-secondary")}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

export function RulesTab({ contract: c, ctx }: { contract: ContractDetail; ctx: ContractCtx }) {
  const ro = !ctx.canManage;
  const [r, setR] = useState<ContractRules>(c.rules);
  useEffect(() => setR(c.rules), [c.rules]);
  const save = useAction(() => updateContract(c.id, { ...r }), { success: "Regras salvas." });
  const e = save.fields;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-5 rounded-[10px] border bg-card p-5" onSubmit={(ev) => { ev.preventDefault(); void save.run(); }}>
        <h2 className="text-lg font-semibold text-foreground">Regras do contrato</h2>
        <Field label="Foto antes da limpeza" id="photo_before" error={e["photo_before"]}>
          <Options id="photo_before" value={r.photo_before} options={photoRuleLabel as Record<PhotoRule, string>} disabled={ro} onChange={(v) => setR({ ...r, photo_before: v })} />
        </Field>
        <Field label="Foto depois da limpeza" id="photo_after" error={e["photo_after"]}>
          <Options id="photo_after" value={r.photo_after} options={photoRuleLabel as Record<PhotoRule, string>} disabled={ro} onChange={(v) => setR({ ...r, photo_after: v })} />
        </Field>
        <Field label="Limpezas por dia" id="cpd" error={e["default_cleanings_per_day"]}>
          <Input id="cpd" type="number" min={1} max={24} className="h-11 w-32" disabled={ro} value={r.default_cleanings_per_day}
            onChange={(ev) => setR({ ...r, default_cleanings_per_day: Number(ev.target.value) })} />
        </Field>
        <Field label="Dias da semana" id="wd" error={e["default_weekdays"]}>
          <WeekdayChips id="wd" value={r.default_weekdays} disabled={ro} onChange={(v) => setR({ ...r, default_weekdays: v })} />
        </Field>
        <Field label="Turnos" id="shifts" error={e["shifts"]}>
          <div id="shifts" className="flex flex-wrap gap-2">
            {(["manha", "tarde", "noite"] as Shift[]).map((s) => {
              const on = r.shifts.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} disabled={ro}
                  onClick={() => setR({ ...r, shifts: on ? r.shifts.filter((x) => x !== s) : [...r.shifts, s] })}
                  className={cn("min-h-11 rounded-full border px-4 text-sm font-medium disabled:opacity-60",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-secondary")}>
                  {shiftLabel[s]}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Meta de cumprimento do mês (%)" id="monthly_target" error={e["monthly_target"]}>
          <Input id="monthly_target" type="number" min={1} max={100} className="h-11 w-32" disabled={ro} value={r.monthly_target}
            onChange={(ev) => setR({ ...r, monthly_target: Number(ev.target.value) })} />
          <p className="mt-1 text-xs text-muted-foreground">Usada no Painel, nos Relatórios e no Fechamento do mês. Padrão: 95%.</p>
        </Field>
        <Field label="Quem pode limpar os banheiros deste contrato" id="cleaning_access" error={e["cleaning_access"]}>
          <Options id="cleaning_access" value={r.cleaning_access} options={cleaningAccessLabel as Record<CleaningAccess, string>} disabled={ro} onChange={(v) => setR({ ...r, cleaning_access: v })} />
          <p className="mt-1 text-xs text-muted-foreground">
            {r.cleaning_access === "assigned" ? "Só as pessoas marcadas em cada banheiro (página do banheiro → \"Quem pode limpar\")." : "Qualquer pessoa ativa da equipe de limpeza registra limpeza em qualquer banheiro do contrato."}
          </p>
        </Field>
        {save.error && Object.keys(e).length === 0 && <FormError error={save.error} />}
        {!ro && <PendingButton type="submit" pending={save.pending}>Salvar regras</PendingButton>}
      </form>
      <ChecklistSection contract={c} readOnly={ro} />
    </div>
  );
}

function ChecklistSection({ contract: c, readOnly }: { contract: ContractDetail; readOnly: boolean }) {
  const items = c.checklist;
  const [label, setLabel] = useState("");
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [removing, setRemoving] = useState<ChecklistItem | null>(null);

  const add = useAction(() => addChecklistItem(c.id, { label }), { success: "Item adicionado.", onSuccess: () => setLabel("") });
  const move = useAction((from: number, to: number) => {
    const ids = items.map((i) => i.id);
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    return reorderChecklist(c.id, ids);
  }, { success: "Ordem atualizada." });
  const edit = useAction((it: ChecklistItem, patch: { label?: string; active?: boolean }) => updateChecklistItem(c.id, it.id, patch),
    { success: "Item atualizado.", onSuccess: () => setEditing(null) });
  const remove = useAction((it: ChecklistItem) => deleteChecklistItem(c.id, it.id), { success: "Item removido.", onSuccess: () => setRemoving(null) });
  const busy = move.pending || edit.pending;

  return (
    <section className="space-y-4 rounded-[10px] border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">Checklist da limpeza</h2>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item no checklist.</p> : (
        <ol className="divide-y rounded-md border">
          {items.map((it, i) => (
            <li key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
              <span className={cn("flex-1 text-sm", it.active ? "text-foreground" : "text-muted-foreground line-through")}>{it.label}</span>
              {!it.active && <span className="text-xs text-muted-foreground">Desativado</span>}
              {!readOnly && (
                <div className="flex flex-wrap gap-1">
                  <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Subir ${it.label}`} disabled={i === 0 || busy} onClick={() => void move.run(i, i - 1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Descer ${it.label}`} disabled={i === items.length - 1 || busy} onClick={() => void move.run(i, i + 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Editar ${it.label}`} onClick={() => { edit.reset(); setEditLabel(it.label); setEditing(it); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => void edit.run(it, { active: !it.active })}>{it.active ? "Desativar" : "Ativar"}</Button>
                  <Button size="icon" variant="ghost" className="h-11 w-11 text-danger" aria-label={`Remover ${it.label}`} onClick={() => { remove.reset(); setRemoving(it); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <FormError error={move.error} />
      {!readOnly && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void add.run(); }}>
          <div className="flex-1">
            <Input aria-label="Novo item do checklist" placeholder="Novo item do checklist" className="h-11" value={label} onChange={(e) => setLabel(e.target.value)} />
            {add.fields["label"] && <p className="mt-1 text-sm font-medium text-danger">{add.fields["label"]}</p>}
          </div>
          <PendingButton type="submit" pending={add.pending}><Plus className="h-4 w-4" />Adicionar</PendingButton>
        </form>
      )}

      <FormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar item do checklist" submitLabel="Salvar"
        pending={edit.pending} onSubmit={() => editing && void edit.run(editing, { label: editLabel })}>
        <Field label="Texto do item" id="item_label" error={edit.fields["label"]}>
          <Input id="item_label" autoFocus className="h-11" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
        </Field>
      </FormDialog>
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover item"
        description={`Remover "${removing?.label ?? ""}" do checklist?`} submitLabel="Remover" pending={remove.pending}
        error={remove.error} onConfirm={() => removing && void remove.run(removing)} />
    </section>
  );
}
