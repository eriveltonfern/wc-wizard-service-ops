import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChangePasswordDialog, ForcePasswordScreen } from "@/components/people/ChangePassword";
import { getToken, setToken } from "@/lib/api";
import { logout } from "@/lib/endpoints";
import { meQuery, navByRole, navGroupsByRole, canAccess, homeFor, isFieldRole, isWaitingAccess } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OutboxBar } from "@/components/field/kit";
import { flushOutbox, onFlushed } from "@/lib/outbox";

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
    if (isWaitingAccess(user.role)) return;
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
  const qc = useQueryClient();

  // Envia a fila de limpezas guardadas quando a internet volta.
  useEffect(() => {
    void flushOutbox();
    const t = window.setInterval(() => void flushOutbox(), 15000);
    const onOnline = () => void flushOutbox();
    window.addEventListener("online", onOnline);
    const off = onFlushed((r) => {
      if (r.sent) toast.success(r.sent === 1 ? "O que estava guardado no celular foi enviado." : `${r.sent} envios guardados no celular foram feitos.`);
      r.failed.forEach((f) => toast.error(`Não foi possível enviar (${f.name}): ${f.message}`));
      void qc.invalidateQueries({ queryKey: ["field"] });
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    });
    return () => { window.clearInterval(t); window.removeEventListener("online", onOnline); off(); };
  }, [qc]);

  if (user.must_change_password) {
    return <ForcePasswordScreen onDone={() => void navigate({ to: homeFor(user.role), replace: true })} />;
  }

  if (isWaitingAccess(user.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
          <p className="text-lg font-bold text-ink">Seu acesso ao app será liberado em breve.</p>
          <Button className="min-h-10" onClick={() => void logout()}>Sair</Button>
        </div>
      </main>
    );
  }

  const items = navByRole[user.role];
  const bottomNav = field ? (
    <nav aria-label="Menu inferior" className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-card lg:hidden print:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => {
        const best = items.filter((x) => path === x.to || path.startsWith(x.to + "/")).sort((a, b) => b.to.length - a.to.length)[0];
        const active = best?.to === i.to;
        const center = false;
        return (
          <Link key={i.to} to={i.to} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground",
              active && "text-primary")}>
            {center ? (
              <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-card">
                <i.icon className="h-7 w-7" />
              </span>
            ) : <i.icon className="h-6 w-6" />}
            <span className="text-center leading-tight">{i.short ?? i.title}</span>
          </Link>
        );
      })}
    </nav>
  ) : undefined;

  return (
    <AppShell user={user} groups={navGroupsByRole[user.role]} onLogout={() => void logout()} onChangePassword={() => setPw(true)} bottomNav={bottomNav}>
      <OutboxBar />
      <Outlet />
      <ChangePasswordDialog open={pw} onOpenChange={setPw} />
    </AppShell>
  );
}
