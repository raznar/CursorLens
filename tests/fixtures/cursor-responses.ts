/**
 * Minimal fixtures derived from the documented Admin + Analytics API responses, used by the
 * msw-backed client tests. (The full offline dataset lives in `src/lib/cursor/mock.ts`.)
 */

export const membersResponse = {
  teamMembers: [
    { id: 12345, name: "Alex", email: "developer@company.com", role: "member", isRemoved: false },
    { id: 12346, name: "Sam", email: "admin@company.com", role: "owner", isRemoved: false },
  ],
};

export const dauResponse = {
  data: [
    { date: "2025-01-15", dau: 42, cli_dau: 5, cloud_agent_dau: 37, bugbot_dau: 10 },
    { date: "2025-01-16", dau: 38, cli_dau: 4, cloud_agent_dau: 34, bugbot_dau: 12 },
  ],
  params: { metric: "dau", teamId: 12345, startDate: "2025-01-15", endDate: "2025-01-16" },
};

/** One spend row per page; `totalPages: 2` drives totalPages-based pagination. */
export function spendPage(page: number) {
  return {
    teamMemberSpend: [
      {
        userId: page,
        name: `User ${page}`,
        email: `user${page}@company.com`,
        role: "member",
        spendCents: 1000 * page,
        overallSpendCents: 1500 * page,
        fastPremiumRequests: 100 * page,
        hardLimitOverrideDollars: 0,
        monthlyLimitDollars: page === 1 ? 200 : null,
      },
    ],
    subscriptionCycleStart: 1708992000000,
    totalMembers: 2,
    totalPages: 2,
  };
}

/** One event per page; `hasNextPage` drives boolean-based pagination. */
export function usageEventsPage(page: number, hasNextPage: boolean) {
  return {
    totalUsageEventsCount: 2,
    pagination: {
      numPages: 2,
      currentPage: page,
      pageSize: 1,
      hasNextPage,
      hasPreviousPage: page > 1,
    },
    usageEvents: [
      {
        timestamp: String(1750979225854 + page),
        userEmail: "developer@company.com",
        model: "claude-opus-4.5",
        kind: "Usage-based",
        maxMode: true,
        requestsCosts: 5,
        isTokenBasedCall: true,
        isChargeable: true,
        isHeadless: false,
        tokenUsage: {
          inputTokens: 126,
          outputTokens: 450,
          cacheWriteTokens: 6112,
          cacheReadTokens: 11964,
          totalCents: 20.18,
        },
        chargedCents: 21.36,
        cursorTokenFee: 1.18,
      },
    ],
    period: { startDate: 0, endDate: 1 },
  };
}
