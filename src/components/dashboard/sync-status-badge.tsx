import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";

export type SyncStatus = "ok" | "running" | "error" | "stale" | "never" | "skipped";

const VARIANT: Record<SyncStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  ok: "success",
  running: "default",
  error: "destructive",
  stale: "warning",
  never: "secondary",
  skipped: "outline",
};

const LABEL: Record<SyncStatus, string> = {
  ok: "Synced",
  running: "Syncing",
  error: "Error",
  stale: "Stale",
  never: "Never synced",
  skipped: "Skipped",
};

export interface SyncStatusBadgeProps {
  status: SyncStatus;
  /** Optional timestamp to append as relative time ("3 hours ago"). */
  at?: Date | number | string | null;
}

export function SyncStatusBadge({ status, at }: SyncStatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>
      {at ? <span className="text-xs text-muted-foreground">{formatRelative(at)}</span> : null}
    </span>
  );
}
