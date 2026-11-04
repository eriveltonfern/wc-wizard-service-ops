import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/etiquetas")({
  head: () => ({
    meta: [
      { title: "Etiquetas · WCCheck 2.0" },
      { name: "description", content: "Geração e impressão das etiquetas QR dos banheiros." },
      { property: "og:title", content: "Etiquetas · WCCheck 2.0" },
      { property: "og:description", content: "Geração e impressão das etiquetas QR dos banheiros." },
    ],
  }),
  component: () => <PlaceholderPage title="Etiquetas" description="Geração e impressão das etiquetas QR dos banheiros." />,
});
