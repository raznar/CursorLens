import { z } from "zod";
import { buildSystemPrompt, streamAgentAnswer } from "@/lib/agent";
import type { AgentStreamEvent, ChatMessage } from "@/lib/agent";
import { derivePageContext } from "@/lib/agent/page-context";
import { getCursorApiKey } from "@/lib/keys";
import { ingestedCacheReadable, isLiveIngestionEnabled } from "@/lib/sync/cache-policy";
import { logger } from "@/lib/logger";

/**
 * Ask Agent chat endpoint. Streams the local Cursor SDK agent's answer back as
 * newline-delimited JSON (one {@link AgentStreamEvent} per line, `text/plain`).
 *
 * Must run on the Node.js runtime (the SDK + better-sqlite3 are native/server-only)
 * and must never be prerendered.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().trim().min(1, "Ask a question to get started.").max(4000),
  modelId: z.string().trim().min(1).max(120).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000),
      }),
    )
    .max(40)
    .optional(),
  page: z
    .object({
      pathname: z.string().min(1).max(200),
      range: z.string().max(20).nullish(),
    })
    .optional(),
});

const encoder = new TextEncoder();
function encodeEvent(event: AgentStreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON.", code: "bad_request" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request.", code: "bad_request" },
      { status: 400 },
    );
  }

  if (isLiveIngestionEnabled() && !ingestedCacheReadable()) {
    return Response.json(
      {
        error:
          "Live ingestion has not completed yet. Run Sync on Settings so the Ask Agent reads " +
          "API data instead of hidden mock fixtures.",
        code: "cache_not_ready",
      },
      { status: 503 },
    );
  }

  const apiKey = getCursorApiKey();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "No Cursor API key is configured. Add a CURSOR_API_KEY (a personal or service-account " +
          "key — team Admin API keys are NOT accepted by the SDK) in Settings to enable the Ask Agent.",
        code: "no_key",
      },
      { status: 400 },
    );
  }

  const pageContext = parsed.data.page ? derivePageContext(parsed.data.page) : undefined;
  const systemPrompt = buildSystemPrompt({ pageContext });
  const history = (parsed.data.history ?? []) as ChatMessage[];
  const log = logger.child({ module: "api/chat" });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAgentAnswer({
          apiKey,
          prompt: parsed.data.prompt,
          systemPrompt,
          history,
          modelId: parsed.data.modelId,
          signal: request.signal,
        })) {
          controller.enqueue(encodeEvent(event));
        }
      } catch (err) {
        // streamAgentAnswer is defensive, but keep the route from ever crashing.
        log.error({ err: err instanceof Error ? err.message : String(err) }, "chat stream crashed");
        controller.enqueue(
          encodeEvent({
            type: "error",
            code: "stream_error",
            value: "The Ask Agent stopped unexpectedly. Please try again.",
          }),
        );
        controller.enqueue(encodeEvent({ type: "done", status: "error" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disable proxy buffering so chunks reach the browser as they're produced.
      "X-Accel-Buffering": "no",
    },
  });
}
