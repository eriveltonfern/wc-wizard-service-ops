import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getContract, listContracts } from "@/lib/endpoints";
import { BathroomForm } from "./BathroomsTab";
import { Field, FormDialog, LoadingBlock, NativeSelect } from "./kit";

/** "Novo banheiro" fora do contrato: escolhe o contrato e abre o mesmo formulário da aba Banheiros. */
export function NewBathroomDialog({ onClose, initialContract }: { onClose: () => void; initialContract?: number | undefined }) {
  const contracts = useQuery({ queryKey: ["contracts", "bathroom-picker"], queryFn: () => listContracts() });
  const [pick, setPick] = useState(initialContract ? String(initialContract) : "");
  const [chosen, setChosen] = useState<number | null>(null);
  const contract = useQuery({ queryKey: ["contract", chosen], queryFn: () => getContract(chosen!), enabled: chosen !== null });

  if (chosen !== null) {
    if (contract.data) return <BathroomForm contract={contract.data} onClose={onClose} />;
    return <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo banheiro" submitLabel="Continuar" pending onSubmit={() => {}}><LoadingBlock /></FormDialog>;
  }
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo banheiro" description="Primeiro, escolha o contrato do banheiro."
      submitLabel="Continuar" onSubmit={() => { if (pick) setChosen(Number(pick)); }}>
      <Field label="Contrato" id="nb_contract" error={undefined}>
        <NativeSelect id="nb_contract" autoFocus required value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{contracts.isLoading ? "Carregando…" : "Escolha o contrato"}</option>
          {contracts.data?.filter((c) => c.status !== "ended").map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}
