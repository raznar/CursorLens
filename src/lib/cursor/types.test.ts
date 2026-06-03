import { describe, expect, it } from "vitest";
import { ByUserTopFileExtensionsResponseSchema, DailyUsageResponseSchema } from "./types";

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
