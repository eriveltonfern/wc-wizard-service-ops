import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createCompany, updateCompany } from "@/lib/endpoints";
import type { Company } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog, FormError, useAction } from "@/components/contracts/kit";

export function CompanyForm({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company?: Company | undefined }) {
  const navigate = useNavigate();
  const empty = { name: "", document: "", contact_name: "", contact_phone: "", notes: "" };
  const [f, setF] = useState(empty);
  useEffect(() => {
    if (!open) return;
    setF(company ? { name: company.name, document: company.document ?? "", contact_name: company.contact_name ?? "", contact_phone: company.contact_phone ?? "", notes: company.notes ?? "" } : empty);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company]);
  const save = useAction(() => (company ? updateCompany(company.id, f) : createCompany(f)), {
    success: company ? "Empresa atualizada." : "Empresa cadastrada.",
    onSuccess: (c) => { onOpenChange(false); if (!company) void navigate({ to: "/empresas/$id", params: { id: String(c.id) } }); },
  });
  const e = save.fields;
  const set = (k: keyof typeof empty) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={company ? "Editar empresa" : "Nova empresa"} submitLabel={company ? "Salvar" : "Cadastrar"}
      pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Nome" id="co_name" error={e["name"]}><Input id="co_name" autoFocus className="h-11" value={f.name} onChange={set("name")} /></Field>
      <Field label="CNPJ (opcional)" id="co_doc" error={e["document"]}><Input id="co_doc" inputMode="numeric" className="h-11" value={f.document} onChange={set("document")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do contato" id="co_cname" error={e["contact_name"]}><Input id="co_cname" className="h-11" value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Telefone do contato" id="co_cphone" error={e["contact_phone"]}><Input id="co_cphone" type="tel" className="h-11" value={f.contact_phone} onChange={set("contact_phone")} /></Field>
      </div>
      <Field label="Observações" id="co_notes" error={e["notes"]}><Textarea id="co_notes" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      {save.error && Object.keys(e).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}
