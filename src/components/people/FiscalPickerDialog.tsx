import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addCompanyFiscal, listCompanies, listUsers } from "@/lib/endpoints";
import { Field, EmptyBlock, FormDialog, FormError, LoadingBlock, NativeSelect, useAction } from "@/components/contracts/kit";

/** Adiciona à empresa uma pessoa que já está cadastrada com o perfil fiscal. */
export function FiscalPickerDialog({ open, onOpenChange, companyId, companyName, onAdded }: {
  open: boolean; onOpenChange: (o: boolean) => void; companyId: number; companyName: string; onAdded?: (() => void) | undefined;
}) {
  const [userId, setUserId] = useState("");
  const fiscals = useQuery({
    queryKey: ["users", { role: "fiscal", status: "active" }], queryFn: () => listUsers({ role: "fiscal", status: "active" }), enabled: open,
  });
  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: open });
  const add = useAction(() => addCompanyFiscal(companyId, { user_id: Number(userId) }), {
    success: "Fiscal adicionado à empresa.",
    onSuccess: () => { onOpenChange(false); onAdded?.(); },
  });
  useEffect(() => { if (open) { setUserId(""); add.reset(); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const companyOf = (id?: number) => companies.data?.find((c) => c.id === id)?.name;
  const options = (fiscals.data ?? []).filter((u) => u.company_id !== companyId);
  const chosen = options.find((u) => u.id === Number(userId));
  const from = chosen?.company_id ? companyOf(chosen.company_id) : undefined;
  const loading = fiscals.isLoading || companies.isLoading;

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Adicionar fiscal já cadastrado" submitLabel="Adicionar"
      description={`Escolha a pessoa que vai fiscalizar os contratos de ${companyName}.`}
      pending={add.pending} onSubmit={() => void add.run()}>
      {fiscals.isLoading ? <LoadingBlock label="Carregando fiscais…" />
        : options.length === 0 ? <EmptyBlock title="Nenhuma pessoa com o perfil fiscal está cadastrada ainda." />
          : (
            <Field label="Fiscal" id="fp_user" error={add.fields["user_id"]} hint="Só aparecem pessoas ativas com o perfil fiscal.">
              <NativeSelect id="fp_user" autoFocus disabled={loading} value={userId} onChange={(ev) => setUserId(ev.target.value)}>
                <option value="">{loading ? "Carregando…" : "Escolha a pessoa"}</option>
                {options.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — {u.company_id ? `fiscal de ${companyOf(u.company_id) ?? "outra empresa"}` : "sem empresa"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
      {from && chosen && (
        <div role="alert" className="rounded-md border border-pending/30 bg-pending-soft p-3 text-sm text-foreground">
          <p className="font-medium">{chosen.name} vai deixar de ser fiscal de {from}.</p>
          <p className="mt-1">Os contratos de {from} que esta pessoa fiscaliza serão desvinculados. O histórico dela é mantido.</p>
        </div>
      )}
      <FormError error={add.error} />
    </FormDialog>
  );
}
