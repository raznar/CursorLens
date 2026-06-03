import { z } from "zod";
import { createReport, listReports } from "@/lib/reports";
import { logger } from "@/lib/logger";

/** Saved-reports collection endpoint. Node runtime (better-sqlite3), never prerendered. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/reports" });

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Give the conversation a name.").max(120),
  prompt: z.string().trim().min(1, "A conversation needs a prompt.").max(4000),
  response: z.string().min(1, "A conversation needs an agent response.").max(200000),
  sql: z.string().max(20000).nullish(),
});

export async function GET(): Promise<Response> {
  return Response.json({ reports: listReports() });
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid report." },
      { status: 400 },
    );
  }

  try {
    const report = createReport({
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      response: parsed.data.response,
      sql: parsed.data.sql ?? null,
    });
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    log.error({ err }, "failed to save report");
    return Response.json(
      {
        error: "Could not save the conversation. Check that database migrations have been applied.",
        code: "save_failed",
      },
      { status: 500 },
    );
  }
}
