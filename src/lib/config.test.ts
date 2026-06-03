import { describe, expect, it } from "vitest";
import { EnvSchema } from "./config";

describe("EnvSchema", () => {
  it("applies sensible defaults", () => {
    const env = EnvSchema.parse({});
    expect(env.DATA_DIR).toBe("./data");
    expect(env.CURSOR_API_BASE_URL).toBe("https://api.cursor.com");
    expect(env.CURSOR_MOCK).toBe("0");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("rejects an invalid base URL", () => {
    expect(EnvSchema.safeParse({ CURSOR_API_BASE_URL: "not-a-url" }).success).toBe(false);
  });

  it("rejects a too-short secret", () => {
    expect(EnvSchema.safeParse({ CURSOR_LENS_SECRET: "short" }).success).toBe(false);
    expect(EnvSchema.safeParse({ ANALYTICS_AGENT_SECRET: "short" }).success).toBe(false);
  });
});
