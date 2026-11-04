import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { changeMyPassword } from "@/lib/endpoints";
import { meQuery, type User } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { Field, FormDialog, FormError, PendingButton, useAction } from "@/components/contracts/kit";

function usePasswordForm(onDone: () => void) {
  const qc = useQueryClient();
  const [f, setF] = useState({ current: "", new: "", confirm: "" });
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const action = useAction(() => changeMyPassword({ current: f.current, new: f.new }), {
    success: "Senha alterada.",
    onSuccess: () => {
      qc.setQueryData<User>(meQuery.queryKey, (u) => (u ? { ...u, must_change_password: false } : u));
      setF({ current: "", new: "", confirm: "" });
      onDone();
    },
  });
  const submit = () => {
    if (f.new !== f.confirm) { setConfirmError("As senhas não conferem."); return; }
    setConfirmError(undefined);
    void action.run();
  };
  const fields = (
    <>
      <Field label="Senha atual" id="pw_current" error={action.fields["current"]}>
        <Input id="pw_current" type="password" autoComplete="current-password" autoFocus className="h-11" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field label="Nova senha" id="pw_new" error={action.fields["new"]} hint="No mínimo 10 caracteres.">
        <Input id="pw_new" type="password" autoComplete="new-password" className="h-11" value={f.new} onChange={(e) => setF({ ...f, new: e.target.value })} />
      </Field>
      <Field label="Confirmar nova senha" id="pw_confirm" error={confirmError}>
        <Input id="pw_confirm" type="password" autoComplete="new-password" className="h-11" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      </Field>
      {action.error && Object.keys(action.fields).length === 0 && <FormError error={action.error} />}
    </>
  );
  return { fields, submit, pending: action.pending };
}

/** Tela obrigatória no primeiro acesso. */
export function ForcePasswordScreen({ onDone }: { onDone: () => void }) {
  const { fields, submit, pending } = usePasswordForm(onDone);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Crie sua senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">No primeiro acesso, troque a senha temporária por uma só sua.</p>
          </div>
          {fields}
          <PendingButton type="submit" pending={pending} className="w-full">Salvar e continuar</PendingButton>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { fields, submit, pending } = usePasswordForm(() => onOpenChange(false));
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Trocar senha" submitLabel="Trocar senha" pending={pending} onSubmit={submit}>
      {fields}
    </FormDialog>
  );
}
