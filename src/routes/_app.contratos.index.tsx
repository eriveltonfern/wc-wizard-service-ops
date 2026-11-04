import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHelp, PageHeader } from "@/components/layout/PageHeader";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { listContracts } from "@/lib/endpoints";
import { isAdminRole, meQuery } from "@/lib/auth";
import { contractStatusLabel, fmtPeriod, normalize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContractForm } from "@/components/contracts/ContractForm";
import { EmptyBlock, ErrorBlock, LoadingBlock, NativeSelect, StatusBadge } from "@/components/contracts/kit";

export const Route = createFileRoute("/_app/contratos/")({
  head: () => ({
    meta: [
      { title: "Contratos · WCCheck 2.0" },
      { name: "description", content: "Lista dos contratos de limpeza e manutenção, com banheiros e equipes de cada um." },
      { property: "og:title", content: "Contratos · WCCheck 2.0" },
      { property: "og:description", content: "Lista dos contratos de limpeza e manutenção, com banheiros e equipes de cada um." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const isAdmin = isAdminRole(me.role);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["contracts", { status }], queryFn: () => listContracts(status ? { status } : undefined) });

  const rows = useMemo(() => {
    const n = normalize(q.trim());
    return (query.data ?? []).filter((c) => !n || normalize(`${c.code} ${c.name} ${c.company.name}`).includes(n));
  }, [query.data, q]);

  const createButton = isAdmin && (
    <Button className="min-h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo contrato</Button>
  );

  return (
    <div className="space-y-6">
      <PageHelp>Aqui ficam todos os contratos que você pode ver. Use a busca para achar pelo código, nome ou empresa e o filtro para ver só rascunhos, ativos, suspensos ou encerrados. Clique numa linha para abrir o contrato.</PageHelp>
      <PageHeader title="Contratos" subtitle="Contratos de limpeza e manutenção, com banheiros e equipes." actions={createButton} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar por código, nome ou empresa" placeholder="Buscar por código, nome ou empresa"
            className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect aria-label="Filtrar por situação" className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas as situações</option>
          {Object.entries(contractStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </NativeSelect>
      </div>

      {query.isLoading ? <LoadingBlock label="Carregando contratos…" />
        : query.isError ? <ErrorBlock message="Não foi possível carregar os contratos." onRetry={() => void query.refetch()} />
        : (query.data?.length ?? 0) === 0 && !status ? <EmptyBlock title="Nenhum contrato ainda.">{createButton}</EmptyBlock>
        : rows.length === 0 ? <EmptyBlock title="Nenhum contrato encontrado com esses filtros." />
        : (
          <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to="/contratos/$id" params={{ id: String(c.id) }}
                  className="grid gap-2 px-4 py-4 hover:bg-secondary/60 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{c.code}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 font-semibold text-foreground">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.company.name} · Gestor: {c.manager?.name ?? "não definido"} · {fmtPeriod(c.starts_on, c.ends_on)}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground md:text-right">
                    <span><strong className="text-foreground">{c.counts.bathrooms}</strong> banheiros</span>
                    <span><strong className="text-foreground">{c.counts.teams}</strong> equipes</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

      {isAdmin && (
        <ContractForm open={creating} onOpenChange={setCreating} isAdmin
          onSaved={(c) => navigate({ to: "/contratos/$id", params: { id: String(c.id) } })} />
      )}
    </div>
  );
}
