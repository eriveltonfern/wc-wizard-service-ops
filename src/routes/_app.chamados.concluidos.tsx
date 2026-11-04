import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { listTickets } from "@/lib/endpoints";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner } from "@/components/field/kit";
import { TicketCard } from "@/components/tickets/kit";

export const Route = createFileRoute("/_app/chamados/concluidos")({
  head: () => ({
    meta: [
      { title: "Chamados concluídos · WCCheck 2.0" },
      { name: "description", content: "Os chamados que você já concluiu." },
      { property: "og:title", content: "Chamados concluídos · WCCheck 2.0" },
      { property: "og:description", content: "Os chamados que você já concluiu." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DonePage,
});

function DonePage() {
  const q = useQuery({ queryKey: ["tickets", "mine-done"], queryFn: () => listTickets({ status: "done", mine: 1 }) });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PreviewBanner />
      <PageHelp>Aqui ficam os chamados que você concluiu, do mais recente para o mais antigo. Toque num chamado para ver a foto e a nota do reparo.</PageHelp>
      <PageHeader title="Concluídos" subtitle="Chamados que você já resolveu." />
      {q.isPending ? <SkeletonBlock rows={5} /> : q.isError ? <ErrorState message="Não foi possível carregar os chamados." onRetry={() => void q.refetch()} /> :
        q.data.length === 0 ? <EmptyState icon={CheckCheck} title="Você ainda não concluiu chamados." description="Quando concluir, eles aparecem aqui." /> : (
          <ul className="space-y-2">{q.data.map((t) => <li key={t.id}><TicketCard t={t} to /></li>)}</ul>
        )}
    </div>
  );
}
