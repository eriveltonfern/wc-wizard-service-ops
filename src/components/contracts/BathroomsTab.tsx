import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import {
  createBathroom, createLocation, createStatusPeriod, deleteBathroom, deleteLocation, deleteStatusPeriod, getBathroom,
  inactivateBathroom, listBathrooms, listLocations, reactivateBathroom, regenerateBathroomQr, updateBathroom, updateLocation,
} from "@/lib/endpoints";
import type { Bathroom, ContractDetail, Location } from "@/lib/types";
import { bathroomKindLabel, fmtPeriod, hasOwnPlan, planLabel, todayIso } from "@/lib/format";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ContractCtx } from "./ctx";
import {
  ConfirmDialog, DateInput, EmptyBlock, ErrorBlock, Field, FormDialog, FormError, HistoryNotice, LoadingBlock, NativeSelect,
  PendingButton, StatusBadge, WeekdayChips, useAction,
} from "./kit";

type Dlg = { kind: "form"; b?: Bathroom } | { kind: "qr" | "periods" | "delete"; b: Bathroom } | { kind: "locations" } | null;

export function BathroomsTab({ contract: c, ctx }: { contract: ContractDetail; ctx: ContractCtx }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q, 250);
  const query = useQuery({ queryKey: ["bathrooms", c.id, dq, status], queryFn: () => listBathrooms({ contract_id: c.id, q: dq, status }) });
  const [dlg, setDlg] = useState<Dlg>(null);
  const close = () => setDlg(null);
  const toggle = useAction((b: Bathroom) => (b.status === "active" ? inactivateBathroom : reactivateBathroom)(b.id),
    { success: "Situação do banheiro atualizada." });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar banheiro" placeholder="Buscar por nome, local ou andar" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect aria-label="Filtrar por situação" className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
        </NativeSelect>
        {ctx.canManage && (
          <>
            <Button asChild variant="outline" className="min-h-11"><Link to="/etiquetas" search={{ contrato: c.id }}>Imprimir etiquetas</Link></Button>
            <Button variant="outline" className="min-h-11" onClick={() => setDlg({ kind: "locations" })}><MapPin className="h-4 w-4" />Gerenciar locais</Button>
            <Button className="min-h-11" onClick={() => setDlg({ kind: "form" })}><Plus className="h-4 w-4" />Novo banheiro</Button>
          </>
        )}
      </div>
      <FormError error={toggle.error} />

      {query.isLoading ? <LoadingBlock label="Carregando banheiros…" />
        : query.isError ? <ErrorBlock message="Não foi possível carregar os banheiros." onRetry={() => void query.refetch()} />
        : !query.data?.rows.length ? (
          <EmptyBlock title={dq || status ? "Nenhum banheiro encontrado." : "Nenhum banheiro cadastrado."}>
            {ctx.canManage && !dq && !status && <Button className="min-h-11" onClick={() => setDlg({ kind: "form" })}>Cadastrar banheiro</Button>}
          </EmptyBlock>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Local</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Andar</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Situação</th>{ctx.canManage && <th className="px-4 py-3"><span className="sr-only">Ações</span></th>}</tr>
              </thead>
              <tbody className="divide-y">
                {query.data.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{b.location?.name ?? "—"}</td>
                    <td className="px-4 py-3">{bathroomKindLabel[b.kind]}</td>
                    <td className="px-4 py-3">{b.floor ?? "—"}</td>
                    <td className="px-4 py-3">{hasOwnPlan(b) ? planLabel(b.effective_plan) : <span className="text-muted-foreground">Padrão do contrato <span className="text-xs">({planLabel(b.effective_plan)})</span></span>}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    {ctx.canManage && (
                      <td className="px-2 py-1 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11" aria-label={`Ações de ${b.name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="min-h-11" onSelect={() => setDlg({ kind: "form", b })}>Editar</DropdownMenuItem>
                            <DropdownMenuItem className="min-h-11" onSelect={() => void toggle.run(b)}>{b.status === "active" ? "Inativar" : "Reativar"}</DropdownMenuItem>
                            <DropdownMenuItem className="min-h-11" onSelect={() => setDlg({ kind: "qr", b })}>Gerar novo QR</DropdownMenuItem>
                            {b.status === "active" && <DropdownMenuItem asChild className="min-h-11"><Link to="/etiquetas" search={{ contrato: c.id, banheiro: b.id }}>Imprimir etiqueta</Link></DropdownMenuItem>}
                            <DropdownMenuItem className="min-h-11" onSelect={() => setDlg({ kind: "periods", b })}>Interdições</DropdownMenuItem>
                            <DropdownMenuItem className="min-h-11 text-destructive" onSelect={() => setDlg({ kind: "delete", b })}>Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {dlg?.kind === "form" && <BathroomForm contract={c} bathroom={dlg.b} onClose={close} />}
      {dlg?.kind === "qr" && <RegenerateQr b={dlg.b} onClose={close} />}
      {dlg?.kind === "periods" && <PeriodsDialog b={dlg.b} onClose={close} />}
      {dlg?.kind === "delete" && <DeleteBathroom b={dlg.b} onClose={close} />}
      {dlg?.kind === "locations" && <LocationsDialog contractId={c.id} onClose={close} />}
    </div>
  );
}

export function BathroomForm({ contract: c, bathroom: b, onClose }: { contract: ContractDetail; bathroom?: Bathroom | undefined; onClose: () => void }) {
  const locations = useQuery({ queryKey: ["locations", c.id], queryFn: () => listLocations(c.id) });
  const [f, setF] = useState({
    name: b?.name ?? "", location_id: b?.location ? String(b.location.id) : "", kind: b?.kind ?? "unissex", floor: b?.floor ?? "", notes: b?.notes ?? "",
    own: b ? hasOwnPlan(b) : false,
    cpd: String(b?.effective_plan.cleanings_per_day ?? c.rules.default_cleanings_per_day),
    weekdays: b?.effective_plan.weekdays ?? c.rules.default_weekdays,
  });
  const [newLoc, setNewLoc] = useState<string | null>(null);
  const addLoc = useAction(() => createLocation(c.id, { name: newLoc ?? "" }),
    { success: "Local criado.", onSuccess: (l) => { setF((s) => ({ ...s, location_id: String(l.id) })); setNewLoc(null); } });
  const save = useAction(() => {
    const input = {
      name: f.name, kind: f.kind, floor: f.floor, notes: f.notes, location_id: f.location_id ? Number(f.location_id) : null,
      cleanings_per_day: f.own ? Number(f.cpd) : null, weekdays: f.own ? f.weekdays : null,
    };
    return b ? updateBathroom(b.id, input) : createBathroom(c.id, input);
  }, { success: b ? "Banheiro atualizado." : "Banheiro cadastrado.", onSuccess: onClose });
  const e = save.fields;

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={b ? "Editar banheiro" : "Novo banheiro"}
      description={b ? undefined : "O QR da etiqueta é gerado automaticamente."} submitLabel={b ? "Salvar" : "Cadastrar"}
      pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Nome" id="b_name" error={e["name"]}><Input id="b_name" autoFocus className="h-11" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
      <Field label="Local (opcional)" id="b_loc" error={e["location_id"]}>
        <div className="flex gap-2">
          <NativeSelect id="b_loc" value={f.location_id} onChange={(ev) => setF({ ...f, location_id: ev.target.value })}>
            <option value="">Sem local</option>
            {locations.data?.filter((l) => l.status === "active" || String(l.id) === f.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
          {newLoc === null && <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => { addLoc.reset(); setNewLoc(""); }}>Novo local</Button>}
        </div>
      </Field>
      {newLoc !== null && (
        <div className="rounded-md border bg-muted/40 p-3">
          <Field label="Nome do novo local" id="new_loc" error={addLoc.fields["name"]}>
            <div className="flex gap-2">
              <Input id="new_loc" autoFocus className="h-11" value={newLoc} onChange={(ev) => setNewLoc(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void addLoc.run(); } }} />
              <PendingButton type="button" pending={addLoc.pending} onClick={() => void addLoc.run()}>Criar</PendingButton>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setNewLoc(null)}>Cancelar</Button>
            </div>
          </Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" id="b_kind" error={e["kind"]}>
          <NativeSelect id="b_kind" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value as Bathroom["kind"] })}>
            {Object.entries(bathroomKindLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Andar (opcional)" id="b_floor" error={e["floor"]}><Input id="b_floor" className="h-11" value={f.floor} onChange={(ev) => setF({ ...f, floor: ev.target.value })} /></Field>
      </div>
      <Field label="Observações (opcional)" id="b_notes" error={e["notes"]}><Textarea id="b_notes" rows={2} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} /></Field>
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-3">
          <Switch id="b_own" checked={f.own} onCheckedChange={(v) => setF({ ...f, own: v })} />
          <label htmlFor="b_own" className="font-medium text-foreground">Plano próprio</label>
        </div>
        {!f.own ? <p className="text-sm text-muted-foreground">Segue o padrão do contrato: {planLabel({ cleanings_per_day: c.rules.default_cleanings_per_day, weekdays: c.rules.default_weekdays })}.</p> : (
          <>
            <Field label="Limpezas por dia" id="b_cpd" error={e["cleanings_per_day"]}>
              <Input id="b_cpd" type="number" min={1} max={24} className="h-11 w-32" value={f.cpd} onChange={(ev) => setF({ ...f, cpd: ev.target.value })} />
            </Field>
            <Field label="Dias da semana" id="b_wd" error={e["weekdays"]}><WeekdayChips id="b_wd" value={f.weekdays} onChange={(v) => setF({ ...f, weekdays: v })} /></Field>
          </>
        )}
      </div>
      {save.error && Object.keys(e).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}

export function RegenerateQr({ b, onClose }: { b: Bathroom; onClose: () => void }) {
  const a = useAction(() => regenerateBathroomQr(b.id), { success: "Novo QR gerado. Imprima a nova etiqueta.", onSuccess: onClose });
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title="Gerar novo QR"
      description={`Gerar um novo QR para "${b.name}"? A etiqueta antiga deixa de funcionar.`} submitLabel="Gerar novo QR"
      pending={a.pending} error={a.error} onConfirm={() => void a.run()} />
  );
}

export function DeleteBathroom({ b, onClose, onDeleted }: { b: Bathroom; onClose: () => void; onDeleted?: () => void }) {
  const del = useAction(() => deleteBathroom(b.id), { success: "Banheiro excluído.", onSuccess: () => { onClose(); onDeleted?.(); } });
  const inact = useAction(() => inactivateBathroom(b.id), { success: "Banheiro inativado.", onSuccess: onClose });
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title="Excluir banheiro" description={`Excluir "${b.name}"? Esta ação não pode ser desfeita.`}
      submitLabel="Excluir" pending={del.pending} error={del.error} onConfirm={() => void del.run()}>
      {del.error?.code === "has_history" && (
        <HistoryNotice>
          {b.status === "active"
            ? <PendingButton type="button" variant="outline" pending={inact.pending} onClick={() => void inact.run()}>Inativar</PendingButton>
            : <span className="text-muted-foreground">O banheiro já está inativo.</span>}
        </HistoryNotice>
      )}
    </ConfirmDialog>
  );
}

export function PeriodsDialog({ b, onClose }: { b: Bathroom; onClose: () => void }) {
  const detail = useQuery({ queryKey: ["bathroom", b.id], queryFn: () => getBathroom(b.id) });
  const [f, setF] = useState({ starts_on: todayIso(), ends_on: todayIso(), reason: "" });
  const add = useAction(() => createStatusPeriod(b.id, f), { success: "Interdição registrada.", onSuccess: () => setF({ starts_on: todayIso(), ends_on: todayIso(), reason: "" }) });
  const del = useAction((id: number) => deleteStatusPeriod(id), { success: "Interdição removida." });
  const periods = detail.data?.status_periods ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Interdições · {b.name}</DialogTitle><DialogDescription>Períodos em que o banheiro fica fora de uso.</DialogDescription></DialogHeader>
        {detail.isLoading ? <LoadingBlock /> : periods.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma interdição registrada.</p> : (
          <ul className="divide-y rounded-md border">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div><p className="text-sm font-medium text-foreground">{fmtPeriod(p.starts_on, p.ends_on)}</p><p className="text-xs text-muted-foreground">{p.reason}</p></div>
                <Button size="icon" variant="ghost" className="h-11 w-11 text-destructive" aria-label="Remover interdição" disabled={del.pending} onClick={() => void del.run(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
        <form className="space-y-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); void add.run(); }}>
          <h3 className="font-semibold text-foreground">Registrar interdição</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Início" id="sp_start" error={add.fields["starts_on"]}><DateInput id="sp_start" value={f.starts_on} onChange={(v) => setF({ ...f, starts_on: v })} /></Field>
            <Field label="Fim" id="sp_end" error={add.fields["ends_on"]}><DateInput id="sp_end" value={f.ends_on} onChange={(v) => setF({ ...f, ends_on: v })} /></Field>
          </div>
          <Field label="Motivo" id="sp_reason" error={add.fields["reason"]}><Input id="sp_reason" className="h-11" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          {add.error && Object.keys(add.fields).length === 0 && <FormError error={add.error} />}
          <FormError error={del.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Fechar</Button>
            <PendingButton type="submit" pending={add.pending}>Registrar interdição</PendingButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LocationsDialog({ contractId, onClose }: { contractId: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ["locations", contractId], queryFn: () => listLocations(contractId) });
  const [edit, setEdit] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const create = useAction(() => createLocation(contractId, { name: newName }), { success: "Local criado.", onSuccess: () => setNewName("") });
  const update = useAction((l: Location, patch: { name?: string; status?: string }) => updateLocation(l.id, { name: l.name, status: l.status, ...patch }),
    { success: "Local atualizado.", onSuccess: () => setEdit(null) });
  const del = useAction((id: number) => deleteLocation(id), { success: "Local excluído." });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Locais do contrato</DialogTitle><DialogDescription>Agrupam os banheiros (ex.: portaria, refeitório).</DialogDescription></DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
          <div className="flex-1">
            <Input aria-label="Nome do novo local" placeholder="Novo local" autoFocus className="h-11" value={newName} onChange={(e) => setNewName(e.target.value)} />
            {create.fields["name"] && <p className="mt-1 text-sm font-medium text-destructive">{create.fields["name"]}</p>}
          </div>
          <PendingButton type="submit" pending={create.pending}>Criar</PendingButton>
        </form>
        {q.isLoading ? <LoadingBlock /> : !q.data?.length ? <p className="text-sm text-muted-foreground">Nenhum local cadastrado.</p> : (
          <ul className="divide-y rounded-md border">
            {q.data.map((l) => (
              <li key={l.id} className="space-y-2 px-3 py-2">
                {edit?.id === l.id ? (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void update.run(l, { name: edit.name }); }}>
                    <Input aria-label="Nome do local" autoFocus className="h-11" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <PendingButton type="submit" pending={update.pending}>Salvar</PendingButton>
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setEdit(null)}>Cancelar</Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.bathrooms_count} banheiro(s) · {l.status === "active" ? "Ativo" : "Inativo"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" className="min-h-11" onClick={() => { update.reset(); setEdit({ id: l.id, name: l.name }); }}>Editar</Button>
                      <Button variant="ghost" className="min-h-11" disabled={update.pending} onClick={() => void update.run(l, { status: l.status === "active" ? "inactive" : "active" })}>{l.status === "active" ? "Inativar" : "Reativar"}</Button>
                      <Button variant="ghost" className="min-h-11 text-destructive" disabled={del.pending} onClick={() => void del.run(l.id)}>Excluir</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {update.fields["name"] && <p className="text-sm font-medium text-destructive">{update.fields["name"]}</p>}
        <FormError error={del.error} />
        <div className="flex justify-end"><Button variant="outline" className="min-h-11" onClick={onClose}>Fechar</Button></div>
      </DialogContent>
    </Dialog>
  );
}
