// Peças reutilizadas pelas telas de contrato: campos, selos, diálogos e ações com aviso.
import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { missingLabel, statusLabel, WEEKDAY_SHORT, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Executa uma chamada da API com carregando, aviso de sucesso e erros de campo. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>, opts: { success?: string; onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function run(...a: A): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const r = await fn(...a);
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("unknown", "Não foi possível concluir. Tente novamente.", 0));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, fields: error?.fields ?? {}, reset: () => setError(null) };
}

export function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string | undefined; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className={cn("flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50", className)}>
      {children}
    </select>
  );
}

/** Mensagem geral do erro (quando não é só de campo). */
export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
      <p>{error.message}</p>
      {error.missing && error.missing.length > 0 && (
        <ul className="mt-1 list-disc pl-5 font-normal">{error.missing.map((m) => <li key={m}>{missingLabel[m] ?? m}</li>)}</ul>
      )}
    </div>
  );
}

const badgeTone: Record<string, string> = {
  active: "bg-primary/10 text-primary border-primary/30",
  draft: "bg-secondary text-secondary-foreground border-border",
  suspended: "bg-warning/20 text-warning-foreground border-warning/50",
  ended: "bg-muted text-muted-foreground border-border",
  inactive: "bg-muted text-muted-foreground border-border",
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", badgeTone[status] ?? badgeTone["draft"])}>{statusLabel(status)}</span>;
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>;
}
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void | undefined }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">{message}</p>
      {onRetry && <Button variant="outline" className="min-h-11" onClick={onRetry}><RefreshCw className="h-4 w-4" />Tentar de novo</Button>}
    </div>
  );
}
export function EmptyBlock({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function PendingButton({ pending, children, ...props }: React.ComponentProps<typeof Button> & { pending?: boolean | undefined }) {
  return (
    <Button {...props} disabled={pending || props.disabled} className={cn("min-h-11", props.className)}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

/** Diálogo simples com formulário. */
export function FormDialog({ open, onOpenChange, title, description, children, onSubmit, submitLabel, pending, destructive }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string | undefined; children?: ReactNode;
  onSubmit: () => void; submitLabel: string; pending?: boolean | undefined; destructive?: boolean | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <PendingButton type="submit" pending={pending} variant={destructive ? "destructive" : "default"}>{submitLabel}</PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pede um motivo antes de executar a ação. */
export function ReasonDialog({ open, onOpenChange, title, description, submitLabel, onConfirm, destructive, error }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string | undefined; submitLabel: string;
  onConfirm: (reason: string) => Promise<boolean>; destructive?: boolean | undefined; error?: ApiError | null | undefined;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <FormDialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setReason(""); }} title={title} description={description}
      submitLabel={submitLabel} pending={pending} destructive={destructive}
      onSubmit={async () => { setPending(true); const ok = await onConfirm(reason); setPending(false); if (ok) { setReason(""); onOpenChange(false); } }}>
      <Field label="Motivo" id="reason" error={error?.fields?.["reason"]}>
        <Textarea id="reason" autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Field>
      <FormError error={error ?? null} />
    </FormDialog>
  );
}

/** Confirmação simples (sem campos). */
export function ConfirmDialog({ open, onOpenChange, title, description, submitLabel, onConfirm, pending, error, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; submitLabel: string;
  onConfirm: () => void; pending?: boolean | undefined; error?: ApiError | null | undefined; children?: ReactNode;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title} description={description} submitLabel={submitLabel}
      pending={pending} destructive onSubmit={onConfirm}>
      {error && error.code !== "has_history" && <FormError error={error} />}
      {children}
    </FormDialog>
  );
}

export function HistoryNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="space-y-3 rounded-md border border-warning/50 bg-warning/15 p-3 text-sm text-foreground">
      <p className="font-medium">Este cadastro tem histórico. Você pode inativá-lo.</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function WeekdayChips({ value, onChange, disabled, id }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean; id?: string }) {
  return (
    <div id={id} role="group" className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = value.includes(d);
        return (
          <button key={d} type="button" disabled={disabled} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
            className={cn("min-h-11 min-w-12 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-60",
              on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:bg-secondary")}>
            {WEEKDAY_SHORT[d]}
          </button>
        );
      })}
    </div>
  );
}

export function DateInput({ id, value, onChange, required }: { id: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return <Input id={id} type="date" className="h-11" value={value} required={required} onChange={(e) => onChange(e.target.value)} />;
}
export { todayIso };
