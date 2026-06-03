import { z } from "zod";
import { deleteReport, updateReport } from "@/lib/reports";
import type { UpdateReportPatch } from "@/lib/reports";

/** Single saved-report endpoint. Node runtime (better-sqlite3), never prerendered. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  response: z.string().min(1).max(200000).optional(),
  sql: z.string().max(20000).nullish(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update." },
      { status: 400 },
    );
  }

  const patch: UpdateReportPatch = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.prompt !== undefined) patch.prompt = parsed.data.prompt;
  if (parsed.data.response !== undefined) patch.response = parsed.data.response;
  if (parsed.data.sql !== undefined) patch.sql = parsed.data.sql;

  const report = updateReport(id, patch);
  if (!report) {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }
  return Response.json({ report });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!deleteReport(id)) {
    return Response.json({ error: "Report not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
