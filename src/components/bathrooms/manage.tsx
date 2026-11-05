// Banheiros: transferir para outro contrato e definir quem pode limpar. Só tokens de cor.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Plus, UserMinus, Users } from "lucide-react";
import {
  getBathroomCleaners, listContracts, listLocations, listUserBathrooms, listUsers, setBathroomCleaners, transferBathrooms, transferCleaner,
} from "@/lib/endpoints";
import { todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DataCard, EmptyState } from "@/components/ui-kit";
import { DateInput, Field, FormDialog, FormError, NativeSelect, useAction } from "@/components/contracts/kit";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Transfere um ou vários banheiros para outro contrato (pode ser de outra empresa). O QR e o histórico continuam. */
export function TransferDialog({ ids, currentContractIds, onClose, onDone }: { ids: number[]; currentContractIds: number[]; onClose: () => void; onDone?: () => void }) {
  const contracts = useQuery({ queryKey: ["contracts", "transfer"], queryFn: () => listContracts() });
  const [to, setTo] = useState("");
  const [loc, setLoc] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const locations = useQuery({ queryKey: ["locations", Number(to)], queryFn: () => listLocations(Number(to)), enabled: !!to });
  const save = useAction(() => transferBathrooms({ bathroom_ids: ids, to_contract_id: Number(to), location_id: loc ? Number(loc) : undefined, date, reason }), {
    success: ids.length === 1 ? "Banheiro transferido." : `${ids.length} banheiros transferidos.`, onSuccess: () => { onDone?.(); onClose(); },
  });
  const f = save.fields;
  const options = (contracts.data ?? []).filter((c) => c.status !== "ended" && !(currentContractIds.length === 1 && currentContractIds[0] === c.id));
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={ids.length === 1 ? "Transferir banheiro" : `Transferir ${ids.length} banheiros`}
      description="O banheiro passa para o contrato e a empresa de destino. O QR continua o mesmo e todo o histórico fica guardado."
      submitLabel="Transferir" pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Contrato de destino" id="tr_to" error={f["to_contract_id"] ?? f["bathroom_ids"]}>
        <NativeSelect id="tr_to" value={to} onChange={(e) => { setTo(e.target.value); setLoc(""); }}>
          <option value="">Escolha o contrato</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.company.name} · {c.code} {c.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Local no destino (opcional)" id="tr_loc" error={f["location_id"]}>
        <NativeSelect id="tr_loc" value={loc} disabled={!to} onChange={(e) => setLoc(e.target.value)}>
          <option value="">Sem local</option>
          {locations.data?.filter((l) => l.status === "active").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="A partir de" id="tr_date" error={f["date"]}><DateInput id="tr_date" value={date} onChange={setDate} required /></Field>
      <Field label="Motivo" id="tr_reason" error={f["reason"]}><Textarea id="tr_reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {Object.keys(f).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}

function useCleaningPeople() {
  return useQuery({ queryKey: ["users", "limpeza-ativos"], queryFn: () => listUsers({ role: "limpeza", status: "active" }) });
}

/** Cartão "Quem pode limpar" na página do banheiro (contrato em "Pessoas escolhidas por banheiro"). */
export function CleanersCard({ bathroomId, canManage }: { bathroomId: number; canManage: boolean }) {
  const q = useQuery({ queryKey: ["bathroom", bathroomId, "cleaners"], queryFn: () => getBathroomCleaners(bathroomId) });
  const people = useCleaningPeople();
  const [pick, setPick] = useState("");
  const current = q.data ?? [];
  const save = useAction((ids: number[]) => setBathroomCleaners(bathroomId, ids), { success: "Responsáveis atualizados." });
  const free = (people.data ?? []).filter((u) => !current.some((c) => c.id === u.id));
  return (
    <DataCard title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Quem pode limpar</span>}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Neste contrato só as pessoas marcadas aqui registram limpeza neste banheiro.</p>
        {q.isPending ? <p className="text-sm text-muted-foreground">Carregando…</p> : !current.length ? (
          <p className="rounded-md bg-pending-soft px-3 py-2 text-sm font-medium text-pending">Ninguém marcado: nenhuma pessoa consegue registrar limpeza aqui.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {current.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{c.name}</span>
                {canManage && <Button variant="ghost" className="min-h-10 text-danger" aria-label={`Remover ${c.name}`} disabled={save.pending}
                  onClick={() => void save.run(current.filter((x) => x.id !== c.id).map((x) => x.id))}><UserMinus className="h-4 w-4" />Remover</Button>}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div className="flex gap-2">
            <NativeSelect aria-label="Pessoa da limpeza" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Escolha uma pessoa da limpeza</option>
              {free.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </NativeSelect>
            <Button className="min-h-11" disabled={!pick || save.pending}
              onClick={() => void save.run([...current.map((x) => x.id), Number(pick)]).then((ok) => ok && setPick(""))}><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
        )}
        <FormError error={save.error} />
      </div>
    </DataCard>
  );
}

/** Ação em lote: define as mesmas pessoas para vários banheiros. */
export function BulkCleanersDialog({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone?: () => void }) {
  const people = useCleaningPeople();
  const [sel, setSel] = useState<number[]>([]);
  const save = useAction(async () => { for (const id of ids) await setBathroomCleaners(id, sel); return true; }, {
    success: `Responsáveis definidos em ${plural(ids.length, "banheiro", "banheiros")}.`, onSuccess: () => { onDone?.(); onClose(); },
  });
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Definir responsáveis · ${plural(ids.length, "banheiro", "banheiros")}`}
      description="As pessoas marcadas passam a ser as únicas que limpam estes banheiros (vale para contratos em &quot;Pessoas escolhidas por banheiro&quot;)."
      submitLabel="Salvar responsáveis" pending={save.pending} onSubmit={() => void save.run()}>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
        {(people.data ?? []).map((u) => (
          <li key={u.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
              <Checkbox checked={sel.includes(u.id)} onCheckedChange={(v) => setSel(v ? [...sel, u.id] : sel.filter((x) => x !== u.id))} />
              {u.name}
            </label>
          </li>
        ))}
      </ul>
      <FormError error={save.error} />
    </FormDialog>
  );
}

/** Página da pessoa (limpeza): banheiros dela e "Transferir banheiros para…". */
export function PersonBathroomsCard({ userId, canManage }: { userId: number; canManage: boolean }) {
  const q = useQuery({ queryKey: ["user", userId, "bathrooms"], queryFn: () => listUserBathrooms(userId) });
  const [open, setOpen] = useState(false);
  const rows = q.data ?? [];
  return (
    <DataCard title="Banheiros desta pessoa"
      actions={canManage && rows.length > 0 ? <Button variant="outline" className="min-h-10" onClick={() => setOpen(true)}><ArrowRightLeft className="h-4 w-4" />Transferir banheiros para…</Button> : undefined}>
      {q.isPending ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p> : !rows.length ? (
        <EmptyState icon={Users} title="Nenhum banheiro marcado para esta pessoa." description="Só aparece em contratos com &quot;Pessoas escolhidas por banheiro&quot;." />
      ) : (
        <ul className="divide-y">
          {rows.map((b) => (
            <li key={b.id} className="px-4 py-2.5 text-sm"><strong className="text-ink">{b.name}</strong><span className="text-muted-foreground">{b.location ? ` · ${b.location}` : ""} · {b.contract.code}</span></li>
          ))}
        </ul>
      )}
      {open && <TransferCleanerDialog fromId={userId} bathrooms={rows} onClose={() => setOpen(false)} />}
    </DataCard>
  );
}

function TransferCleanerDialog({ fromId, bathrooms, onClose }: { fromId: number; bathrooms: { id: number; name: string }[]; onClose: () => void }) {
  const people = useCleaningPeople();
  const [to, setTo] = useState("");
  const [sel, setSel] = useState<number[]>(bathrooms.map((b) => b.id));
  const [reason, setReason] = useState("");
  const save = useAction(() => transferCleaner({ from_user_id: fromId, to_user_id: Number(to), bathroom_ids: sel, reason }), { success: "Banheiros transferidos.", onSuccess: onClose });
  const f = save.fields;
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Transferir banheiros para outra pessoa" submitLabel="Transferir" pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Para quem" id="tc_to" error={f["to_user_id"]}>
        <NativeSelect id="tc_to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Escolha a pessoa</option>
          {(people.data ?? []).filter((u) => u.id !== fromId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Banheiros" id="tc_b" error={f["bathroom_ids"]}>
        <ul id="tc_b" className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {bathrooms.map((b) => (
            <li key={b.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                <Checkbox checked={sel.includes(b.id)} onCheckedChange={(v) => setSel(v ? [...sel, b.id] : sel.filter((x) => x !== b.id))} />{b.name}
              </label>
            </li>
          ))}
        </ul>
      </Field>
      <Field label="Motivo" id="tc_reason" error={f["reason"]}><Textarea id="tc_reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {Object.keys(f).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}
