import { Construction } from "lucide-react";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui-kit";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <PageHelp>{description} Esta tela será liberada nas próximas entregas.</PageHelp>
      <PageHeader title={title} subtitle={description} />
      <EmptyState icon={Construction} title="Em construção nesta etapa" description="Esta tela será liberada nas próximas entregas do WCCheck 2.0." />
    </div>
  );
}
