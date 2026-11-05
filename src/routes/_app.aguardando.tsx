import { createFileRoute } from "@tanstack/react-router";

// Tela inicial do perfil de campo enquanto o módulo dele está desligado (o layout _app mostra o aviso).
export const Route = createFileRoute("/_app/aguardando")({
  head: () => ({
    meta: [
      { title: "Acesso em breve · WCCheck 2.0" },
      { name: "description", content: "Seu acesso ao app será liberado em breve." },
      { property: "og:title", content: "Acesso em breve · WCCheck 2.0" },
      { property: "og:description", content: "Seu acesso ao app será liberado em breve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
