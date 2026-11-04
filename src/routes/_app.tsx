import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { ChangePasswordDialog, ForcePasswordScreen } from "@/components/people/ChangePassword";
import { getToken, setToken } from "@/lib/api";
import { logout } from "@/lib/endpoints";
import { meQuery, navByRole, roleLabel, canAccess, homeFor, isFieldRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    if (!getToken()) throw redirect({ to: "/login" });
    let user;
    try {
      user = await context.queryClient.ensureQueryData(meQuery);
    } catch {
      setToken(null);
      throw redirect({ to: "/login" });
    }
    if (!canAccess(user.role, location.pathname)) throw redirect({ to: homeFor(user.role) });
  },
  component: AppLayout,
});

function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try { await logout(); } catch { /* ignora */ }
    setToken(null);
    qc.clear();
    navigate({ to: "/login", replace: true });
  };
}

function AppSidebar() {
  const { data: user } = useSuspenseQuery(meQuery);
  const { state } = useSidebar();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
        <Logo compact={state === "collapsed"} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navByRole[user.role].map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={path.startsWith(item.to)} tooltip={item.title} size="lg">
                    <Link to={item.to}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function UserBox({ onLogout }: { onLogout: () => void }) {
  const { data: user } = useSuspenseQuery(meQuery);
  const [pw, setPw] = useState(false);
  return (
    <div className="ml-auto flex items-center gap-2 sm:gap-3">
      <div className="text-right leading-tight">
        <div className="text-sm font-semibold text-foreground">{user.name}</div>
        <div className="text-xs text-muted-foreground">{roleLabel[user.role]}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setPw(true)} className="min-h-11 gap-2">
        <KeyRound className="h-4 w-4" />
        <span className="hidden sm:inline">Trocar senha</span>
        <span className="sr-only sm:hidden">Trocar senha</span>
      </Button>
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
      <Button variant="outline" size="sm" onClick={onLogout} className="min-h-11 gap-2">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </Button>
    </div>
  );
}

function AppLayout() {
  const { data: user } = useSuspenseQuery(meQuery);
  const logout = useLogout();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const field = isFieldRole(user.role);
  const navigate = useNavigate();

  if (user.must_change_password) {
    return <ForcePasswordScreen onDone={() => void navigate({ to: homeFor(user.role), replace: true })} />;
  }

  if (field) {
    const items = navByRole[user.role];
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4">
          <Logo />
          <UserBox onLogout={logout} />
        </header>
        <div className="mx-auto flex max-w-6xl">
          <nav className="hidden w-60 shrink-0 flex-col gap-1 p-4 md:flex">
            {items.map((i) => (
              <Link key={i.to} to={i.to}
                className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-secondary",
                  path.startsWith(i.to) && "bg-secondary text-primary")}>
                <i.icon className="h-5 w-5" />{i.title}
              </Link>
            ))}
          </nav>
          <main className="flex-1 p-4 pb-28 md:p-8"><Outlet /></main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-card md:hidden"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((i) => {
            const active = path.startsWith(i.to);
            return (
              <Link key={i.to} to={i.to}
                className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground",
                  active && "text-primary")}>
                <i.icon className="h-6 w-6" />
                <span className="text-center leading-tight">{i.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <div className="contents print:hidden"><AppSidebar /></div>
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex print:hidden h-16 items-center gap-3 border-b bg-card px-4">
            <SidebarTrigger className="h-10 w-10" />
            <UserBox onLogout={logout} />
          </header>
          <main className="flex-1 p-4 md:p-8 print:p-0"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
