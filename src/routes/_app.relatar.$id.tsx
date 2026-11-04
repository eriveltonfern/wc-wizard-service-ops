import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { ApiError } from "@/lib/api";
import { getCleaning, getCleaningForm } from "@/lib/endpoints";
import type { Ticket } from "@/lib/types";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { ErrorState, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { TicketForm } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";

type Search = { limpeza?: number | undefined; n?: number | undefined };

export const Route = createFileRoute("/_app/relatar/$id")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    const l = Number(s["limpeza"]); if (l > 0) out.limpeza = l;
    const n = Number(s["n"]); if (n >= 0 && Number.isInteger(n)) out.n = n;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Relatar problema · WCCheck 2.0" },
      { name: "description", content: "Abra um chamado de manutenção para o banheiro." },
      { property: "og:title", content: "Relatar problema · WCCheck 2.0" },
      { property: "og:description", content: "Abra um chamado de manutenção para o banheiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const { limpeza, n = 0 } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [created, setCreated] = useState<Ticket | null>(null);
  const form = useQuery({ queryKey: ["field", "form", Number(id)], queryFn: () => getCleaningForm(Number(id)), retry: false });
  const cleaning = useQuery({ queryKey: ["field", "cleaning", limpeza], queryFn: () => getCleaning(limpeza!), enabled: !!limpeza });
  const suggestions = cleaning.data?.ticket_suggestions ?? [];
  const sug = limpeza ? suggestions[n] : undefined;
  const remaining = limpeza ? suggestions.length - n - 1 : 0;
  const loading = form.isPending || (!!limpeza && cleaning.isPending);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PreviewBanner />
      <PageHelp>Conte o que está errado no banheiro. A manutenção recebe o chamado e você acompanha o andamento em "Minhas limpezas", na aba "Meus chamados".</PageHelp>
      <Button variant="outline" className="h-12 px-3" onClick={() => router.history.back()}><ArrowLeft className="h-5 w-5" />Voltar</Button>
      {created ? (
        <div className="flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><Check className="h-9 w-9" strokeWidth={3} /></span>
          <h1 className="text-xl font-extrabold text-ink">Chamado {created.code} aberto</h1>
          <p className="text-sm text-muted-foreground">{created.bathroom.name} · a manutenção já pode ver.</p>
          <div className="grid w-full gap-2">
            {remaining > 0 && (
              <Button className="h-12 w-full" onClick={() => { setCreated(null); void navigate({ to: "/relatar/$id", params: { id }, search: { limpeza, n: n + 1 } }); }}>
                Abrir o próximo chamado ({remaining})
              </Button>
            )}
            <Button asChild variant={remaining > 0 ? "outline" : "default"} className="h-12 w-full"><Link to="/minhas-limpezas" search={{ aba: "chamados" }}>Ver meus chamados</Link></Button>
            <Button asChild variant="outline" className="h-12 w-full"><Link to="/hoje">Voltar para Hoje</Link></Button>
          </div>
        </div>
      ) : (
        <>
          <PageHeader title="Relatar problema" subtitle={sug ? `Item do checklist: ${sug.label}` : "Abra um chamado para a manutenção."} />
          {loading ? <SkeletonBlock rows={5} /> : form.isError ? (
            <ErrorState message={form.error instanceof ApiError ? form.error.message : "Não foi possível abrir este banheiro."} onRetry={() => void form.refetch()} />
          ) : (
            <TicketForm key={`${limpeza ?? 0}-${n}`} cleaningId={limpeza} showPriority
              bathroom={{ id: form.data.bathroom.id, name: form.data.bathroom.name, detail: `${form.data.bathroom.location ?? "Sem local"} · ${form.data.contract.code}` }}
              initial={sug ? { category: sug.category, description: sug.description } : undefined}
              onDone={(t) => { void qc.invalidateQueries({ queryKey: ["tickets"] }); setCreated(t); }} />
          )}
        </>
      )}
    </div>
  );
}
