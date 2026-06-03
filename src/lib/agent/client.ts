import "server-only";
import { Agent, Cursor, CursorAgentError, type SDKAgent } from "@cursor/sdk";
import { logger } from "@/lib/logger";
import {
  DEFAULT_AGENT_MODEL_ID,
  type AgentModelOption,
  type AgentStreamEvent,
  type ChatMessage,
} from "./types";
import { normalizeAgentModelOptions } from "./model-options";

/**
 * Thin wrapper around `@cursor/sdk`'s local runtime for the Ask Agent. Creates an
 * agent rooted at the repo (so it can shell out to `data/query.mjs`), sends one
 * question, and yields the assistant's answer as a stream of {@link AgentStreamEvent}s.
 *
 * Failure handling follows the SDK's two-mode taxonomy:
 *  - a thrown `CursorAgentError` means the run never started (auth / config / runtime);
 *  - `result.status === "error"` means it started but failed mid-flight.
 * Either way we degrade gracefully — we yield a friendly `error` event and never throw,
 * so the route stays a normal 200 stream instead of crashing.
 */

const log = logger.child({ module: "agent" });

export interface StreamAgentOptions {
  /** Cursor SDK key (CURSOR_API_KEY) — NOT a team Admin API key. */
  apiKey: string;
  /** The user's natural-language question. */
  prompt: string;
  /** System prompt (schema + querying guidance) from `buildSystemPrompt()`. */
  systemPrompt: string;
  /** Prior turns, oldest first. */
  history?: ChatMessage[];
  /** Model id; defaults to "auto". */
  modelId?: string;
  /** Repo root the local agent runs in. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Aborts the run when the client disconnects or hits "Stop". */
  signal?: AbortSignal;
}

/** List SDK models available to the configured API key for the Ask Agent picker. */
export async function listAgentModels(apiKey: string): Promise<AgentModelOption[]> {
  const models = await Cursor.models.list({ apiKey });
  return normalizeAgentModelOptions(models);
}

/**
 * Fold the system prompt, prior turns, and the new question into a single message.
 * Each request spins up a fresh stateless agent, so the whole context travels in one send.
 */
export function composeMessage(
  systemPrompt: string,
  prompt: string,
  history: ChatMessage[] = [],
): string {
  const parts = [systemPrompt.trim()];
  if (history.length > 0) {
    const transcript = history
      .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
      .join("\n\n");
    parts.push(`Conversation so far:\n\n${transcript}`);
  }
  parts.push(`Current question:\n\n${prompt.trim()}`);
  return parts.join("\n\n---\n\n");
}

/** Human-friendly status line for a running tool call. */
function describeTool(name: string, args: unknown): string {
  if (args && typeof args === "object" && "command" in args) {
    const command = String((args as { command: unknown }).command ?? "");
    if (command.includes("query.mjs")) return "Querying the database…";
  }
  return `Running ${name}…`;
}

/** Map an unexpected/never-started failure to a friendly, actionable error event. */
function toErrorEvent(err: unknown): AgentStreamEvent {
  if (err instanceof CursorAgentError) {
    const isAuth =
      err.status === 401 ||
      err.code === "unauthenticated" ||
      err.code === "permission_denied" ||
      /\b(auth|api key|unauthor)/i.test(err.message);
    log.warn(
      { code: err.code, status: err.status, retryable: err.isRetryable },
      `ask-agent startup failed: ${err.message}`,
    );
    if (isAuth) {
      return {
        type: "error",
        code: "auth",
        value:
          "Cursor rejected the API key. The Ask Agent needs a personal or service-account " +
          "CURSOR_API_KEY — team Admin API keys are not accepted by the SDK. Update it in Settings.",
      };
    }
    return {
      type: "error",
      code: "startup",
      value:
        `The agent couldn't start (${err.message}). This usually means Cursor's local agent ` +
        "runtime isn't available on this host. The dashboards still work without it.",
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  log.error({ err: message }, "ask-agent unexpected error");
  return {
    type: "error",
    code: "unknown",
    value: `Something went wrong running the agent: ${message}`,
  };
}

/** Best-effort disposal that tolerates older runtimes without `Symbol.asyncDispose`. */
async function disposeAgent(agent: SDKAgent): Promise<void> {
  try {
    await agent[Symbol.asyncDispose]();
  } catch {
    try {
      agent.close();
    } catch {
      // best effort — nothing more we can do
    }
  }
}

/** Run one question and stream the answer as NDJSON-friendly events. Never throws. */
export async function* streamAgentAnswer(
  options: StreamAgentOptions,
): AsyncGenerator<AgentStreamEvent> {
  const {
    apiKey,
    prompt,
    systemPrompt,
    history = [],
    modelId = DEFAULT_AGENT_MODEL_ID,
    cwd = process.cwd(),
    signal,
  } = options;

  let agent: SDKAgent | null = null;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: modelId },
      // Local runtime, inline-only settings (no ambient project/user/team config).
      local: { cwd, settingSources: [] },
    });

    const run = await agent.send(composeMessage(systemPrompt, prompt, history));
    // Log identifiers immediately after send so a hung stream is investigable.
    log.info({ agentId: agent.agentId, runId: run.id }, "ask-agent run started");

    const cancelOnAbort = () => {
      if (run.supports("cancel")) void run.cancel().catch(() => {});
    };
    if (signal?.aborted) cancelOnAbort();
    else signal?.addEventListener("abort", cancelOnAbort, { once: true });

    let emittedText = false;
    try {
      for await (const message of run.stream()) {
        if (signal?.aborted) break;
        if (message.type === "assistant") {
          // Assistant messages stream as text deltas; concatenating them yields the answer.
          for (const block of message.message.content) {
            if (block.type === "text" && block.text) {
              emittedText = true;
              yield { type: "text", value: block.text };
            }
          }
        } else if (message.type === "tool_call" && message.status === "running") {
          yield { type: "status", value: describeTool(message.name, message.args) };
        }
      }
    } finally {
      signal?.removeEventListener("abort", cancelOnAbort);
    }

    const result = await run.wait();
    log.info(
      { runId: result.id, status: result.status, durationMs: result.durationMs },
      "ask-agent run finished",
    );

    if (signal?.aborted) {
      yield { type: "done", status: "cancelled" };
      return;
    }
    if (result.status === "error") {
      yield {
        type: "error",
        code: "run_error",
        value:
          "The agent run failed before it could finish answering. Check that Cursor's agent " +
          "runtime is available on this host, then try again.",
      };
      yield { type: "done", status: "error" };
      return;
    }
    // Fallback: the stream produced no text but the run returned a final answer.
    if (!emittedText && result.result) {
      yield { type: "text", value: result.result };
    }
    yield { type: "done", status: result.status };
  } catch (err) {
    yield toErrorEvent(err);
    yield { type: "done", status: "error" };
  } finally {
    if (agent) await disposeAgent(agent);
  }
}
