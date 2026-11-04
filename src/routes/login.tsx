import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError, getToken, setToken, USE_MOCKS } from "@/lib/api";
import { homeFor, meQuery, type User } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar · WCCheck 2.0" },
      { name: "description", content: "Acesse o WCCheck 2.0 com seu e-mail e senha." },
      { property: "og:title", content: "Entrar · WCCheck 2.0" },
      { property: "og:description", content: "Acesse o WCCheck 2.0 com seu e-mail e senha." },
    ],
  }),
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const TEST_USERS = [
  ["admin@wccheck.test", "Diretoria"],
  ["gestor@wccheck.test", "Gestor"],
  ["fiscal@wccheck.test", "Fiscal"],
  ["limpeza@wccheck.test", "Limpeza"],
  ["manutencao@wccheck.test", "Manutenção"],
];

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      setToken(res.token);
      qc.setQueryData(meQuery.queryKey, res.user);
      navigate({ to: homeFor(res.user.role), replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "E-mail ou senha incorretos." : err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">Gestão de limpeza e manutenção de banheiros</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">Entrar</h1>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-11" placeholder="voce@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="h-11" />
            </div>
            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        </form>

        {USE_MOCKS && (
          <div className="mt-6 rounded-xl border border-dashed bg-card/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acessos de teste</p>
            <p className="mt-1 text-xs text-muted-foreground">Senha: wccheck123</p>
            <ul className="mt-3 space-y-1">
              {TEST_USERS.map(([mail, label]) => (
                <li key={mail}>
                  <button type="button" onClick={() => { setEmail(mail); setPassword("wccheck123"); setError(null); }}
                    className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-secondary">
                    <span className="font-medium text-foreground">{mail}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
