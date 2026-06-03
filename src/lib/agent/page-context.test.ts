import { describe, expect, it } from "vitest";
import { derivePageContext, formatPageContextForPrompt } from "./page-context";

describe("derivePageContext", () => {
  it("resolves models page with section metrics and date range", () => {
    const ctx = derivePageContext({ pathname: "/models", range: "7d" });
    expect(ctx.title).toBe("Models");
    expect(ctx.section).toBe("models");
    expect(ctx.dateRange.value).toBe("7d");
    expect(ctx.metrics.length).toBeGreaterThan(0);
    expect(ctx.metrics.some((m) => m.id === "usage-events")).toBe(true);
  });

  it("defaults range when omitted", () => {
    const ctx = derivePageContext({ pathname: "/spend" });
    expect(ctx.dateRange.value).toBe("30d");
  });

  it("handles unknown routes without a section", () => {
    const ctx = derivePageContext({ pathname: "/settings" });
    expect(ctx.title).toBe("Settings");
    expect(ctx.section).toBeNull();
    expect(ctx.metrics).toEqual([]);
  });

  it("normalizes trailing slashes", () => {
    const ctx = derivePageContext({ pathname: "/models/" });
    expect(ctx.pathname).toBe("/models");
    expect(ctx.section).toBe("models");
  });
});

describe("formatPageContextForPrompt", () => {
  it("includes section metrics for analytics pages", () => {
    const ctx = derivePageContext({ pathname: "/adoption", range: "14d" });
    const text = formatPageContextForPrompt(ctx);
    expect(text).toContain("Adoption");
    expect(text).toContain("section `adoption`");
    expect(text).toContain("dau");
    expect(text).toContain("data/query.mjs");
  });

  it("describes non-analytics pages without metrics", () => {
    const ctx = derivePageContext({ pathname: "/settings" });
    const text = formatPageContextForPrompt(ctx);
    expect(text).toContain("Settings");
    expect(text).not.toContain("section `");
  });
});
