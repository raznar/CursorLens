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

  it("registers the newer endpoint families with their own buckets and sections", () => {
    expect(getMetric("bugbot-reviews")?.endpoint).toBe("/analytics/team/bugbot-reviews");
    expect(getMetric("billing-groups")?.rateLimitGroup).toBe("adminGroups");
    expect(getMetric("directory-groups")?.section).toBe("members");
    expect(getMetric("ai-code-commits")).toMatchObject({
      source: "ai-code",
      section: "ai-code",
      rateLimitGroup: "aiCodeCommits",
      enterpriseOnly: true,
    });
    expect(getMetric("usage-events")?.rateLimitGroup).toBe("adminUsageEvents");
    expect(RATE_LIMITS.adminUsageEvents).toBe(60);
  });

  it("flags by-user analytics metrics", () => {
    const byUser = byUserMetrics().map((m) => m.id);
    expect(byUser).toContain("models");
    expect(byUser).not.toContain("dau");
  });
});
