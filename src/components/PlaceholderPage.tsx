import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>
      <p className="mt-1 text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
          <Construction className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">Em construção nesta etapa</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Esta tela será liberada nas próximas entregas do WCCheck 2.0.
        </p>
      </div>
    </div>
  );
}
