import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/PlaceholderPage";

export const Route = createFileRoute("/_app/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas · WCCheck 2.0" },
      { name: "description", content: "Cadastro das empresas clientes atendidas pela WCCheck." },
      { property: "og:title", content: "Empresas · WCCheck 2.0" },
      { property: "og:description", content: "Cadastro das empresas clientes atendidas pela WCCheck." },
    ],
  }),
  component: () => <PlaceholderPage title="Empresas" description="Cadastro das empresas clientes atendidas pela WCCheck." />,
});
