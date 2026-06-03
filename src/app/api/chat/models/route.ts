import { listAgentModels } from "@/lib/agent";
import { getCursorApiKey } from "@/lib/keys";
import { logger } from "@/lib/logger";

/** Lists Cursor SDK models available to the configured Ask Agent API key. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/chat/models" });

export async function GET(): Promise<Response> {
  const apiKey = getCursorApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error: "No Cursor API key is configured. Add a CURSOR_API_KEY in Settings to list models.",
        code: "no_key",
      },
      { status: 400 },
    );
  }

  try {
    const models = await listAgentModels(apiKey);
    return Response.json({ models });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "failed to list agent models",
    );
    return Response.json(
      {
        error: "Could not load Cursor models. The Ask Agent can still use Auto.",
        code: "models_unavailable",
      },
      { status: 502 },
    );
  }
}
