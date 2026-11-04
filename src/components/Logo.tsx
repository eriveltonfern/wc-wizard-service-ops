import { Droplets } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Droplets className="h-5 w-5" />
      </div>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-foreground">
          WC<span className="text-primary">Check</span>
          <span className="ml-1 text-xs font-semibold text-muted-foreground">2.0</span>
        </span>
      )}
    </div>
  );
}
