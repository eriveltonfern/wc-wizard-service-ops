import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHelp, PageHeader } from "@/components/layout/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { listCompanies } from "@/lib/endpoints";
import { normalize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyForm } from "@/components/people/CompanyForm";
import { Pill } from "@/components/ui-kit";
import { EmptyBlock, ErrorBlock, LoadingBlock, StatusBadge } from "@/components/contracts/kit";

export const Route = createFileRoute("/_app/empresas/")({
  head: () => ({
    meta: [
      { title: "Empresas · WCCheck 2.0" },
      { name: "description", content: "Empresas contratantes, com seus contratos e fiscais." },
      { property: "og:title", content: "Empresas · WCCheck 2.0" },
      { property: "og:description", content: "Empresas contratantes, com seus contratos e fiscais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["companies"], queryFn: listCompanies });
  const rows = useMemo(() => {
    const n = normalize(q.trim());
    return (query.data ?? []).filter((c) => !n || normalize(`${c.name} ${c.document ?? ""} ${c.contact_name ?? ""}`).includes(n));
  }, [query.data, q]);
  const createBtn = <Button className="min-h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova empresa</Button>;

  return (
    <div className="space-y-6">
      <PageHelp>Empresas que contratam a WC Check. Clique numa empresa para ver os contratos, cadastrar fiscais, editar, inativar ou excluir.</PageHelp>
      <PageHeader title="Empresas" subtitle="Empresas contratantes, com seus contratos e fiscais." actions={createBtn} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Buscar empresa" placeholder="Buscar por nome, CNPJ ou contato" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {query.isLoading ? <LoadingBlock label="Carregando empresas…" />
        : query.isError ? <ErrorBlock message="Não foi possível carregar as empresas." onRetry={() => void query.refetch()} />
        : !query.data?.length ? <EmptyBlock title="Nenhuma empresa ainda.">{createBtn}</EmptyBlock>
        : !rows.length ? <EmptyBlock title="Nenhuma empresa encontrada." />
        : (
          <ul className="divide-y overflow-hidden rounded-[10px] border bg-card">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to="/empresas/$id" params={{ id: String(c.id) }} className="grid gap-2 px-4 py-4 hover:bg-secondary/60 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-foreground">{c.name}</span><StatusBadge status={c.status} />{c.fiscals_count === 0 && <Pill tone="danger">Sem fiscal</Pill>}</div>
                    <p className="text-sm text-muted-foreground">
                      {c.document ? `CNPJ ${c.document}` : "Sem CNPJ"} · {c.contact_name ? `${c.contact_name}${c.contact_phone ? ` · ${c.contact_phone}` : ""}` : "Sem contato"}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span><strong className="text-foreground">{c.contracts_count}</strong> contratos</span>
                    <span><strong className="text-foreground">{c.fiscals_count}</strong> fiscais</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      <CompanyForm open={creating} onOpenChange={setCreating} />
    </div>
  );
}
