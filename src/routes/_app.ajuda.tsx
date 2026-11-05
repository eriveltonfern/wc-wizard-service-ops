import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { meQuery, navByRole, roleLabel } from "@/lib/auth";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { DataCard } from "@/components/ui-kit";

export const Route = createFileRoute("/_app/ajuda")({
  head: () => ({
    meta: [
      { title: "Ajuda · WCCheck 2.0" },
      { name: "description", content: "Como usar o WCCheck 2.0: o que cada tela do menu faz." },
      { property: "og:title", content: "Ajuda · WCCheck 2.0" },
      { property: "og:description", content: "Como usar o WCCheck 2.0: o que cada tela do menu faz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AjudaPage,
});

const about: Record<string, string> = {
  "/painel": "Resumo do dia e o que precisa de atenção.",
  "/contratos": "Contratos, com banheiros, equipes e regras.",
  "/banheiros": "Busca de qualquer banheiro e seu QR.",
  "/empresas": "Empresas contratantes e seus fiscais.",
  "/pessoas": "Pessoas com acesso, equipes e histórico.",
  "/etiquetas": "Impressão das etiquetas com QR para os usuários avaliarem o banheiro.",
  "/avaliacoes": "Notas que os usuários dão aos banheiros pelo QR.",
};

function AjudaPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const items = navByRole[me.role].filter((i) => about[i.to]);
  return (
    <div className="space-y-6">
      <PageHelp>Em toda tela, clique em "Ajuda desta tela" (ou no "?" no topo) para ver como ela funciona.</PageHelp>
      <PageHeader title="Ajuda" subtitle={`O que você pode fazer com o perfil ${roleLabel[me.role]}.`} />
      <DataCard title="Telas do seu menu">
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.to} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
              <i.icon className="h-5 w-5 shrink-0 text-primary" />
              <span className="font-bold text-ink">{i.title}</span>
              <span className="text-muted-foreground">· {about[i.to]}</span>
            </li>
          ))}
        </ul>
      </DataCard>
    </div>
  );
}
