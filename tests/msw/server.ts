import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * Shared MSW server for integration tests of the Cursor API client. Import this in a test
 * file and drive it with the lifecycle helper below.
 *
 *   import { server, useMswServer } from "../../tests/msw/server";
 *   useMswServer();
 */
export const server = setupServer(...handlers);

export function useMswServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
