import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Liga o "?" da topbar à faixa de ajuda da tela. */
type HelpCtx = { open: boolean; setOpen: (o: boolean) => void };
const Ctx = createContext<HelpCtx>({ open: false, setOpen: () => {} });
export function HelpProvider({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [resetKey]);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}
export const usePageHelp = () => useContext(Ctx);

export function PageHelp({ children }: { children: ReactNode }) {
  const { open, setOpen } = usePageHelp();
  return (
    <div id="ajuda-da-tela" className="rounded-[10px] border border-info-border bg-info-soft print:hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-4 py-2 text-left text-sm font-semibold text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1">Ajuda desta tela</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-3 pl-10 text-sm text-ink">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
