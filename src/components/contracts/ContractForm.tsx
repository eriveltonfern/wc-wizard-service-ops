import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createContract, listCompanies, listUsers, updateContract } from "@/lib/endpoints";
import type { Contract, ContractDetail } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { DateInput, Field, FormDialog, FormError, NativeSelect, useAction } from "./kit";

type Props = {
  open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean;
  contract?: Contract; onSaved?: (c: ContractDetail) => void;
};

/** Novo contrato (admin) ou edição dos dados do contrato. */
export function ContractForm({ open, onOpenChange, isAdmin, contract, onSaved }: Props) {
  const editing = !!contract;
  const empty = { company_id: "", code: "", name: "", starts_on: "", ends_on: "", manager_id: "", timezone: "America/Sao_Paulo" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(contract ? {
      company_id: String(contract.company.id), code: contract.code, name: contract.name, starts_on: contract.starts_on,
      ends_on: contract.ends_on ?? "", manager_id: contract.manager ? String(contract.manager.id) : "", timezone: contract.timezone,
    } : empty);
    action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract]);

  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: open && isAdmin });
  const managers = useQuery({ queryKey: ["users", { role: "gestor", status: "active" }], queryFn: () => listUsers({ role: "gestor", status: "active" }), enabled: open && isAdmin });

  const action = useAction(
    () => {
      const base = { code: f.code, name: f.name, starts_on: f.starts_on, timezone: f.timezone };
      if (editing) {
        return updateContract(contract.id, {
          ...base, ends_on: f.ends_on || null,
          ...(isAdmin ? { company_id: Number(f.company_id), manager_id: f.manager_id ? Number(f.manager_id) : null } : {}),
        });
      }
      return createContract({
        ...base, company_id: f.company_id ? Number(f.company_id) : (undefined as unknown as number),
        ...(f.ends_on ? { ends_on: f.ends_on } : {}), ...(f.manager_id ? { manager_id: Number(f.manager_id) } : {}),
      } as Parameters<typeof createContract>[0]);
    },
    { success: editing ? "Contrato atualizado." : "Contrato criado.", onSuccess: (c) => { onOpenChange(false); onSaved?.(c); } },
  );
  const e = action.fields;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={editing ? "Editar contrato" : "Novo contrato"}
      description={editing ? undefined : "O contrato nasce em rascunho, com o checklist padrão."}
      submitLabel={editing ? "Salvar" : "Criar contrato"} pending={action.pending} onSubmit={() => void action.run()}>
      {isAdmin ? (
        <Field label="Empresa" id="company_id" error={e["company_id"]}>
          <NativeSelect id="company_id" autoFocus value={f.company_id} onChange={(ev) => set("company_id")(ev.target.value)}>
            <option value="">{companies.isLoading ? "Carregando…" : "Escolha a empresa"}</option>
            {companies.data?.filter((c) => c.status === "active" || String(c.id) === f.company_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      ) : contract && (
        <p className="text-sm text-muted-foreground">Empresa: <span className="font-medium text-foreground">{contract.company.name}</span></p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" id="code" error={e["code"]}>
          <Input id="code" className="h-11" value={f.code} onChange={(ev) => set("code")(ev.target.value)} autoFocus={!isAdmin} />
        </Field>
        <Field label="Fuso horário" id="timezone" error={e["timezone"]}>
          <Input id="timezone" className="h-11" value={f.timezone} onChange={(ev) => set("timezone")(ev.target.value)} />
        </Field>
      </div>
      <Field label="Nome" id="name" error={e["name"]}>
        <Input id="name" className="h-11" value={f.name} onChange={(ev) => set("name")(ev.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início" id="starts_on" error={e["starts_on"]}><DateInput id="starts_on" value={f.starts_on} onChange={set("starts_on")} /></Field>
        <Field label="Fim (opcional)" id="ends_on" error={e["ends_on"]}><DateInput id="ends_on" value={f.ends_on} onChange={set("ends_on")} /></Field>
      </div>
      {isAdmin && (
        <Field label="Gestor (opcional)" id="manager_id" error={e["manager_id"]}>
          <NativeSelect id="manager_id" value={f.manager_id} onChange={(ev) => set("manager_id")(ev.target.value)}>
            <option value="">Sem gestor por enquanto</option>
            {managers.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      {action.error && Object.keys(e).length === 0 && <FormError error={action.error} />}
    </FormDialog>
  );
}
