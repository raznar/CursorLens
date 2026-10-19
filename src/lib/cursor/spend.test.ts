import { describe, expect, it } from "vitest";
import { getSpend } from "./admin";
import { CursorHttp } from "./client";

describe("getSpend", () => {
  it("treats 304 as not-modified and does not invent an empty roster", async () => {
    const http = new CursorHttp({
      mock: true,
      apiKey: "test",
      fetchImpl: async (_url, init) => {
        expect(init?.cache).toBe("no-store");
        return new Response(null, { status: 304, headers: { ETag: '"cycle"' } });
      },
    });
    const result = await getSpend(http);
    expect(result.notModified).toBe(true);
    expect(result.rows).toEqual([]);
  });
});
