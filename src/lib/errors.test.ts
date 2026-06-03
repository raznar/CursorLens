import { describe, expect, it } from "vitest";
import {
  AuthError,
  NotFoundError,
  RateLimitError,
  TransportError,
  ValidationError,
  errorFromStatus,
  toAppError,
} from "./errors";

describe("error taxonomy", () => {
  it("maps HTTP statuses to typed errors", () => {
    expect(errorFromStatus(401, "x")).toBeInstanceOf(AuthError);
    expect(errorFromStatus(403, "x").kind).toBe("auth");
    expect(errorFromStatus(404, "x")).toBeInstanceOf(NotFoundError);
    expect(errorFromStatus(429, "x")).toBeInstanceOf(RateLimitError);
    expect(errorFromStatus(500, "x")).toBeInstanceOf(TransportError);
  });

  it("marks 429 and 5xx as retryable, 4xx as not", () => {
    expect(errorFromStatus(429, "x").retryable).toBe(true);
    expect(errorFromStatus(503, "x").retryable).toBe(true);
    expect(errorFromStatus(400, "x").retryable).toBe(false);
    expect(errorFromStatus(401, "x").retryable).toBe(false);
  });

  it("carries status and retryAfterMs", () => {
    const err = new RateLimitError("slow down", { status: 429, retryAfterMs: 60_000 });
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(60_000);
    expect(err.toJSON()).toMatchObject({ kind: "rate_limit", retryable: true });
  });

  it("coerces unknown throwables", () => {
    expect(toAppError(new Error("boom")).kind).toBe("unknown");
    expect(toAppError("oops").message).toBe("oops");
    const passthrough = new AuthError();
    expect(toAppError(passthrough)).toBe(passthrough);
  });

  it("appends the first Zod issue path to validation errors", () => {
    const err = new ValidationError("Cursor API response failed schema validation", {
      context: {
        issues: [{ path: ["teamMembers", 0, "id"], message: "Invalid input" }],
      },
    });
    expect(toAppError(err).message).toContain("teamMembers.0.id");
  });
});
