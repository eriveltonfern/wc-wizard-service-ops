import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChangePasswordDialog, ForcePasswordScreen } from "@/components/people/ChangePassword";
import { getToken, setToken } from "@/lib/api";
import { logout } from "@/lib/endpoints";
import { meQuery, navByRole, navGroupsByRole, canAccess, homeFor, isFieldRole } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
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

function AppLayout() {
  const { data: user } = useSuspenseQuery(meQuery);
  const logout = useLogout();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const field = isFieldRole(user.role);
  const navigate = useNavigate();
  const [pw, setPw] = useState(false);

  if (user.must_change_password) {
    return <ForcePasswordScreen onDone={() => void navigate({ to: homeFor(user.role), replace: true })} />;
  }

  const items = navByRole[user.role];
  const bottomNav = field ? (
    <nav aria-label="Menu inferior" className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-card lg:hidden print:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => {
        const active = path.startsWith(i.to);
        return (
          <Link key={i.to} to={i.to} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground",
              active && "text-primary")}>
            <i.icon className="h-6 w-6" />
            <span className="text-center leading-tight">{i.title}</span>
          </Link>
        );
      })}
    </nav>
  ) : undefined;

  return (
    <AppShell user={user} groups={navGroupsByRole[user.role]} onLogout={() => void logout()} onChangePassword={() => setPw(true)} bottomNav={bottomNav}>
      <Outlet />
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </AppShell>
  );
}
