import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, CloudOff, Loader2, MapPin, MapPinOff, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { createCleaning, getCleaningForm } from "@/lib/endpoints";
import { enqueueCleaning, isOffline, toInput, type QueuedCleaning } from "@/lib/outbox";
import type { ChecklistAnswer, Cleaning, CleaningForm, PhotoRule, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHelp } from "@/components/layout/PageHeader";
import { ErrorState, Pill, SkeletonBlock } from "@/components/ui-kit";
import { PreviewBanner, SimOfflineToggle, fmtTime, shiftTaskLabel } from "@/components/field/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/registrar/$id")({
  head: () => ({
    meta: [
      { title: "Registrar limpeza · WCCheck 2.0" },
      { name: "description", content: "Registre a limpeza do banheiro passo a passo: fotos, checklist e envio." },
      { property: "og:title", content: "Registrar limpeza · WCCheck 2.0" },
      { property: "og:description", content: "Registre a limpeza do banheiro passo a passo: fotos, checklist e envio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { id } = Route.useParams();
  return <Register key={id} bathroomId={Number(id)} />;
}

type StepKey = "before" | "checklist" | "after" | "review";
type Geo = { state: "pending" } | { state: "ok"; lat: number; lng: number; acc: number } | { state: "missing" };
type Answers = Record<number, { answer: ChecklistAnswer; ticket?: boolean | undefined }>;
type Done = { kind: "sent"; cleaning: Cleaning; next: Task | null } | { kind: "queued" };

/** Reduz a foto no aparelho (máx. 1024 px) para enviar mais rápido e caber na fila sem internet. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img")); };
    img.src = url;
  });
}

function Register({ bathroomId }: { bathroomId: number }) {
  const q = useQuery({ queryKey: ["field", "form", bathroomId], queryFn: () => getCleaningForm(bathroomId), retry: false });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PreviewBanner />
      {q.isPending ? <SkeletonBlock rows={5} /> : q.isError ? (
        <ErrorState message={q.error instanceof ApiError ? q.error.message : "Não foi possível abrir este banheiro."} onRetry={() => void q.refetch()} />
      ) : <Wizard form={q.data} />}
    </div>
  );
}

function Wizard({ form }: { form: CleaningForm }) {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const steps: StepKey[] = [
    ...(form.rules.photo_before !== "off" ? (["before"] as const) : []),
    "checklist",
    ...(form.rules.photo_after !== "off" ? (["after"] as const) : []),
    "review",
  ];
  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<{ before?: string | undefined; after?: string | undefined }>({});
  const [answers, setAnswers] = useState<Answers>({});
  const [notes, setNotes] = useState("");
  const [geo, setGeo] = useState<Geo>(form.rules.capture_location ? { state: "pending" } : { state: "missing" });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const key = useRef(crypto.randomUUID());
  const top = useRef<HTMLDivElement>(null);
  const current = steps[step]!;

  useEffect(() => {
    if (!form.rules.capture_location) return;
    if (!("geolocation" in navigator)) { setGeo({ state: "missing" }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ state: "ok", lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => setGeo({ state: "missing" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [form.rules.capture_location]);

  const go = (i: number) => { setError(null); setStep(i); top.current?.scrollIntoView({ block: "start" }); };
  const back = () => (step === 0 ? router.history.back() : go(step - 1));

  async function submit() {
    setError(null);
    const item: QueuedCleaning = {
      bathroom_id: form.bathroom.id, bathroom_name: form.bathroom.name,
      photo_before: photos.before, photo_after: photos.after,
      checklist: form.checklist.map((i) => ({ item_id: i.id, answer: answers[i.id]?.answer ?? ("" as ChecklistAnswer), open_ticket: answers[i.id]?.ticket })),
      notes: notes.trim() || undefined,
      ...(geo.state === "ok" ? { latitude: geo.lat, longitude: geo.lng, accuracy: geo.acc } : {}),
      client_finished_at: new Date().toISOString(), idempotency_key: key.current,
    };
    if (isOffline()) { enqueueCleaning(item); setDone({ kind: "queued" }); return; }
    setSending(true);
    try {
      const r = await createCleaning(toInput(item, false));
      void qc.invalidateQueries({ queryKey: ["field"] });
      setDone({ kind: "sent", cleaning: r.cleaning, next: r.next });
    } catch (e) {
      if (e instanceof ApiError) {
        const f = e.fields ?? {};
        const target = f["photo_before"] ? "before" : f["checklist"] ? "checklist" : f["photo_after"] ? "after" : null;
        const msg = (target && (f[target === "before" ? "photo_before" : target === "after" ? "photo_after" : "checklist"])) || e.message;
        if (target && steps.includes(target)) setStep(steps.indexOf(target));
        setError(msg);
      } else {
        enqueueCleaning(item); // sem conexão com o servidor: guarda no celular
        setDone({ kind: "queued" });
      }
    } finally {
      setSending(false);
    }
  }

  if (done?.kind === "queued") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pending-soft text-pending"><CloudOff className="h-8 w-8" /></span>
        <h1 className="text-xl font-extrabold text-ink">Guardada no celular.</h1>
        <p className="text-sm text-muted-foreground">Vamos enviar assim que a internet voltar.</p>
        <Button asChild className="h-12 w-full"><Link to="/hoje">Voltar para Hoje</Link></Button>
      </div>
    );
  }
  if (done?.kind === "sent") {
    const c = done.cleaning;
    return (
      <div className="flex flex-col items-center gap-4 rounded-[10px] border bg-card px-6 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success"><Check className="h-9 w-9" strokeWidth={3} /></span>
        <h1 className="text-xl font-extrabold text-ink">Limpeza registrada às {fmtTime(c.registered_at)}</h1>
        <p className="text-sm text-muted-foreground">{c.bathroom.name}{c.location ? ` · ${c.location}` : ""}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {c.link.kind === "extra" ? <Pill tone="info">Limpeza extra</Pill> : <Pill tone="success">{shiftTaskLabel[c.link.shift ?? ""] ?? "Tarefa do dia"}</Pill>}
          {c.marks.includes("no_location") && <Pill tone="neutral">Registrada sem localização</Pill>}
        </div>
        {c.link.kind === "extra" && <p className="text-xs text-muted-foreground">Não havia limpeza pendente para este banheiro agora. Ela fica registrada à parte e não entra no percentual.</p>}
        <div className="grid w-full gap-2">
          {done.next && (
            <Button className="h-12 w-full" onClick={() => navigate({ to: "/registrar/$id", params: { id: String(done.next!.bathroom.id) } })}>
              Próxima limpeza: {done.next.bathroom.name}
            </Button>
          )}
          <Button asChild variant={done.next ? "outline" : "default"} className="h-12 w-full"><Link to="/hoje">Voltar para Hoje</Link></Button>
        </div>
      </div>
    );
  }

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const titles: Record<StepKey, string> = { before: "Foto antes", checklist: "Checklist", after: "Foto depois", review: "Revisar e enviar" };
  return (
    <div ref={top} className="scroll-mt-20 space-y-4">
      <PageHelp>
        Siga os passos: foto antes, checklist, foto depois e envio. Se a internet cair, a limpeza fica guardada no celular e é enviada depois.
        <br /><SimOfflineToggle />
      </PageHelp>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="h-12 px-3" onClick={back}><ArrowLeft className="h-5 w-5" />Voltar</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{form.bathroom.name}</p>
          <p className="truncate text-xs text-muted-foreground">{form.bathroom.location ?? "Sem local"} · {form.contract.code}</p>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>Passo {step + 1} de {steps.length}</span><span>{titles[current]}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Passo ${step + 1} de ${steps.length}`}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {form.pending_task ? <>Vale para a <strong className="text-ink">{shiftTaskLabel[form.pending_task.shift]?.replace("Tarefa", "tarefa")}</strong> (até {form.pending_task.shift_ends_at}).</> : "Não há limpeza pendente agora: será registrada como limpeza extra."}
      </p>

      <h1 className="text-2xl font-extrabold tracking-tight text-ink">{titles[current]}</h1>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {(current === "before" || current === "after") && (
        <PhotoStep key={current} label={current === "before" ? "antes" : "depois"} rule={current === "before" ? form.rules.photo_before : form.rules.photo_after}
          value={photos[current]} onChange={(v) => setPhotos((p) => ({ ...p, [current]: v }))}
          onNext={() => go(step + 1)} onSkip={() => { setPhotos((p) => ({ ...p, [current]: undefined })); go(step + 1); }} />
      )}
      {current === "checklist" && (
        <ChecklistStep items={form.checklist} answers={answers} onChange={setAnswers} onNext={() => go(step + 1)} setError={setError} />
      )}
      {current === "review" && (
        <div className="space-y-4">
          {(form.rules.photo_before !== "off" || form.rules.photo_after !== "off") && (
            <div className="grid grid-cols-2 gap-3">
              {form.rules.photo_before !== "off" && <Thumb label="Antes" src={photos.before} />}
              {form.rules.photo_after !== "off" && <Thumb label="Depois" src={photos.after} />}
            </div>
          )}
          <section className="rounded-[10px] border bg-card">
            <h2 className="border-b px-4 py-3 text-base font-bold text-ink">Checklist</h2>
            <ul className="divide-y">
              {form.checklist.map((i) => {
                const a = answers[i.id];
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="text-ink">{i.label}</span>
                    {a?.answer === "ok" ? <Pill tone="success">OK</Pill> : a?.answer === "not_ok" ? <Pill tone="danger">Não OK{a.ticket ? " · chamado" : ""}</Pill> : a?.answer === "na" ? <Pill tone="neutral">Não se aplica</Pill> : <Pill tone="warning">Sem resposta</Pill>}
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="space-y-2">
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Textarea id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Ex.: faltou papel toalha" />
          </div>
          {form.rules.capture_location && (
            <p className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold", geo.state === "ok" ? "bg-success-soft text-success" : "bg-neutral-soft text-neutral")} role="status">
              {geo.state === "ok" ? <><MapPin className="h-4 w-4" />Localização registrada</> : geo.state === "pending" ? <><Loader2 className="h-4 w-4 animate-spin" />Buscando localização…</> : <><MapPinOff className="h-4 w-4" />Sem localização — a limpeza vale do mesmo jeito</>}
            </p>
          )}
          <Button className="h-14 w-full text-base" onClick={() => void submit()} disabled={sending}>
            {sending && <Loader2 className="h-5 w-5 animate-spin" />}Enviar limpeza
          </Button>
        </div>
      )}
    </div>
  );
}

function Thumb({ label, src }: { label: string; src?: string | undefined }) {
  return (
    <figure className="overflow-hidden rounded-[10px] border bg-card">
      {src ? <img src={src} alt={`Foto ${label.toLowerCase()}`} className="aspect-[4/3] w-full object-cover" /> :
        <div className="flex aspect-[4/3] items-center justify-center bg-secondary text-xs text-muted-foreground">Sem foto</div>}
      <figcaption className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function PhotoStep({ label, rule, value, onChange, onNext, onSkip }: {
  label: string; rule: PhotoRule; value?: string | undefined; onChange: (v: string | undefined) => void; onNext: () => void; onSkip: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    try { onChange(await shrink(f)); } catch { onChange(undefined); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tire uma foto do banheiro {label} da limpeza. {rule === "required" ? "Neste contrato a foto é obrigatória." : "Neste contrato a foto é opcional."}
      </p>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Foto ${label}`}
        onChange={(e) => void pick(e.target.files?.[0])} />
      {value ? (
        <>
          <img src={value} alt={`Foto ${label}`} className="aspect-[4/3] w-full rounded-[10px] border object-cover" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12" onClick={() => input.current?.click()}><RotateCcw className="h-4 w-4" />Refazer</Button>
            <Button className="h-12" onClick={onNext}>Continuar</Button>
          </div>
        </>
      ) : (
        <>
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-primary/40 bg-info-soft text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Camera className="h-10 w-10" />}
            <span className="text-base font-bold">Tirar foto {label}</span>
          </button>
          {rule === "optional" && <Button variant="outline" className="h-12 w-full" onClick={onSkip}>Pular</Button>}
        </>
      )}
    </div>
  );
}

function ChecklistStep({ items, answers, onChange, onNext, setError }: {
  items: CleaningForm["checklist"]; answers: Answers; onChange: (a: Answers) => void; onNext: () => void; setError: (e: string | null) => void;
}) {
  const opts: [ChecklistAnswer, string, string][] = [
    ["ok", "OK", "bg-success text-primary-foreground border-success"],
    ["not_ok", "Não OK", "bg-danger text-primary-foreground border-danger"],
    ["na", "Não se aplica", "bg-neutral text-primary-foreground border-neutral"],
  ];
  const missing = items.filter((i) => !answers[i.id]).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Responda todos os itens para continuar.</p>
      {items.map((i) => {
        const a = answers[i.id];
        return (
          <fieldset key={i.id} className="rounded-[10px] border bg-card p-3">
            <legend className="sr-only">{i.label}</legend>
            <p className="mb-2 font-bold text-ink" aria-hidden>{i.label}</p>
            <div className="grid grid-cols-3 gap-2">
              {opts.map(([v, text, on]) => (
                <button key={v} type="button" aria-pressed={a?.answer === v} aria-label={`${i.label}: ${text}`}
                  onClick={() => { setError(null); onChange({ ...answers, [i.id]: { answer: v, ticket: v === "not_ok" ? a?.ticket : undefined } }); }}
                  className={cn("min-h-12 rounded-lg border px-1 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    a?.answer === v ? on : "bg-card text-ink hover:bg-secondary")}>
                  {text}
                </button>
              ))}
            </div>
            {a?.answer === "not_ok" && (
              <div className="mt-3 rounded-lg bg-danger-soft p-3">
                <p className="text-sm font-semibold text-danger">Abrir chamado para este problema?</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button type="button" variant={a.ticket ? "default" : "outline"} className="h-12" aria-pressed={!!a.ticket}
                    onClick={() => onChange({ ...answers, [i.id]: { answer: "not_ok", ticket: true } })}>Sim, abrir</Button>
                  <Button type="button" variant={a.ticket === false ? "default" : "outline"} className="h-12" aria-pressed={a.ticket === false}
                    onClick={() => onChange({ ...answers, [i.id]: { answer: "not_ok", ticket: false } })}>Não</Button>
                </div>
              </div>
            )}
          </fieldset>
        );
      })}
      <Button className="h-12 w-full" onClick={() => {
        if (missing > 0) { setError(missing === 1 ? "Falta responder 1 item do checklist." : `Faltam responder ${missing} itens do checklist.`); return; }
        onNext();
      }}>Continuar</Button>
    </div>
  );
}

