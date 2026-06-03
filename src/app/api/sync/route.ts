import { NextResponse } from "next/server";
import { z } from "zod";
import { toAppError } from "@/lib/errors";
import { getSyncConfig, getSyncStatus, runSync } from "@/lib/sync";

/**
 * Sync trigger + status API.
 *  - POST { mode?, days? } runs a sync and returns the run summary.
 *  - GET returns current sync config + `sync_state` + the latest run/items.
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
    const summary = await runSync({
      mode,
      days: options.days,
      only: options.only,
      trigger: mode === "backfill" ? "backfill" : "manual",
    });
    const httpStatus = summary.status === "error" ? 502 : 200;
    return NextResponse.json(summary, { status: httpStatus });
  } catch (err) {
    const appError = toAppError(err);
    return NextResponse.json(
      { error: appError.message, kind: appError.kind },
      { status: appError.status ?? 500 },
    );
  }
}

export async function GET() {
  const status = getSyncStatus();
  return NextResponse.json({ config: getSyncConfig(), ...status });
}
