import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserCheck, UserPlus } from "lucide-react";
import { createCompany, updateCompany } from "@/lib/endpoints";
import type { Company, User } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormDialog, FormError, useAction } from "@/components/contracts/kit";
import { FiscalPickerDialog } from "./FiscalPickerDialog";
import { TempPasswordDialog, UserForm } from "./UserForm";

export function CompanyForm({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company?: Company | undefined }) {
  const navigate = useNavigate();
  const empty = { name: "", document: "", contact_name: "", contact_phone: "", notes: "" };
  const [f, setF] = useState(empty);
  // Depois de criar a empresa: passo "Adicionar o fiscal desta empresa".
  const [created, setCreated] = useState<Company | null>(null);
  const [step, setStep] = useState<"ask" | "new" | "existing">("ask");
  const [temp, setTemp] = useState<{ user: User; password: string } | null>(null);
  const fiscalSaved = useRef(false);
  useEffect(() => {
    if (!open) return;
    setF(company ? { name: company.name, document: company.document ?? "", contact_name: company.contact_name ?? "", contact_phone: company.contact_phone ?? "", notes: company.notes ?? "" } : empty);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company]);
  const goToCompany = (id: number) => void navigate({ to: "/empresas/$id", params: { id: String(id) } });
  const finish = () => { const id = created?.id; setCreated(null); setStep("ask"); if (id) goToCompany(id); };
  const save = useAction(() => (company ? updateCompany(company.id, f) : createCompany(f)), {
    success: company ? "Empresa atualizada." : "Empresa cadastrada.",
    onSuccess: (c) => { onOpenChange(false); if (!company) { fiscalSaved.current = false; setStep("ask"); setCreated(c); } },
  });
  const e = save.fields;
  const set = (k: keyof typeof empty) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  return (
    <>
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

      {created && (
        <Dialog open={step === "ask" && !temp} onOpenChange={(o) => { if (!o) finish(); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar o fiscal desta empresa</DialogTitle>
              <DialogDescription>Sem fiscal, os contratos de {created.name} não podem ser ativados. Escolha como adicionar.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Button className="min-h-11" onClick={() => setStep("new")}><UserPlus className="h-4 w-4" />Cadastrar novo fiscal</Button>
              <Button variant="outline" className="min-h-11" onClick={() => setStep("existing")}><UserCheck className="h-4 w-4" />Adicionar fiscal já cadastrado</Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" className="min-h-11" onClick={finish}>Fazer depois</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {created && (
        <>
          <UserForm open={step === "new" && !temp} onOpenChange={(o) => { if (!o && !fiscalSaved.current) setStep("ask"); }}
            roles={["fiscal"]} preset={{ role: "fiscal", company_id: created.id, company_name: created.name }}
            title="Cadastrar o fiscal desta empresa" cancelLabel="Voltar"
            description="Sem fiscal, os contratos desta empresa não podem ser ativados."
            onCreated={(user, password) => { fiscalSaved.current = true; setTemp({ user, password }); }} />
          <FiscalPickerDialog open={step === "existing" && !temp} onOpenChange={(o) => { if (!o) setStep("ask"); }}
            companyId={created.id} companyName={created.name} onAdded={finish} />
        </>
      )}
      <TempPasswordDialog data={temp} onClose={() => { const id = created?.id; setTemp(null); setCreated(null); setStep("ask"); if (id) goToCompany(id); }} />
    </>
  );
}
