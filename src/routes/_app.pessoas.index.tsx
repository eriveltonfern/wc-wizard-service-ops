import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { listCompanies, listContracts, listTeams, listUsers } from "@/lib/endpoints";
import { creatableRoles, meQuery, roleLabel } from "@/lib/auth";
import { normalize } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TempPasswordDialog, UserForm } from "@/components/people/UserForm";
import { EmptyBlock, ErrorBlock, LoadingBlock, NativeSelect, StatusBadge } from "@/components/contracts/kit";

export const Route = createFileRoute("/_app/pessoas/")({
  head: () => ({
    meta: [
      { title: "Pessoas · WCCheck 2.0" },
      { name: "description", content: "Pessoas cadastradas: diretoria, gestores, fiscais e equipes de campo." },
      { property: "og:title", content: "Pessoas · WCCheck 2.0" },
      { property: "og:description", content: "Pessoas cadastradas: diretoria, gestores, fiscais e equipes de campo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PeoplePage,
});

/** Equipes atuais de cada pessoa, montadas a partir das equipes dos contratos visíveis. */
function useCurrentTeams() {
  return useQuery({
    queryKey: ["current-teams"],
    queryFn: async () => {
      const contracts = await listContracts();
      const lists = await Promise.all(contracts.map((c) => listTeams(c.id)));
      const map = new Map<number, string[]>();
      lists.flat().filter((t) => t.status === "active").forEach((t) => t.members.forEach((m) => map.set(m.user_id, [...(map.get(m.user_id) ?? []), t.name])));
      return map;
    },
  });
}

function PeoplePage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const roles = creatableRoles(me.role);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<{ user: User; password: string } | null>(null);
  const dq = useDebounced(q, 250);
  const query = useQuery({ queryKey: ["users", { role, status }], queryFn: () => listUsers({ role, status }) });
  const teams = useCurrentTeams();
  const companies = useQuery({ queryKey: ["companies"], queryFn: listCompanies, enabled: me.role === "admin" });
  const companyName = (id?: number) => companies.data?.find((c) => c.id === id)?.name ?? (id ? `Empresa ${id}` : "—");
  const rows = useMemo(() => {
    const n = normalize(dq.trim());
    return (query.data ?? []).filter((u) => !n || normalize(`${u.name} ${u.email}`).includes(n));
  }, [query.data, dq]);
  const createBtn = roles.length > 0 && <Button className="min-h-11" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova pessoa</Button>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Pessoas</h1>
          <p className="mt-1 text-muted-foreground">Diretoria, gestores, fiscais e equipes de campo.</p>
        </div>
        {createBtn}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar por nome ou e-mail" placeholder="Buscar por nome ou e-mail" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect aria-label="Filtrar por perfil" className="sm:w-48" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Todos os perfis</option>
          {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filtrar por situação" className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option>
        </NativeSelect>
      </div>

      {query.isLoading ? <LoadingBlock label="Carregando pessoas…" />
        : query.isError ? <ErrorBlock message="Não foi possível carregar as pessoas." onRetry={() => void query.refetch()} />
        : !rows.length ? <EmptyBlock title={q || role || status ? "Ninguém encontrado com esses filtros." : "Nenhuma pessoa cadastrada."}>{!q && !role && !status && createBtn}</EmptyBlock>
        : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((u) => {
              const t = teams.data?.get(u.id) ?? [];
              return (
                <li key={u.id}>
                  <Link to="/pessoas/$id" params={{ id: String(u.id) }} className="grid gap-1 px-4 py-3 hover:bg-secondary/60 md:grid-cols-[2fr_1fr_1.5fr_auto] md:items-center md:gap-4">
                    <div className="min-w-0"><p className="truncate font-medium text-foreground">{u.name}</p><p className="truncate text-sm text-muted-foreground">{u.email}</p></div>
                    <p className="text-sm">{roleLabel[u.role]}{u.role === "fiscal" && <span className="text-muted-foreground"> · {companyName(u.company_id)}</span>}</p>
                    <p className="text-sm text-muted-foreground">{t.length ? t.join(", ") : u.role === "limpeza" || u.role === "manutencao" ? "Sem equipe" : ""}</p>
                    <div><StatusBadge status={u.status} /></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      <UserForm open={creating} onOpenChange={setCreating} roles={roles} onCreated={(user, password) => setTemp({ user, password })} />
      <TempPasswordDialog data={temp} onClose={() => setTemp(null)} />
    </div>
  );
}
