import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/chamados")({
  head: () => ({
    meta: [
      { title: "Chamados · WCCheck 2.0" },
      { name: "description", content: "Pedidos de manutenção abertos, em andamento e resolvidos." },
      { property: "og:title", content: "Chamados · WCCheck 2.0" },
      { property: "og:description", content: "Pedidos de manutenção abertos, em andamento e resolvidos." },
    ],
  }),
  component: () => <PlaceholderPage title="Chamados" description="Pedidos de manutenção abertos, em andamento e resolvidos." />,
});
