import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/buscar")({
  head: () => ({
    meta: [
      { title: "Buscar banheiro · WCCheck 2.0" },
      { name: "description", content: "Encontre um banheiro pelo nome ou local para registrar a limpeza." },
      { property: "og:title", content: "Buscar banheiro · WCCheck 2.0" },
      { property: "og:description", content: "Encontre um banheiro pelo nome ou local para registrar a limpeza." },
    ],
  }),
  component: () => <PlaceholderPage title="Buscar banheiro" description="Encontre um banheiro pelo nome ou local para registrar a limpeza." />,
});
