import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Printer, Search } from "lucide-react";
import { listContracts, listLabels } from "@/lib/endpoints";
import type { Label } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyBlock, ErrorBlock, LoadingBlock, NativeSelect } from "@/components/contracts/kit";
import { cn } from "@/lib/utils";

type Size = "pequena" | "media" | "grande";
const SIZES: { id: Size; label: string }[] = [
  { id: "pequena", label: "Pequena (6 por folha)" },
  { id: "media", label: "Média (4 por folha)" },
  { id: "grande", label: "Grande (1 por folha)" },
];
// Área útil A4 com margens de 10 mm: 190 × 277 mm.
const SIZE_STYLE: Record<Size, { cols: number; h: string; qr: string; name: string; perPage: number }> = {
  pequena: { cols: 2, h: "90mm", qr: "48mm", name: "text-xl", perPage: 6 },
  media: { cols: 2, h: "136mm", qr: "75mm", name: "text-2xl", perPage: 4 },
  grande: { cols: 1, h: "275mm", qr: "140mm", name: "text-5xl", perPage: 1 },
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const Route = createFileRoute("/_app/etiquetas")({
  validateSearch: (s: Record<string, unknown>): { contrato?: number; banheiro?: number } => {
    const c = Number(s["contrato"]); const b = Number(s["banheiro"]);
    return { ...(c > 0 ? { contrato: c } : {}), ...(b > 0 ? { banheiro: b } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Etiquetas · WCCheck 2.0" },
      { name: "description", content: "Imprima as etiquetas com QR dos banheiros de cada contrato." },
      { property: "og:title", content: "Etiquetas · WCCheck 2.0" },
      { property: "og:description", content: "Imprima as etiquetas com QR dos banheiros de cada contrato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LabelsPage,
});

function LabelsPage() {
  const { contrato, banheiro } = Route.useSearch();
  const navigate = useNavigate({ from: "/etiquetas" });
  const contracts = useQuery({ queryKey: ["contracts", "labels-select"], queryFn: () => listContracts() });
  const labels = useQuery({ queryKey: ["labels", contrato], queryFn: () => listLabels(contrato!), enabled: !!contrato, retry: false });
  const [size, setSize] = useState<Size>("pequena");
  const [q, setQ] = useState("");
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());

  // Ao trocar de contrato/banheiro: todos marcados (ou só o banheiro pedido).
  useEffect(() => {
    if (banheiro && labels.data) setUnchecked(new Set(labels.data.filter((l) => l.bathroom_id !== banheiro).map((l) => l.bathroom_id)));
    else setUnchecked(new Set());
  }, [contrato, banheiro, labels.data]);

  const contract = contracts.data?.find((c) => c.id === contrato);
  const visible = useMemo(() => {
    const n = norm(q.trim());
    return (labels.data ?? []).filter((l) => !n || norm(`${l.name} ${l.location ?? ""}`).includes(n));
  }, [labels.data, q]);
  const selected = (labels.data ?? []).filter((l) => !unchecked.has(l.bathroom_id));
  const toggle = (id: number) => setUnchecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (on: boolean) => setUnchecked(on ? new Set() : new Set((labels.data ?? []).map((l) => l.bathroom_id)));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-6 print:hidden">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Etiquetas</h1>
          <p className="text-muted-foreground">Escolha o contrato, marque os banheiros e imprima as etiquetas com QR.</p>
        </header>

        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="lbl_contract" className="text-sm font-medium">Contrato</label>
            <NativeSelect id="lbl_contract" value={contrato ? String(contrato) : ""}
              onChange={(e) => void navigate({ search: e.target.value ? { contrato: Number(e.target.value) } : {} })}>
              <option value="">{contracts.isLoading ? "Carregando…" : "Escolha o contrato"}</option>
              {contracts.data?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lbl_size" className="text-sm font-medium">Tamanho</label>
            <NativeSelect id="lbl_size" value={size} onChange={(e) => setSize(e.target.value as Size)}>
              {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </div>
        </div>

        {contracts.isError && <ErrorBlock message="Não foi possível carregar os contratos." onRetry={() => void contracts.refetch()} />}
        {!contrato ? <EmptyBlock title="Escolha um contrato para ver as etiquetas." />
          : labels.isLoading ? <LoadingBlock label="Carregando etiquetas…" />
          : labels.isError ? <ErrorBlock message="Não foi possível carregar as etiquetas deste contrato." onRetry={() => void labels.refetch()} />
          : !labels.data?.length ? (
            <EmptyBlock title="Este contrato ainda não tem banheiros ativos.">
              <Button asChild className="min-h-11"><Link to="/contratos/$id" params={{ id: String(contrato) }} search={{ tab: "banheiros" }}>Ir para Banheiros</Link></Button>
            </EmptyBlock>
          ) : (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label="Buscar banheiro" placeholder="Buscar banheiro ou local" className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <Button variant="outline" className="min-h-11" onClick={() => setAll(true)}>Marcar todos</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setAll(false)}>Desmarcar todos</Button>
                <Button className="min-h-11" disabled={!selected.length} onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir</Button>
              </div>
              <p className="text-sm text-muted-foreground">{selected.length} de {labels.data.length} etiqueta(s) marcada(s).</p>
              {visible.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum banheiro encontrado.</p> : (
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((l) => (
                    <li key={l.bathroom_id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-secondary">
                        <Checkbox checked={!unchecked.has(l.bathroom_id)} onCheckedChange={() => toggle(l.bathroom_id)} />
                        <span className="text-sm"><span className="font-medium">{l.name}</span>{l.location ? <span className="text-muted-foreground"> · {l.location}</span> : null}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
      </div>

      {contrato && selected.length > 0 && (
        <section aria-label="Pré-visualização das etiquetas" className="label-sheet">
          <h2 className="mb-3 text-lg font-semibold text-foreground print:hidden">Pré-visualização</h2>
          <div className="overflow-x-auto print:overflow-visible">
            <div className="grid w-[190mm] gap-0 bg-card print:w-full" style={{ gridTemplateColumns: `repeat(${SIZE_STYLE[size].cols}, minmax(0, 1fr))` }}>
              {selected.map((l) => <LabelCard key={l.bathroom_id} label={l} size={size} code={contract?.code ?? ""} />)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function LabelCard({ label, size, code }: { label: Label; size: Size; code: string }) {
  const st = SIZE_STYLE[size];
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toString(label.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [label.url]);
  return (
    <article data-url={label.url} className="label-card flex flex-col items-center justify-center gap-2 border border-dashed border-foreground p-[5mm] text-center text-foreground"
      style={{ height: st.h, breakInside: "avoid", pageBreakInside: "avoid" }}>
      <div role="img" aria-label={`QR de ${label.name}`} style={{ width: st.qr, height: st.qr }} className="[&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }} />
      <p className={cn("font-bold leading-tight", st.name)}>{label.name}</p>
      {label.location && <p className={size === "grande" ? "text-2xl" : "text-base"}>{label.location}</p>}
      <p className={size === "grande" ? "text-xl" : "text-sm"}>Escaneie para registrar a limpeza</p>
      <p className="text-[9px] tracking-wide">{code} · {label.url.replace(/^https?:\/\//, "")}</p>
    </article>
  );
}
