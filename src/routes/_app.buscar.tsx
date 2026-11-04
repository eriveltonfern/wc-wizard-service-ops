import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { listBathrooms } from "@/lib/endpoints";
import { useDebounced } from "@/hooks/use-debounced";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/buscar")({
  head: () => ({
    meta: [
      { title: "Buscar banheiro · WCCheck 2.0" },
      { name: "description", content: "Encontre um banheiro pelo nome ou local para registrar a limpeza." },
      { property: "og:title", content: "Buscar banheiro · WCCheck 2.0" },
      { property: "og:description", content: "Encontre um banheiro pelo nome ou local para registrar a limpeza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const r = useQuery({ queryKey: ["field", "search", dq], queryFn: () => listBathrooms({ q: dq, status: "active" }) });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHelp>Digite parte do nome do banheiro, do local ou do contrato. Não precisa de acento.</PageHelp>
      <PageHeader title="Buscar banheiro" subtitle="Encontre o banheiro e registre a limpeza." />
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar banheiro, local ou contrato"
          placeholder="Buscar banheiro, local ou contrato" className="h-14 pl-12 text-base" />
      </div>
      {r.isPending ? <SkeletonBlock rows={4} /> : r.isError ? <ErrorState message="Não foi possível buscar." onRetry={() => void r.refetch()} /> :
        r.data.rows.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum banheiro encontrado." description="Confira o nome ou tente só uma parte dele.">
            <Button variant="outline" className="h-12" onClick={() => setQ("")}>Limpar busca</Button>
          </EmptyState>
        ) : (
          <ul className="space-y-3" aria-label="Resultados">
            {r.data.rows.map((b) => (
              <li key={b.id} className="rounded-[10px] border bg-card p-4">
                <p className="font-bold text-ink">{b.name}</p>
                <p className="text-sm text-muted-foreground">{b.location?.name ?? "Sem local"} · {b.contract.code} – {b.contract.name}</p>
                <Button asChild className="mt-3 h-12 w-full">
                  <Link to="/registrar/$id" params={{ id: String(b.id) }}>Registrar limpeza</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
