import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { meQuery } from "@/lib/auth";
import { Loader2, ScanLine } from "lucide-react";
import { ApiError } from "@/lib/api";
import { listBathrooms, lookupQr } from "@/lib/endpoints";
import { PageHeader, PageHelp } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/ler-qr")({
  head: () => ({
    meta: [
      { title: "Ler QR · WCCheck 2.0" },
      { name: "description", content: "Aponte a câmera para a etiqueta do banheiro para começar a limpeza." },
      { property: "og:title", content: "Ler QR · WCCheck 2.0" },
      { property: "og:description", content: "Aponte a câmera para a etiqueta do banheiro para começar a limpeza." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReadQrPage,
});

/** Aceita o código puro ou o endereço https://wccheck.com.br/q/CODIGO. */
const tokenFrom = (v: string) => v.trim().match(/(?:\/q\/)?([A-Za-z0-9]{6,})\/?$/)?.[1] ?? "";

function ReadQrPage() {
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(meQuery);
  const maint = me.role === "manutencao";
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(token: string) {
    setError(null);
    if (!token) { setError("Cole o endereço da etiqueta, por exemplo https://wccheck.com.br/q/CODIGO."); return; }
    setBusy(true);
    try {
      const r = await lookupQr(token);
      if (maint) navigate({ to: "/chamados", search: { f: "todos", banheiro: r.bathroom_id } });
      else navigate({ to: "/registrar/$id", params: { id: String(r.bathroom_id) } });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Etiqueta não encontrada ou de um contrato que não é seu." : e instanceof ApiError ? e.message : "Não foi possível ler a etiqueta.");
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    setBusy(true);
    try {
      const r = await listBathrooms({ status: "active" });
      const b = r.rows[Math.floor(Math.random() * r.rows.length)];
      setBusy(false);
      if (b) await open(b.qr_token); else setError("Você não tem banheiros para ler.");
    } catch { setBusy(false); setError("Não foi possível simular a leitura."); }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void open(tokenFrom(text)); }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHelp>Aponte a câmera para a etiqueta colada no banheiro. Se a câmera não funcionar, cole o endereço da etiqueta logo abaixo.</PageHelp>
      <PageHeader title="Ler QR" subtitle={maint ? "Aponte para a etiqueta para ver os chamados do banheiro." : "Aponte para a etiqueta do banheiro."} />
      <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-sidebar" aria-label="Câmera">
        <div className="absolute inset-10 rounded-xl border-4 border-primary-foreground/80" />
        <ScanLine className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-primary-foreground/60" />
        <p className="absolute inset-x-0 bottom-3 text-center text-xs text-sidebar-foreground">Câmera de exemplo (protótipo)</p>
      </div>
      <Button className="h-12 w-full text-base" onClick={() => void simulate()} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}Simular leitura
      </Button>
      <form onSubmit={onSubmit} className="space-y-2 rounded-[10px] border bg-card p-4">
        <Label htmlFor="qr-url">Ou cole o endereço da etiqueta</Label>
        <Input id="qr-url" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://wccheck.com.br/q/CODIGO" className="h-12" />
        <Button type="submit" variant="outline" className="h-12 w-full" disabled={busy}>Abrir banheiro</Button>
      </form>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
