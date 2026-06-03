import "server-only";

/**
 * Server-only entrypoint for the embedded Ask Agent. Routes import from `@/lib/agent`:
 *
 *   import { buildSystemPrompt, streamAgentAnswer } from "@/lib/agent";
 *
 * Wire types live in `./types` (no `server-only`) so the client chat UI can import them.
 */
export { buildSystemPrompt, readSchemaDoc, QUERY_RUNNER, SCHEMA_DOC } from "./prompt";
export type { BuildSystemPromptOptions } from "./prompt";
export { streamAgentAnswer, composeMessage, listAgentModels } from "./client";
export type { StreamAgentOptions } from "./client";
export type { AgentModelOption, AgentStreamEvent, ChatMessage } from "./types";
