import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/ler-qr")({
  head: () => ({
    meta: [
      { title: "Ler QR · WCCheck 2.0" },
      { name: "description", content: "Aponte a câmera para a etiqueta do banheiro para começar a limpeza." },
      { property: "og:title", content: "Ler QR · WCCheck 2.0" },
      { property: "og:description", content: "Aponte a câmera para a etiqueta do banheiro para começar a limpeza." },
    ],
  }),
  component: () => <PlaceholderPage title="Ler QR" description="Aponte a câmera para a etiqueta do banheiro para começar a limpeza." />,
});
