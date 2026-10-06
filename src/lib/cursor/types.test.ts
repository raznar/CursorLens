import { describe, expect, it } from "vitest";
import {
  AuditLogsResponseSchema,
  ByUserTopFileExtensionsResponseSchema,
  DailyUsageResponseSchema,
  SpendResponseSchema,
  UsageEventsResponseSchema,
} from "./types";

describe("UsageEventsResponseSchema", () => {
  it("keeps the attribution ids added to filtered-usage-events", () => {
    const parsed = UsageEventsResponseSchema.parse({
      totalUsageEventsCount: 1,
      pagination: { numPages: 1, currentPage: 1, pageSize: 25, hasNextPage: false },
      usageEvents: [
        {
          timestamp: "1750979225854",
          userEmail: "agent-runner@company.com",
          serviceAccountId: "sa_abc123",
          cloudAgentId: "bc-123",
          automationId: "7fc64f90-6d7a-4a5d-91b1-bd1f529a85dd",
          conversationId: "8f2e4a1b-6c3d-4e5f-9a7b-2d1c8e6f4a3b",
          model: "claude-4.5-sonnet",
          kind: "Usage-based",
          chargedCents: 21.36232,
        },
        { timestamp: "1750978339901", userEmail: "admin@company.com", model: "x", kind: "y" },
      ],
    });
    expect(parsed.usageEvents[0]).toMatchObject({
      cloudAgentId: "bc-123",
      automationId: "7fc64f90-6d7a-4a5d-91b1-bd1f529a85dd",
      conversationId: "8f2e4a1b-6c3d-4e5f-9a7b-2d1c8e6f4a3b",
    });
    expect(parsed.usageEvents[1]!.conversationId).toBeUndefined();
  });
});

describe("SpendResponseSchema", () => {
  it("accepts fractional cents and the effective per-user limit", () => {
    const parsed = SpendResponseSchema.parse({
      teamMemberSpend: [
        {
          userId: "user_PDSPmvukpYgZEDXsoNirw3CFhy",
          spendCents: 2450.125487,
          overallSpendCents: 2450.125487,
          fastPremiumRequests: 1250,
          email: "developer@company.com",
          hardLimitOverrideDollars: 100,
          monthlyLimitDollars: 200,
          effectivePerUserLimitDollars: 100,
        },
      ],
      subscriptionCycleStart: 1708992000000,
      totalMembers: 15,
      totalPages: 1,
    });
    expect(parsed.teamMemberSpend[0]!.spendCents).toBeCloseTo(2450.125487, 6);
    expect(parsed.teamMemberSpend[0]!.effectivePerUserLimitDollars).toBe(100);
  });
});

describe("AuditLogsResponseSchema", () => {
  it("accepts application_type including the empty-string legacy value", () => {
    const parsed = AuditLogsResponseSchema.parse({
      events: [
        { event_id: "a", event_type: "login", application_type: "cursor" },
        { event_id: "b", event_type: "routine_run", application_type: "grok_bot" },
        { event_id: "c", event_type: "add_user", application_type: "" },
        { event_id: "d", event_type: "logout" },
      ],
      pagination: { page: 1, pageSize: 100, totalCount: 4, totalPages: 1, hasNextPage: false },
    });
    expect(parsed.events.map((e) => e.application_type)).toEqual([
      "cursor",
      "grok_bot",
      "",
      undefined,
    ]);
  });
});

describe("DailyUsageResponseSchema", () => {
  it("accepts string user ids from the live Admin API", () => {
    const parsed = DailyUsageResponseSchema.safeParse({
      data: [
        {
          userId: "user_abc123",
          day: "2026-06-03",
          date: Date.UTC(2026, 5, 3),
          email: "dev@company.com",
          isActive: true,
          totalLinesAdded: 10,
        },
      ],
      pagination: { page: 1, pageSize: 50, hasNextPage: false },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("ByUserTopFileExtensionsResponseSchema", () => {
  it("accepts rows without event_date (live by-user API shape)", () => {
    const parsed = ByUserTopFileExtensionsResponseSchema.safeParse({
      data: {
        "dev@company.com": [
          {
            file_extension: "ts",
            total_files: 10,
            total_accepts: 2,
            total_rejects: 0,
            total_lines_suggested: 100,
            total_lines_accepted: 50,
            total_lines_rejected: 0,
          },
        ],
      },
      pagination: { page: 1, pageSize: 50, hasNextPage: false },
    });
    expect(parsed.success).toBe(true);
  });
});
