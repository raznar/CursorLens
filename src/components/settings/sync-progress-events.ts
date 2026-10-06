/** Ask the status panel to re-fetch `/api/sync` now (e.g. right after a sync is triggered). */
export const SYNC_STATUS_REFRESH_EVENT = "cursor-lens:sync-status-refresh";

/** Broadcast by the status panel after each refresh so sibling islands know if a run is active. */
export const SYNC_RUN_STATE_EVENT = "cursor-lens:sync-run-state";

export interface SyncRunStateDetail {
  running: boolean;
  runId: number | null;
  trigger: string | null;
}

export function dispatchSyncRunState(detail: SyncRunStateDetail): void {
  window.dispatchEvent(new CustomEvent<SyncRunStateDetail>(SYNC_RUN_STATE_EVENT, { detail }));
}
