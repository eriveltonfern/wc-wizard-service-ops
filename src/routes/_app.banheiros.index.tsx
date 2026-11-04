import { useEffect, useState } from "react";
import { PageHelp, PageHeader } from "@/components/layout/PageHeader";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { listBathrooms, listContracts } from "@/lib/endpoints";
import { canManageContracts, meQuery } from "@/lib/auth";
import { bathroomKindLabel, hasOwnPlan, planLabel } from "@/lib/format";
import type { Bathroom } from "@/lib/types";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyBlock, ErrorBlock, LoadingBlock, NativeSelect, StatusBadge } from "@/components/contracts/kit";
import { NewBathroomDialog } from "@/components/contracts/NewBathroomDialog";

type Search = { q?: string | undefined; contrato?: number | undefined; status?: "active" | "inactive" | "todos" | undefined };

export const Route = createFileRoute("/_app/banheiros/")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s["q"] === "string" && s["q"]) out.q = s["q"];
    const c = Number(s["contrato"]); if (c > 0) out.contrato = c;
    if (s["status"] === "inactive" || s["status"] === "todos") out.status = s["status"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Banheiros · WCCheck 2.0" },
      { name: "description", content: "Encontre qualquer banheiro por nome, local ou contrato." },
      { property: "og:title", content: "Banheiros · WCCheck 2.0" },
      { property: "og:description", content: "Encontre qualquer banheiro por nome, local ou contrato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BathroomsPage,
});

function PlanCell({ b }: { b: Bathroom }) {
  return hasOwnPlan(b) ? <>{planLabel(b.effective_plan)}</> : <span className="text-muted-foreground">Padrão do contrato <span className="text-xs">({planLabel(b.effective_plan)})</span></span>;
}

function BathroomsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const canManage = canManageContracts(me.role);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/banheiros/" });
  const status = search.status ?? "active";
  const [q, setQ] = useState(search.q ?? "");
  const dq = useDebounced(q.trim(), 300);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if ((search.q ?? "") !== dq) void navigate({ search: (p) => ({ ...p, q: dq || undefined }), replace: true });
  }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps

  const contracts = useQuery({ queryKey: ["contracts", "bathroom-filter"], queryFn: () => listContracts() });
  const query = useQuery({
    queryKey: ["bathrooms", "all", dq, search.contrato ?? null, status],
    queryFn: () => listBathrooms({ ...(dq ? { q: dq } : {}), ...(search.contrato ? { contract_id: search.contrato } : {}), ...(status !== "todos" ? { status } : {}) }),
  });
  const filtered = !!dq || !!search.contrato || status !== "active";
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const limit = query.data?.limit ?? 50;

  return (
    <div className="space-y-5">
      <PageHelp>Encontre qualquer banheiro digitando o nome, o local ou o contrato (não precisa de acento). Filtre por contrato ou situação e clique no banheiro para ver o QR, as interdições e as ações.</PageHelp>
      <PageHeader title="Banheiros" subtitle="Encontre qualquer banheiro de todos os contratos." actions={canManage && <Button className="min-h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo banheiro</Button>} />

      <div className="space-y-3 rounded-[10px] border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus aria-label="Buscar banheiro, local ou contrato" placeholder="Buscar banheiro, local ou contrato"
            className="h-14 pl-12 text-lg" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NativeSelect aria-label="Filtrar por contrato" value={search.contrato ? String(search.contrato) : ""}
            onChange={(e) => void navigate({ search: (p) => ({ ...p, contrato: e.target.value ? Number(e.target.value) : undefined }) })}>
            <option value="">Todos os contratos</option>
            {contracts.data?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Filtrar por situação" value={status}
            onChange={(e) => void navigate({ search: (p) => ({ ...p, status: e.target.value === "active" ? undefined : (e.target.value as Search["status"]) }) })}>
            <option value="active">Ativos</option><option value="inactive">Inativos</option><option value="todos">Todos</option>
          </NativeSelect>
        </div>
      </div>

      {query.isLoading ? <LoadingBlock label="Buscando banheiros…" />
        : query.isError ? <ErrorBlock message="Não foi possível carregar os banheiros." onRetry={() => void query.refetch()} />
        : rows.length === 0 ? (
          filtered
            ? <EmptyBlock title={dq ? `Nenhum banheiro encontrado para “${dq}”.` : "Nenhum banheiro encontrado com estes filtros."} />
            : <EmptyBlock title="Nenhum banheiro cadastrado ainda.">{canManage && <Button className="min-h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo banheiro</Button>}</EmptyBlock>
        ) : (
          <>
            {total > limit && <p role="status" className="rounded-md border border-pending/30 bg-pending-soft px-3 py-2 text-sm font-medium text-foreground">Mostrando {limit} de {total}. Refine a busca.</p>}
            <div className="hidden overflow-x-auto rounded-[10px] border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Banheiro</th><th className="px-4 py-3">Local</th><th className="px-4 py-3">Contrato</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Andar</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Situação</th></tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3"><Link to="/banheiros/$id" params={{ id: String(b.id) }} className="text-base font-semibold text-primary hover:underline">{b.name}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{b.location?.name ?? "—"}</td>
                      <td className="px-4 py-3"><Link to="/contratos/$id" params={{ id: String(b.contract.id) }} className="hover:underline">{b.contract.code} · {b.contract.name}</Link></td>
                      <td className="px-4 py-3">{bathroomKindLabel[b.kind]}</td>
                      <td className="px-4 py-3">{b.floor ?? "—"}</td>
                      <td className="px-4 py-3"><PlanCell b={b} /></td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {rows.map((b) => (
                <li key={b.id} className="rounded-[10px] border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to="/banheiros/$id" params={{ id: String(b.id) }} className="flex min-h-11 items-center text-lg font-semibold text-primary">{b.name}</Link>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">{[b.location?.name, b.floor && `Andar ${b.floor}`, bathroomKindLabel[b.kind]].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-sm"><PlanCell b={b} /></p>
                  <Link to="/contratos/$id" params={{ id: String(b.contract.id) }} className="mt-1 inline-flex min-h-11 items-center text-sm text-primary hover:underline">{b.contract.code} · {b.contract.name}</Link>
                </li>
              ))}
            </ul>
          </>
        )}

      {creating && <NewBathroomDialog initialContract={search.contrato} onClose={() => setCreating(false)} />}
    </div>
  );
}
