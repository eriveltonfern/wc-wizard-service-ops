import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Marca "WC Check": ✓ branco em quadrado azul. */
export function Logo({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Check className="h-5 w-5" strokeWidth={3} />
      </div>
      {!compact && (
        <span className={cn("text-xl font-extrabold tracking-tight", onDark ? "text-sidebar-primary-foreground" : "text-ink")}>WC Check</span>
      )}
    </div>
  );
}
