import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TrendBadgeProps {
  /** Fractional change, e.g. 0.12 for +12%. */
  delta: number | null | undefined;
  /** When true, a decrease is "good" (e.g. error rate). */
  invert?: boolean;
  className?: string;
}

/** Small up/down delta indicator, colored by whether the change is good. */
export function TrendBadge({ delta, invert = false, className }: TrendBadgeProps) {
  if (delta == null || !Number.isFinite(delta)) return null;
  const flat = delta === 0;
  const up = delta > 0;
  const good = invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        flat ? "text-muted-foreground" : good ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(Math.abs(delta))}
    </span>
  );
}
