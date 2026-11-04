import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/minhas-limpezas")({
  head: () => ({
    meta: [
      { title: "Minhas limpezas · WCCheck 2.0" },
      { name: "description", content: "Histórico das limpezas que você registrou." },
      { property: "og:title", content: "Minhas limpezas · WCCheck 2.0" },
      { property: "og:description", content: "Histórico das limpezas que você registrou." },
    ],
  }),
  component: () => <PlaceholderPage title="Minhas limpezas" description="Histórico das limpezas que você registrou." />,
});
