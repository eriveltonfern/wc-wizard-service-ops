import { useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CloudOff, Play } from "lucide-react";
import { ApiError } from "@/lib/api";
import { finishTicket, getTicket, startTicket } from "@/lib/endpoints";
import { dataUrlToBlob, enqueueTicketAction, isOffline, useOutbox } from "@/lib/outbox";
import type { Ticket } from "@/lib/types";
import { PageHelp } from "@/components/layout/PageHeader";
import { ErrorState, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, SimOfflineToggle } from "@/components/field/kit";
import { FormError, PendingButton } from "@/components/contracts/kit";
import { ManagerActions, PhotoInput, TicketDetailView } from "@/components/tickets/kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/chamados/$id")({
  head: () => ({
    meta: [
      { title: "Chamado · WCCheck 2.0" },
      { name: "description", content: "Detalhe do chamado: fotos, descrição, linha do tempo e atendimento." },
      { property: "og:title", content: "Chamado · WCCheck 2.0" },
      { property: "og:description", content: "Detalhe do chamado: fotos, descrição, linha do tempo e atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const q = useQuery({ queryKey: ["tickets", "one", Number(id)], queryFn: () => getTicket(Number(id)), retry: false });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PreviewBanner />
      <PageHelp>
        Veja o problema, quem abriu e o que já aconteceu. Toque em "Iniciar atendimento" quando começar. Para concluir, a foto do reparo e uma nota são obrigatórias.
        <br /><SimOfflineToggle />
      </PageHelp>
      <Button variant="outline" className="h-12 px-3" onClick={() => router.history.back()}><ArrowLeft className="h-5 w-5" />Voltar</Button>
      {q.isPending ? <SkeletonBlock rows={6} /> : q.isError ? (
        <ErrorState message={q.error instanceof ApiError ? q.error.message : "Não foi possível abrir o chamado."} onRetry={() => void q.refetch()} />
      ) : <Body key={q.data.id} t={q.data} />}
    </div>
  );
}

type Mode = { kind: "view" } | { kind: "finish" } | { kind: "done" } | { kind: "queued"; what: string };

function Body({ t }: { t: Ticket }) {
  const qc = useQueryClient();
  const { items } = useOutbox();
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [photo, setPhoto] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const key = useRef(crypto.randomUUID());
  const queued = items.some((x) => x.kind !== undefined && x.kind !== "cleaning" && "ticket_id" in x && x.ticket_id === t.id);
  const label = `${t.code} · ${t.bathroom.name}`;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tickets"] });

  async function start() {
    setError(null);
    if (isOffline()) { enqueueTicketAction({ kind: "ticket_start", ticket_id: t.id, label, idempotency_key: crypto.randomUUID(), client_at: new Date().toISOString() }); setMode({ kind: "queued", what: "O início do atendimento" }); return; }
    setPending(true);
    try { await startTicket(t.id); refresh(); }
    catch (e) {
      if (e instanceof ApiError) setError(e);
      else { enqueueTicketAction({ kind: "ticket_start", ticket_id: t.id, label, idempotency_key: crypto.randomUUID(), client_at: new Date().toISOString() }); setMode({ kind: "queued", what: "O início do atendimento" }); }
    } finally { setPending(false); }
  }
  async function finish() {
    setError(null);
    const item = { kind: "ticket_done" as const, ticket_id: t.id, label, idempotency_key: key.current, client_at: new Date().toISOString(), note: note.trim(), photo };
    if (isOffline()) { enqueueTicketAction(item); setMode({ kind: "queued", what: "A conclusão do chamado" }); return; }
    setPending(true);
    try { await finishTicket(t.id, { note: note.trim(), photo: photo ? dataUrlToBlob(photo) : null, idempotency_key: key.current }); refresh(); setMode({ kind: "done" }); }
    catch (e) {
      if (e instanceof ApiError) setError(e);
      else { enqueueTicketAction(item); setMode({ kind: "queued", what: "A conclusão do chamado" }); }
    } finally { setPending(false); }
  }

  if (mode.kind === "done") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><Check className="h-9 w-9" strokeWidth={3} /></span>
        <h1 className="text-xl font-extrabold text-ink">Chamado concluído</h1>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Button asChild className="h-12 w-full"><Link to="/chamados">Voltar para Chamados</Link></Button>
      </div>
    );
  }
  if (mode.kind === "queued") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pending-soft text-pending"><CloudOff className="h-8 w-8" /></span>
        <h1 className="text-xl font-extrabold text-ink">Guardado no celular.</h1>
        <p className="text-sm text-muted-foreground">{mode.what} será enviado assim que a internet voltar.</p>
        <Button asChild className="h-12 w-full"><Link to="/chamados">Voltar para Chamados</Link></Button>
      </div>
    );
  }
  if (mode.kind === "finish") {
    const f = error?.fields ?? {};
    return (
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void finish(); }}>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">{t.code}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Concluir chamado</h1>
          <p className="text-sm text-muted-foreground">{t.bathroom.name}{t.location ? ` · ${t.location}` : ""}</p>
        </div>
        <PhotoInput label="Foto do reparo" required value={photo} onChange={setPhoto} error={f["photo"]} />
        <div className="space-y-1.5">
          <Label htmlFor="note">Nota do reparo</Label>
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que foi feito?" aria-invalid={!!f["note"]} />
          {f["note"] && <p className="text-sm font-medium text-danger">{f["note"]}</p>}
        </div>
        <FormError error={error && !Object.keys(f).length ? error : null} />
        <PendingButton type="submit" pending={pending} className="h-12 w-full text-base">Concluir chamado</PendingButton>
        <Button type="button" variant="outline" className="h-12 w-full" onClick={() => { setError(null); setMode({ kind: "view" }); }}>Voltar</Button>
      </form>
    );
  }
  return (
    <TicketDetailView t={t}>
      {queued && <p role="status" className="rounded-lg bg-pending-soft px-3 py-2 text-sm font-semibold text-pending">Há uma ação deste chamado guardada no celular, aguardando internet.</p>}
      <FormError error={error} />
      {t.can.start && !queued && (
        <PendingButton pending={pending} className="h-12 w-full text-base" onClick={() => void start()}><Play className="h-5 w-5" />Iniciar atendimento</PendingButton>
      )}
      {t.can.done && !queued && (
        <Button className="h-12 w-full text-base" onClick={() => setMode({ kind: "finish" })}><Check className="h-5 w-5" />Concluir</Button>
      )}
      <ManagerActions key={t.events.length} t={t} />
    </TicketDetailView>
  );
}
