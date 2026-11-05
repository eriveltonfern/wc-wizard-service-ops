// Barra de filtros única de Relatórios e Histórico: período, empresa, contrato, banheiro e funcionário, todos na URL.
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, FileText, Toilet, User, X } from "lucide-react";
import type { ReactNode } from "react";
import { listBathrooms, listContracts, listUsers } from "@/lib/endpoints";
import { fmtDate, todayIso } from "@/lib/format";
import type { StatsFilter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/contracts/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { monthLabel } from "./kit";

export type Period = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "custom";
export type FilterSearch = {
  periodo?: Period | undefined; de?: string | undefined; ate?: string | undefined;
  empresa?: number | undefined; contrato?: number | undefined; banheiro?: number | undefined; pessoa?: number | undefined;
};
export const PERIODS: [Period, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["custom", "Personalizado"]];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Lê os filtros comuns da URL. */
export function parseFilters(s: Record<string, unknown>): FilterSearch {
  const out: FilterSearch = {};
  if (PERIODS.some(([k]) => k === s["periodo"])) out.periodo = s["periodo"] as Period;
  if (dateRe.test(String(s["de"] ?? ""))) out.de = String(s["de"]);
  if (dateRe.test(String(s["ate"] ?? ""))) out.ate = String(s["ate"]);
  for (const k of ["empresa", "contrato", "banheiro", "pessoa"] as const) { const v = Number(s[k]); if (v > 0) out[k] = v; }
  return out;
}
export const filterKeys = (s: FilterSearch): FilterSearch => {
  const { periodo, de, ate, empresa, contrato, banheiro, pessoa } = s;
  return { periodo, de, ate, empresa, contrato, banheiro, pessoa };
};

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minus = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return isoOf(d).slice(0, 7); };

/** Converte os filtros da tela no filtro do servidor. */
export function toStatsFilter(s: FilterSearch, fallback: Period = "30d"): StatsFilter {
  const today = todayIso();
  const base: StatsFilter = { company_id: s.empresa, contract_id: s.contrato, bathroom_id: s.banheiro, user_id: s.pessoa };
  switch (s.periodo ?? fallback) {
    case "hoje": return { ...base, from: today, to: today };
    case "7d": return { ...base, from: minus(6), to: today };
    case "mes": return { ...base, month: today.slice(0, 7) };
    case "mes_passado": return { ...base, month: lastMonth() };
    case "custom": return { ...base, from: s.de ?? minus(6), to: s.ate ?? today };
    default: return { ...base, from: minus(29), to: today };
  }
}
export function periodText(s: FilterSearch, fallback: Period = "30d") {
  const f = toStatsFilter(s, fallback);
  if (f.month) return monthLabel(f.month);
  return f.from === f.to ? fmtDate(f.from!) : `${fmtDate(f.from!)} a ${fmtDate(f.to!)}`;
}

/** Opções dos filtros (contratos do escopo, banheiros e funcionários). */
export function useFilterOptions(s: FilterSearch) {
  const contracts = useQuery({ queryKey: ["contracts", { status: "" }], queryFn: () => listContracts() });
  const baths = useQuery({ queryKey: ["bathrooms", { contract_id: s.contrato }], queryFn: () => listBathrooms(s.contrato ? { contract_id: s.contrato } : {}) });
  const people = useQuery({ queryKey: ["users", "limpeza"], queryFn: () => listUsers({ role: "limpeza" }), retry: false });
  const all = contracts.data ?? [];
  const companies = [...new Map(all.map((c) => [c.company.id, c.company])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const contractList = all.filter((c) => !s.empresa || c.company.id === s.empresa);
  const bathList = (baths.data?.rows ?? []).filter((b) => !s.empresa || b.company?.id === s.empresa);
  return { companies, contracts: contractList, allContracts: all, bathrooms: bathList, people: people.data ?? [] };
}

type Props = {
  search: FilterSearch; onChange: (p: Partial<FilterSearch>) => void; fallback?: Period;
  showCompany?: boolean; showPerson?: boolean; extra?: ReactNode; extraChips?: ReactNode; onClearExtra?: () => void;
};

export function FilterBar({ search, onChange, fallback = "30d", showCompany = true, showPerson = true, extra, extraChips, onClearExtra }: Props) {
  const o = useFilterOptions(search);
  const period = search.periodo ?? fallback;
  const f = toStatsFilter(search, fallback);
  const name = {
    empresa: o.companies.find((c) => c.id === search.empresa)?.name,
    contrato: (() => { const c = o.allContracts.find((x) => x.id === search.contrato); return c && `${c.code} ${c.name}`; })(),
    banheiro: o.bathrooms.find((b) => b.id === search.banheiro)?.name,
    pessoa: o.people.find((u) => u.id === search.pessoa)?.name,
  };
  const chips: [keyof typeof name, ReactNode, string | undefined][] = [
    ["empresa", <Building2 key="i" className="h-3.5 w-3.5" />, name.empresa],
    ["contrato", <FileText key="i" className="h-3.5 w-3.5" />, name.contrato],
    ["banheiro", <Toilet key="i" className="h-3.5 w-3.5" />, name.banheiro],
    ["pessoa", <User key="i" className="h-3.5 w-3.5" />, name.pessoa],
  ];
  const active = chips.filter(([k]) => search[k]);
  const hasAny = active.length > 0 || !!extraChips;

  return (
    <section aria-label="Filtros" className="space-y-3 rounded-[10px] border bg-card p-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-1">
          {PERIODS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={period === k} onClick={() => onChange({ periodo: k })}
              className={cn("min-h-9 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                period === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary")}>{label}</button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="f-de" className="text-muted-foreground">De</label>
            <Input id="f-de" type="date" className="h-9 w-auto" value={f.from ?? ""} max={f.to} onChange={(e) => onChange({ de: e.target.value || undefined })} />
            <label htmlFor="f-ate" className="text-muted-foreground">até</label>
            <Input id="f-ate" type="date" className="h-9 w-auto" value={f.to ?? ""} min={f.from} onChange={(e) => onChange({ ate: e.target.value || undefined })} />
          </div>
        )}
      </div>
      <div className={cn("grid gap-2 sm:grid-cols-2", showCompany && showPerson ? "lg:grid-cols-4" : "lg:grid-cols-3", extra && "lg:grid-cols-5")}>
        {showCompany && (
          <NativeSelect aria-label="Empresa" value={search.empresa ?? ""} onChange={(e) => onChange({ empresa: e.target.value ? Number(e.target.value) : undefined, contrato: undefined, banheiro: undefined })}>
            <option value="">Todas as empresas</option>
            {o.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        )}
        <NativeSelect aria-label="Contrato" value={search.contrato ?? ""} onChange={(e) => onChange({ contrato: e.target.value ? Number(e.target.value) : undefined, banheiro: undefined })}>
          <option value="">Todos os contratos</option>
          {o.contracts.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Banheiro" value={search.banheiro ?? ""} onChange={(e) => onChange({ banheiro: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Todos os banheiros</option>
          {o.bathrooms.map((b) => <option key={b.id} value={b.id}>{b.name}{search.contrato ? "" : ` · ${b.contract.code}`}</option>)}
        </NativeSelect>
        {showPerson && (
          <NativeSelect aria-label="Funcionário" value={search.pessoa ?? ""} onChange={(e) => onChange({ pessoa: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Todos os funcionários</option>
            {o.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        )}
        {extra}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Mostrando <strong className="text-ink">{periodText(search, fallback)}</strong></span>
        {active.map(([k, icon, label]) => (
          <button key={k} type="button" onClick={() => onChange(k === "empresa" ? { empresa: undefined, contrato: undefined, banheiro: undefined } : k === "contrato" ? { contrato: undefined, banheiro: undefined } : { [k]: undefined })}
            aria-label={`Tirar filtro ${label ?? ""}`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-info-soft px-3 text-xs font-semibold text-info hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {icon}{label ?? "…"}<X className="h-3.5 w-3.5" />
          </button>
        ))}
        {extraChips}
        {hasAny && (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => { onChange({ empresa: undefined, contrato: undefined, banheiro: undefined, pessoa: undefined }); onClearExtra?.(); }}>
            Limpar filtros
          </Button>
        )}
      </div>
    </section>
  );
}
