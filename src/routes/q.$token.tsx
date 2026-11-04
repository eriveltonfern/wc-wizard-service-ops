import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ApiError, getToken } from "@/lib/api";
import { lookupQr } from "@/lib/endpoints";
import { canAccess, homeFor, meQuery } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/q/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Etiqueta do banheiro · WCCheck 2.0" },
      { name: "description", content: "Abrindo o banheiro da etiqueta para registrar a limpeza." },
      { property: "og:title", content: "Etiqueta do banheiro · WCCheck 2.0" },
      { property: "og:description", content: "Abrindo o banheiro da etiqueta para registrar a limpeza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async ({ context, params }) => {
    const back = `/q/${encodeURIComponent(params.token)}`;
    if (!getToken()) throw redirect({ to: "/login", search: { redirect: back } });
    try { await context.queryClient.ensureQueryData(meQuery); } catch { throw redirect({ to: "/login", search: { redirect: back } }); }
  },
  component: QrRedirect,
});

function QrRedirect() {
  const { token } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    lookupQr(token).then((r) => {
      const id = String(r.bathroom_id);
      if (canAccess(me.role, "/registrar")) navigate({ to: "/registrar/$id", params: { id }, replace: true });
      else if (me.role === "manutencao") navigate({ to: "/chamados", search: { f: "todos", banheiro: Number(id) }, replace: true });
      else if (canAccess(me.role, "/banheiros")) navigate({ to: "/banheiros/$id", params: { id }, replace: true });
      else navigate({ to: homeFor(me.role), replace: true });
    }).catch((e) => setError(e instanceof ApiError && e.status === 404 ? "Etiqueta não encontrada ou de um contrato que não é seu." : "Não foi possível abrir a etiqueta."));
  }, [token, me.role, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {error ? (
        <div role="alert" className="max-w-sm space-y-4 rounded-[10px] border bg-card p-6 text-center">
          <p className="font-semibold text-ink">{error}</p>
          <Button asChild className="h-12 w-full"><Link to="/">Ir para o início</Link></Button>
        </div>
      ) : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Abrindo o banheiro…</p>}
    </div>
  );
}
