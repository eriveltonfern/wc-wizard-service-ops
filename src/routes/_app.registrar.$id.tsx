import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Camera, Wrench, Check, CloudOff, Loader2, MapPin, MapPinOff, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { shrinkPhoto } from "@/lib/photo";
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
    try { onChange(await shrinkPhoto(f)); } catch { onChange(undefined); } finally { setBusy(false); if (input.current) input.current.value = ""; }
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

