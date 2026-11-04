import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência · WCCheck 2.0" },
      { name: "description", content: "Conferência das limpezas registradas pelas equipes de campo." },
      { property: "og:title", content: "Conferência · WCCheck 2.0" },
      { property: "og:description", content: "Conferência das limpezas registradas pelas equipes de campo." },
    ],
  }),
  component: () => <PlaceholderPage title="Conferência" description="Conferência das limpezas registradas pelas equipes de campo." />,
});
