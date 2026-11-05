// Peças visuais do padrão de layout (docs/design/layout-padrao.md). Só tokens de cor.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ImageOff, Inbox, RefreshCw, type LucideIcon } from "lucide-react";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Tone = "danger" | "warning" | "info" | "success" | "neutral";

const toneText: Record<Tone, string> = {
  danger: "text-danger", warning: "text-pending", info: "text-primary", success: "text-success", neutral: "text-ink",
};
const toneBar: Record<Tone, string> = {
  danger: "bg-danger", warning: "bg-pending", info: "bg-primary", success: "bg-success", neutral: "bg-neutral",
};
const pillTone: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger", warning: "bg-pending-soft text-pending", info: "bg-info-soft text-info",
  success: "bg-success-soft text-success", neutral: "bg-neutral-soft text-neutral",
};

/** Selo-pílula com bolinha. */
export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", pillTone[tone], className)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const statusTone: Record<string, Tone> = { active: "success", draft: "info", suspended: "warning", ended: "neutral", inactive: "neutral" };
export function StatusBadge({ status }: { status: string }) {
  return <Pill tone={statusTone[status] ?? "neutral"}>{statusLabel(status)}</Pill>;
}

export function KpiCard({ label, value, caption, tone = "neutral", to, search }: {
  label: string; value: ReactNode; caption?: ReactNode; tone?: Tone; to?: string; search?: Record<string, string>;
}) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute left-4 top-0 h-1 w-8 rounded-b", toneBar[tone])} />
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("mt-1 block text-[28px] font-extrabold leading-tight tabular-nums", toneText[tone])}>{value}</span>
      {caption && <span className="block text-xs text-muted-foreground">{caption}</span>}
    </>
  );
  const cls = "relative block rounded-[10px] border bg-card p-4 pt-5";
  if (to) {
    return (
      <Link to={to} search={search as never} className={cn(cls, "transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{children}</div>;
}

export function AttentionList({ title, count, children, footer, empty }: {
  title: string; count?: number; children?: ReactNode; footer?: ReactNode; empty?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {count !== undefined && <span className="text-sm font-semibold tabular-nums text-muted-foreground">{count}</span>}
      </header>
      {count === 0 && empty ? <div className="px-4 py-8">{empty}</div> : <ul className="divide-y">{children}</ul>}
      {footer && <footer className="border-t px-4 py-3 text-sm text-muted-foreground">{footer}</footer>}
    </section>
  );
}

export function AttentionRow({ name, detail, progress, pills, to, params, search }: {
  name: ReactNode; detail?: ReactNode; progress?: { value: number; tone?: Tone }; pills?: ReactNode; to?: string; params?: Record<string, string>; search?: Record<string, unknown>;
}) {
  const inner = (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm"><span className="font-bold text-ink">{name}</span>{detail && <span className="text-muted-foreground"> · {detail}</span>}</p>
        {progress && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", toneBar[progress.tone ?? "info"])} style={{ width: `${Math.max(0, Math.min(100, progress.value))}%` }} />
          </div>
        )}
      </div>
      {pills && <div className="flex flex-wrap gap-1.5 sm:justify-end">{pills}</div>}
    </div>
  );
  return (
    <li>
      {to ? <Link to={to} params={params as never} search={search as never} className="block min-h-12 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{inner}</Link> : inner}
    </li>
  );
}

/** Tabela/lista dentro de cartão branco. */
export function DataCard({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-[10px] border bg-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, children }: { title: string; description?: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed bg-card px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-info-soft text-primary"><Icon className="h-6 w-6" /></span>
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: (() => void) | undefined }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[10px] border bg-card px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger"><AlertTriangle className="h-6 w-6" /></span>
      <p className="text-sm font-semibold text-ink">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry}><RefreshCw className="h-4 w-4" />Tentar de novo</Button>}
    </div>
  );
}

export function SkeletonBlock({ label = "Carregando…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 rounded-[10px] border bg-card p-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 flex-1 animate-pulse rounded bg-secondary" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-secondary" />
        </div>
      ))}
    </div>
  );
}

/** Quadro cinza no lugar de uma foto apagada pela regra dos 60 dias. */
export function PhotoDeleted({ className }: { className?: string }) {
  return (
    <div className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[10px] border bg-neutral-soft p-4 text-center text-sm text-muted-foreground", className)}>
      <ImageOff className="h-6 w-6" aria-hidden />
      Foto apagada após 60 dias (regra do sistema)
    </div>
  );
}
