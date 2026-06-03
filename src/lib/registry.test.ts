import { describe, expect, it } from "vitest";
import { METRICS, RATE_LIMITS, byUserMetrics, getMetric, metricsForSection } from "./registry";

describe("metric registry", () => {
  it("has unique metric ids", () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every metric references a known rate-limit group", () => {
    for (const m of METRICS) {
      expect(RATE_LIMITS[m.rateLimitGroup]).toBeGreaterThan(0);
    }
  });

  it("resolves metrics by id and section", () => {
    expect(getMetric("models")?.label).toBe("Model usage");
    expect(getMetric("does-not-exist")).toBeUndefined();
    expect(metricsForSection("spend").some((m) => m.id === "spend")).toBe(true);
  });

  it("flags by-user analytics metrics", () => {
    const byUser = byUserMetrics().map((m) => m.id);
    expect(byUser).toContain("models");
    expect(byUser).not.toContain("dau");
  });
});
