import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({
    meta: [
      { title: "Painel · WCCheck 2.0" },
      { name: "description", content: "Visão geral dos contratos, limpezas do dia e chamados em aberto." },
      { property: "og:title", content: "Painel · WCCheck 2.0" },
      { property: "og:description", content: "Visão geral dos contratos, limpezas do dia e chamados em aberto." },
    ],
  }),
  component: () => <PlaceholderPage title="Painel" description="Visão geral dos contratos, limpezas do dia e chamados em aberto." />,
});
