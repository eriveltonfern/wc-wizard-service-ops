import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos · WCCheck 2.0" },
      { name: "description", content: "Lista dos contratos de limpeza e manutenção, com banheiros e equipes de cada um." },
      { property: "og:title", content: "Contratos · WCCheck 2.0" },
      { property: "og:description", content: "Lista dos contratos de limpeza e manutenção, com banheiros e equipes de cada um." },
    ],
  }),
  component: () => <PlaceholderPage title="Contratos" description="Lista dos contratos de limpeza e manutenção, com banheiros e equipes de cada um." />,
});
