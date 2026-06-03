import type { RequestHandler } from "msw";

/**
 * Default request handlers for tests. Per-test handlers are usually added with
 * `server.use(...)`; this base set stays empty so tests opt in explicitly.
 */
export const handlers: RequestHandler[] = [];
