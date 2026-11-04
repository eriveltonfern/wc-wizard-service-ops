// Moldura das telas autenticadas: sidebar navy 248px, topbar branca 56px, conteúdo centralizado.
import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Check, HelpCircle, KeyRound, LogOut, Menu } from "lucide-react";
import type { NavGroup, User } from "@/lib/auth";
import { roleLabel } from "@/lib/auth";
import { fmtDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { HelpProvider, usePageHelp } from "./PageHeader";

export function BrandLogo({ onDark = true }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Check className="h-5 w-5" strokeWidth={3} />
      </span>
      <span className={cn("text-lg font-extrabold tracking-tight", onDark ? "text-sidebar-primary-foreground" : "text-ink")}>WC Check</span>
    </span>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground", className)}>
      {initials(name)}
    </span>
  );
}

function SidebarBody({ user, groups, onLogout, onNavigate }: { user: User; groups: NavGroup[]; onLogout: () => void; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center px-5"><BrandLogo /></div>
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-sidebar-context px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground">
        <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
        WC Check Operações
      </div>
      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label} className="mt-4">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-group">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = path === i.to || path.startsWith(i.to + "/");
                return (
                  <li key={i.to}>
                    <Link to={i.to} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        active ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                      <i.icon className="h-[18px] w-[18px] shrink-0" />{i.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-sidebar-primary-foreground">{user.name}</p>
          <p className="truncate text-xs text-sidebar-group">{roleLabel[user.role]}</p>
        </div>
        <button type="button" onClick={onLogout} aria-label="Sair"
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function HelpButton() {
  const { open, setOpen } = usePageHelp();
  return (
    <button type="button" aria-label="Ajuda desta tela" aria-pressed={open}
      onClick={() => { setOpen(!open); document.getElementById("ajuda-da-tela")?.scrollIntoView({ block: "nearest" }); }}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}

export function AppShell({ user, groups, onLogout, onChangePassword, children, bottomNav }: {
  user: User; groups: NavGroup[]; onLogout: () => void; onChangePassword: () => void; children: ReactNode; bottomNav?: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const notifications = 0;
  return (
    <HelpProvider resetKey={path}>
      <div className="min-h-screen bg-background">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block print:hidden">
          <SidebarBody user={user} groups={groups} onLogout={onLogout} />
        </aside>
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetContent side="left" className="w-[248px] border-0 p-0 [&>button]:text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody user={user} groups={groups} onLogout={onLogout} onNavigate={() => setDrawer(false)} />
          </SheetContent>
        </Sheet>
        <div className="lg:pl-[248px] print:pl-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card px-3 sm:px-6 print:hidden">
            <button type="button" aria-label="Abrir menu" onClick={() => setDrawer(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-ink hover:bg-secondary lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">{fmtDate(todayIso())}</span>
            <div className="ml-auto flex items-center gap-1">
              <HelpButton />
              <button type="button" aria-label={`Avisos: ${notifications}`}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-ink">
                <Bell className="h-5 w-5" />
                {notifications > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold text-destructive-foreground">{notifications}</span>}
              </button>
              <button type="button" onClick={onChangePassword} aria-label="Trocar senha"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-ink">
                <KeyRound className="h-5 w-5" />
              </button>
              <span title={`${user.name} · ${roleLabel[user.role]}`}><Avatar name={user.name} className="ml-1" /></span>
            </div>
          </header>
          <main className={cn("mx-auto w-full max-w-[1220px] px-4 py-5 sm:px-8 sm:py-8 print:max-w-none print:p-0", bottomNav && "pb-28 lg:pb-8")}>
            {children}
          </main>
        </div>
        {bottomNav}
      </div>
    </HelpProvider>
  );
}
