import { Suspense } from "react";
import { AskAgentPanel } from "@/components/ask/ask-panel";
import { cursorKeyStatus } from "@/lib/keys";
import { listReports } from "@/lib/reports";
import type { SavedReport } from "@/db/schema";

function PanelFallback() {
  return null;
}

/**
 * Server wrapper that loads saved conversations and SDK key status once, then mounts the
 * global Ask Agent panel (client). Wrapped in Suspense because the panel reads
 * `useSearchParams`.
 */
export function AskAgentRoot() {
  let reports: SavedReport[] = [];
  try {
    reports = listReports();
  } catch {
    reports = [];
  }

  let keyConfigured = false;
  try {
    keyConfigured = cursorKeyStatus().configured;
  } catch {
    keyConfigured = false;
  }

  return (
    <Suspense fallback={<PanelFallback />}>
      <AskAgentPanel initialReports={reports} keyConfigured={keyConfigured} />
    </Suspense>
  );
}
