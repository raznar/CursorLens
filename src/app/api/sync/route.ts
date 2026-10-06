import { NextResponse } from "next/server";
import { z } from "zod";
import { toAppError } from "@/lib/errors";
import { getSyncConfig, getSyncStatus, startSync } from "@/lib/sync";

/**
 * Sync trigger + status API.
 *  - POST { mode?, days?, only?, wait? } starts a sync. By default the run executes in the
 *    background and the response is `202 { runId }` — long backfills must not be tied to an
 *    HTTP connection. Pass `wait: true` to block until the run finishes and get its summary.
 *    While a run is active, a second POST answers `409 { runId }`.
 *  - GET returns current sync config + `sync_state` + the latest run/items + the active run.
 *
 * Reads/writes SQLite and resolves keys, so it must run on the Node.js runtime and never
 * be statically cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestBodySchema = z
  .object({
    mode: z.enum(["incremental", "backfill"]).optional(),
    days: z.number().int().min(1).max(365).optional(),
    only: z.array(z.string()).optional(),
    wait: z.boolean().optional(),
    /** Backfill only: ignore `sync_coverage` and re-pull the whole range. */
    force: z.boolean().optional(),
  })
  .optional();

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const parsed = RequestBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const options = parsed.data ?? {};
  const mode = options.mode ?? "incremental";

  try {
    const started = startSync({
      mode,
      days: options.days,
      only: options.only,
      force: options.force,
      trigger: mode === "backfill" ? "backfill" : "manual",
    });
    if (options.wait) {
      const summary = await started.promise;
      return NextResponse.json(summary, { status: summary.status === "error" ? 502 : 200 });
    }
    return NextResponse.json(
      {
        runId: started.runId,
        mode: started.mode,
        trigger: started.trigger,
        startedAt: started.startedAt,
        status: "running",
      },
      { status: 202 },
    );
  } catch (err) {
    const appError = toAppError(err);
    return NextResponse.json(
      { error: appError.message, kind: appError.kind, ...(appError.context ?? {}) },
      { status: appError.status ?? 500 },
    );
  }
}

export async function GET() {
  const status = getSyncStatus();
  return NextResponse.json({ config: getSyncConfig(), ...status });
}
