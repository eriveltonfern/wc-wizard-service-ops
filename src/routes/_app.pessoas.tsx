import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/pessoas")({
  head: () => ({
    meta: [
      { title: "Pessoas · WCCheck 2.0" },
      { name: "description", content: "Colaboradores, equipes e acessos ao sistema." },
      { property: "og:title", content: "Pessoas · WCCheck 2.0" },
      { property: "og:description", content: "Colaboradores, equipes e acessos ao sistema." },
    ],
  }),
  component: () => <PlaceholderPage title="Pessoas" description="Colaboradores, equipes e acessos ao sistema." />,
});
