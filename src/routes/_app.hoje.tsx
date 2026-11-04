import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje · WCCheck 2.0" },
      { name: "description", content: "Banheiros que você precisa limpar hoje." },
      { property: "og:title", content: "Hoje · WCCheck 2.0" },
      { property: "og:description", content: "Banheiros que você precisa limpar hoje." },
    ],
  }),
  component: () => <PlaceholderPage title="Hoje" description="Banheiros que você precisa limpar hoje." />,
});
