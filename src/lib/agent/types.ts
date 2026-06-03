/**
 * Wire types for the Ask Agent, shared between the server (the streaming route +
 * SDK wrapper) and the client chat UI. This module is intentionally free of
 * `server-only` and the `@cursor/sdk` import so it can be pulled into the client
 * bundle without leaking server code.
 *
 * The chat route streams newline-delimited JSON (NDJSON): one {@link AgentStreamEvent}
 * per line. The client splits on `\n`, JSON-parses each line, and updates the UI.
 */

/** A single turn in the conversation history sent to / rendered by the agent. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Client-sent hint for the page the user is viewing (server derives metadata). */
export interface ChatPageInput {
  pathname: string;
  range?: string | null;
}

/** Default model selection for local SDK agents; the backend resolves the concrete model. */
export const DEFAULT_AGENT_MODEL_ID = "auto";

/** Model option shown in the Ask Agent UI. */
export interface AgentModelOption {
  id: string;
  displayName: string;
  description?: string;
}

/** One streamed event from `/api/chat`. */
export type AgentStreamEvent =
  | { type: "text"; value: string }
  | { type: "status"; value: string }
  | { type: "error"; value: string; code?: string }
  | { type: "done"; status: "finished" | "error" | "cancelled" };
