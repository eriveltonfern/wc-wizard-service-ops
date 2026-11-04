import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Toilet } from "lucide-react";
import { listBathrooms } from "@/lib/endpoints";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({
    meta: [
      { title: "Painel · WCCheck 2.0" },
      { name: "description", content: "Visão geral dos contratos, limpezas do dia e chamados em aberto." },
      { property: "og:title", content: "Painel · WCCheck 2.0" },
      { property: "og:description", content: "Visão geral dos contratos, limpezas do dia e chamados em aberto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelPage,
});

function PainelPage() {
  const active = useQuery({ queryKey: ["bathrooms", "active-count"], queryFn: () => listBathrooms({ status: "active" }) });
  const n = active.data?.total;
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-4xl">
        <Link to="/banheiros" className="flex min-h-20 items-center gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary"><Toilet className="h-6 w-6" /></span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-muted-foreground">Banheiros ativos</span>
            <span className="block text-3xl font-bold text-foreground">
              {active.isLoading ? "…" : active.isError ? "—" : n ?? "—"}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">Ver banheiros<ChevronRight className="h-4 w-4" /></span>
        </Link>
      </div>
      <PlaceholderPage title="Painel" description="Visão geral dos contratos, limpezas do dia e chamados em aberto." />
    </div>
  );
}
