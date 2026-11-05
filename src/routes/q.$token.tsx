import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Frown, Laugh, Loader2, Meh, QrCode, Smile, Angry, type LucideIcon } from "lucide-react";
import { ApiError } from "@/lib/api";
import { getPublicQr, sendRating } from "@/lib/endpoints";
import type { RatingProblem } from "@/lib/types";
import { RATING_PROBLEM_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PreviewBanner } from "@/components/field/kit";

// Página PÚBLICA do QR: o cliente avalia o banheiro. Sem login, sem nome, sem e-mail.
export const Route = createFileRoute("/q/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Avalie este banheiro · WC Check" },
      { name: "description", content: "Conte em poucos segundos como está este banheiro. Não pedimos nome nem e-mail." },
      { property: "og:title", content: "Avalie este banheiro · WC Check" },
      { property: "og:description", content: "Conte em poucos segundos como está este banheiro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RatePage,
});

const FACES: { score: number; label: string; icon: LucideIcon; tone: string }[] = [
  { score: 1, label: "Muito ruim", icon: Angry, tone: "text-danger" },
  { score: 2, label: "Ruim", icon: Frown, tone: "text-danger" },
  { score: 3, label: "Regular", icon: Meh, tone: "text-pending" },
  { score: 4, label: "Bom", icon: Smile, tone: "text-success" },
  { score: 5, label: "Ótimo", icon: Laugh, tone: "text-success" },
];
const PROBLEMS = Object.keys(RATING_PROBLEM_LABEL) as RatingProblem[];

/** Identificador anônimo do aparelho (o servidor aceita 1 avaliação por banheiro a cada 30 min). */
let sessionKey: string | null = null;
function randomKey() {
  try { return crypto.randomUUID(); } catch { /* navegador antigo */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function deviceKey() {
  const k = "wccheck.device";
  try {
    let v = localStorage.getItem(k);
    if (!v) { v = randomKey(); localStorage.setItem(k, v); }
    return v;
  } catch {
    // Sem localStorage (navegação anônima/bloqueado): chave aleatória só desta sessão.
    sessionKey ??= randomKey();
    return sessionKey;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <Logo />
        <PreviewBanner />
        {children}
      </div>
    </main>
  );
}

function RatePage() {
  const { token } = Route.useParams();
  const info = useQuery({ queryKey: ["public-qr", token], queryFn: () => getPublicQr(token), retry: false });
  const [score, setScore] = useState<number | null>(null);
  const [problems, setProblems] = useState<RatingProblem[]>([]);
  const [comment, setComment] = useState("");
  const send = useMutation({
    mutationFn: () => sendRating(token, { score: score!, problems: score! <= 3 ? problems : [], comment: comment.trim() || undefined, device_key: deviceKey() }),
  });

  if (info.isPending) return <Shell><p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p></Shell>;
  if (info.isError) {
    const inactive = info.error instanceof ApiError && info.error.status === 404;
    return (
      <Shell>
        <div role="alert" className="space-y-3 rounded-[10px] border bg-card p-6 text-center">
          <QrCode className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-lg font-bold text-ink">{inactive ? "Este QR não está mais ativo." : "Não foi possível abrir a avaliação."}</p>
          {!inactive && <Button className="h-12 w-full" onClick={() => void info.refetch()}>Tentar de novo</Button>}
        </div>
      </Shell>
    );
  }
  if (send.isSuccess) {
    return (
      <Shell>
        <div role="status" className="space-y-3 rounded-[10px] border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
          <p className="text-xl font-extrabold text-ink">Obrigado!</p>
          <p className="text-muted-foreground">Sua avaliação ajuda a manter este banheiro limpo.</p>
        </div>
      </Shell>
    );
  }
  const e = send.error instanceof ApiError ? send.error : null;
  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{info.data.bathroom_name}</h1>
        {info.data.location && <p className="text-muted-foreground">{info.data.location}</p>}
      </div>
      <form className="space-y-5 rounded-[10px] border bg-card p-5" onSubmit={(ev) => { ev.preventDefault(); if (score) send.mutate(); }}>
        <fieldset>
          <legend className="mb-3 text-lg font-bold text-ink">Como está este banheiro?</legend>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
            {FACES.map((f) => (
              <button key={f.score} type="button" role="radio" aria-checked={score === f.score} onClick={() => setScore(f.score)}
                className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-[10px] border p-1 text-[11px] font-semibold leading-tight text-muted-foreground",
                  score === f.score ? "border-primary bg-info-soft text-ink ring-2 ring-primary" : "bg-background hover:bg-secondary")}>
                <f.icon className={cn("h-9 w-9", f.tone)} aria-hidden />
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>
        {score !== null && score <= 3 && (
          <fieldset>
            <legend className="mb-2 font-semibold text-ink">O que está errado?</legend>
            <div className="flex flex-wrap gap-2">
              {PROBLEMS.map((p) => {
                const on = problems.includes(p);
                return (
                  <button key={p} type="button" aria-pressed={on} onClick={() => setProblems(on ? problems.filter((x) => x !== p) : [...problems, p])}
                    className={cn("min-h-11 rounded-full border px-4 text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}>
                    {RATING_PROBLEM_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <div className="space-y-1">
          <label htmlFor="comment" className="font-semibold text-ink">Comentário (opcional)</label>
          <Textarea id="comment" rows={3} maxLength={300} value={comment} onChange={(ev) => setComment(ev.target.value)} />
          <p className="text-right text-xs text-muted-foreground">{comment.length}/300</p>
          {e?.fields?.["comment"] && <p className="text-sm text-danger">{e.fields["comment"]}</p>}
        </div>
        {e && !e.fields?.["comment"] && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{e.message}</p>}
        {send.isError && !e && <p role="alert" className="text-sm text-danger">Não foi possível enviar. Tente de novo.</p>}
        <Button type="submit" className="h-14 w-full text-lg" disabled={!score || send.isPending}>
          {send.isPending && <Loader2 className="h-5 w-5 animate-spin" />}Enviar avaliação
        </Button>
        <p className="text-center text-xs text-muted-foreground">Não pedimos nome nem e-mail.</p>
      </form>
    </Shell>
  );
}
