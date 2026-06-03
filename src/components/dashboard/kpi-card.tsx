import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendBadge } from "@/components/dashboard/trend-badge";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  /** Fractional change vs the previous period. */
  delta?: number | null;
  deltaInvert?: boolean;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/** Headline metric card used across dashboard pages. */
export function KpiCard({
  label,
  value,
  delta,
  deltaInvert,
  icon,
  footer,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
          {delta != null ? <TrendBadge delta={delta} invert={deltaInvert} /> : null}
        </div>
        {footer ? <div className="mt-1 text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
