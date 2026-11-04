import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { createUser, listCompanies, updateUser } from "@/lib/endpoints";
import type { Role, User } from "@/lib/types";
import { roleLabel } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormDialog, FormError, NativeSelect, useAction } from "@/components/contracts/kit";

/** Cadastro (com perfis permitidos) ou edição dos dados de uma pessoa. */
export function UserForm({ open, onOpenChange, roles, user, preset, onCreated, title, description, cancelLabel }: {
  open: boolean; onOpenChange: (o: boolean) => void; roles: Role[]; user?: User | undefined;
  preset?: { role?: Role; company_id?: number; company_name?: string } | undefined; onCreated?: (u: User, password: string) => void;
  title?: string | undefined; description?: string | undefined; cancelLabel?: string | undefined;
}) {
  const editing = !!user;
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "", company_id: "" });
  useEffect(() => {
    if (!open) return;
    setF(user ? { name: user.name, email: user.email, phone: user.phone ?? "", role: user.role, company_id: String(user.company_id ?? "") }
      : { name: "", email: "", phone: "", role: preset?.role ?? (roles.length === 1 ? roles[0]! : ""), company_id: preset?.company_id ? String(preset.company_id) : "" });
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);
  const needsCompany = !editing && f.role === "fiscal";
  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: open && needsCompany && !preset?.company_id });

  const save = useAction(async () => {
    const base = { name: f.name, email: f.email, phone: f.phone };
    if (editing) return { user: await updateUser(user.id, base), temporary_password: "" };
    return createUser({ ...base, role: f.role, ...(f.role === "fiscal" && f.company_id ? { company_id: Number(f.company_id) } : {}) });
  }, {
    success: editing ? "Dados atualizados." : "Pessoa cadastrada.",
    onSuccess: (r) => { if (!editing) onCreated?.(r.user, r.temporary_password); onOpenChange(false); },
  });
  const e = save.fields;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title ?? (editing ? "Editar pessoa" : "Nova pessoa")} submitLabel={editing ? "Salvar" : "Cadastrar"}
      description={description} cancelLabel={cancelLabel} pending={save.pending} onSubmit={() => void save.run()}>
      <Field label="Nome" id="u_name" error={e["name"]}><Input id="u_name" autoFocus className="h-11" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} /></Field>
      <Field label="E-mail" id="u_email" error={e["email"]}><Input id="u_email" type="email" className="h-11" value={f.email} onChange={(ev) => setF({ ...f, email: ev.target.value })} /></Field>
      <Field label="Telefone (opcional)" id="u_phone" error={e["phone"]}><Input id="u_phone" type="tel" className="h-11" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} /></Field>
      {!editing && (
        <Field label="Perfil" id="u_role" error={e["role"]}>
          <NativeSelect id="u_role" value={f.role} disabled={!!preset?.role} onChange={(ev) => setF({ ...f, role: ev.target.value })}>
            {roles.length > 1 && <option value="">Escolha o perfil</option>}
            {roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </NativeSelect>
        </Field>
      )}
      {needsCompany && preset?.company_name && (
        <Field label="Empresa" id="u_company_locked">
          <Input id="u_company_locked" className="h-11" value={preset.company_name} disabled readOnly />
        </Field>
      )}
      {needsCompany && !preset?.company_id && (
        <Field label="Empresa" id="u_company" error={e["company_id"]}>
          <NativeSelect id="u_company" value={f.company_id} onChange={(ev) => setF({ ...f, company_id: ev.target.value })}>
            <option value="">{companies.isLoading ? "Carregando…" : "Escolha a empresa"}</option>
            {companies.data?.filter((c) => c.status === "active").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      {save.error && Object.keys(e).length === 0 && <FormError error={save.error} />}
    </FormDialog>
  );
}

export function TempPasswordDialog({ data, onClose }: { data: { user: User; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Senha temporária</DialogTitle>
          <DialogDescription>Para {data?.user.name} ({data?.user.email})</DialogDescription>
        </DialogHeader>
        <p className="select-all rounded-md border bg-muted px-4 py-3 text-center font-mono text-xl font-semibold tracking-wider text-foreground">{data?.password}</p>
        <p className="text-sm text-muted-foreground">Anote ou envie agora: ela não será mostrada de novo. A pessoa troca a senha no primeiro acesso.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" autoFocus onClick={async () => {
            try { await navigator.clipboard.writeText(data?.password ?? ""); toast.success("Senha copiada."); } catch { toast.error("Não foi possível copiar. Anote a senha."); }
          }}><Copy className="h-4 w-4" />Copiar</Button>
          <Button className="min-h-11" onClick={onClose}>Pronto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
