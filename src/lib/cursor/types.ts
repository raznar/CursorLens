/**
 * Zod schemas for every Cursor Admin + Analytics API response, plus the inferred
 * TypeScript types. These are the single source of truth for the API surface: the
 * client validates every response against them, and the sync transforms consume the
 * inferred types. See the `sync-and-rate-limits` and `adding-a-cursor-endpoint` skills.
 *
 * Conventions:
 * - Schemas are lenient on optionality (`.nullish()`) because the API omits fields for
 *   inactive users / non-token calls, but strict on the field *shapes* we depend on.
 * - Unknown extra keys are stripped (Zod's object default), so upstream additions never
 *   break validation.
 * - Money/timestamps are kept in the API's native form here; the sync layer normalizes
 *   them to the DB's units (epoch-ms integers, fractional cents, day strings).
 *
 * This module is pure data — it imports only `zod` and must never reach into `db`, the
 * sync engine, or UI (enforced by `.dependency-cruiser.cjs`).
 */
import { z } from "zod";

/** A numeric or string scalar — the API is inconsistent about timestamps (ms as string). */
const numericString = z.union([z.string(), z.number()]);

/** Member/user id — documented as number; many teams get stable `user_…` string ids. */
export const ApiUserIdSchema = z.union([z.number(), z.string()]);

/**
 * Pagination envelope. Different endpoints use different field names
 * (`page`/`currentPage`, `totalPages`/`numPages`, `totalCount`/`totalUsers`/`totalItems`),
 * so we accept the superset and normalize when following pages (see `pagination.ts`).
 */
export const PaginationSchema = z.object({
  page: z.number().optional(),
  currentPage: z.number().optional(),
  pageSize: z.number().optional(),
  totalCount: z.number().optional(),
  totalUsers: z.number().optional(),
  totalItems: z.number().optional(),
  totalPages: z.number().optional(),
  numPages: z.number().optional(),
  hasNextPage: z.boolean().optional(),
  hasPreviousPage: z.boolean().optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/** Per-page `userMappings` returned by by-user analytics endpoints (id <-> email). */
export const UserMappingSchema = z.object({ id: z.string(), email: z.string() });

const AnalyticsParamsSchema = z
  .object({
    metric: z.string().optional(),
    teamId: z.number().optional(),
    startDate: numericString.optional(),
    endDate: numericString.optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    userMappings: z.array(UserMappingSchema).optional(),
    include: z.array(z.string()).optional(),
  })
  .nullish();

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

export const TeamMemberSchema = z.object({
  id: ApiUserIdSchema,
  email: z.string(),
  name: z.string().nullish(),
  role: z.string().nullish(),
  isRemoved: z.boolean().nullish(),
});
export const TeamMembersResponseSchema = z.object({
  teamMembers: z.array(TeamMemberSchema),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const AuditLogEventSchema = z.object({
  event_id: z.string(),
  timestamp: numericString.nullish(),
  ip_address: z.string().nullish(),
  user_email: z.string().nullish(),
  event_type: z.string().nullish(),
  event_data: z.unknown().optional(),
});
export const AuditLogsResponseSchema = z.object({
  events: z.array(AuditLogEventSchema),
  pagination: PaginationSchema.optional(),
  params: z.unknown().optional(),
});
export type AuditLogEvent = z.infer<typeof AuditLogEventSchema>;

export const DailyUsageRowSchema = z.object({
  userId: ApiUserIdSchema,
  day: z.string(),
  date: z.number().nullish(),
  email: z.string().nullish(),
  isActive: z.boolean().nullish(),
  totalLinesAdded: z.number().nullish(),
  totalLinesDeleted: z.number().nullish(),
  acceptedLinesAdded: z.number().nullish(),
  acceptedLinesDeleted: z.number().nullish(),
  totalApplies: z.number().nullish(),
  totalAccepts: z.number().nullish(),
  totalRejects: z.number().nullish(),
  totalTabsShown: z.number().nullish(),
  totalTabsAccepted: z.number().nullish(),
  composerRequests: z.number().nullish(),
  chatRequests: z.number().nullish(),
  agentRequests: z.number().nullish(),
  cmdkUsages: z.number().nullish(),
  subscriptionIncludedReqs: z.number().nullish(),
  apiKeyReqs: z.number().nullish(),
  usageBasedReqs: z.number().nullish(),
  bugbotUsages: z.number().nullish(),
  mostUsedModel: z.string().nullish(),
  applyMostUsedExtension: z.string().nullish(),
  tabMostUsedExtension: z.string().nullish(),
  clientVersion: z.string().nullish(),
});
export const DailyUsageResponseSchema = z.object({
  data: z.array(DailyUsageRowSchema),
  period: z.object({ startDate: z.number(), endDate: z.number() }).nullish(),
  pagination: PaginationSchema.optional(),
});
export type DailyUsageRow = z.infer<typeof DailyUsageRowSchema>;

export const SpendRowSchema = z.object({
  userId: ApiUserIdSchema,
  name: z.string().nullish(),
  email: z.string().nullish(),
  role: z.string().nullish(),
  spendCents: z.number().nullish(),
  overallSpendCents: z.number().nullish(),
  fastPremiumRequests: z.number().nullish(),
  hardLimitOverrideDollars: z.number().nullish(),
  monthlyLimitDollars: z.number().nullish(),
});
export const SpendResponseSchema = z.object({
  teamMemberSpend: z.array(SpendRowSchema),
  subscriptionCycleStart: z.number().nullish(),
  totalMembers: z.number().nullish(),
  totalPages: z.number().nullish(),
});
export type SpendRow = z.infer<typeof SpendRowSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number().nullish(),
  outputTokens: z.number().nullish(),
  cacheWriteTokens: z.number().nullish(),
  cacheReadTokens: z.number().nullish(),
  totalCents: z.number().nullish(),
  discountPercentOff: z.number().nullish(),
});
export const UsageEventSchema = z.object({
  timestamp: numericString,
  userEmail: z.string().nullish(),
  serviceAccountId: z.string().nullish(),
  serviceAccountName: z.string().nullish(),
  model: z.string().nullish(),
  kind: z.string().nullish(),
  maxMode: z.boolean().nullish(),
  requestsCosts: z.number().nullish(),
  isTokenBasedCall: z.boolean().nullish(),
  isChargeable: z.boolean().nullish(),
  isHeadless: z.boolean().nullish(),
  tokenUsage: TokenUsageSchema.nullish(),
  chargedCents: z.number().nullish(),
  cursorTokenFee: z.number().nullish(),
});
export const UsageEventsResponseSchema = z.object({
  totalUsageEventsCount: z.number().nullish(),
  pagination: PaginationSchema.optional(),
  usageEvents: z.array(UsageEventSchema),
  period: z.unknown().optional(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;

// ---------------------------------------------------------------------------
// Analytics API — team level
// ---------------------------------------------------------------------------

/** `total_*_lines_*` columns shared by agent-edits and tabs. */
const lineColumns = {
  total_green_lines_accepted: z.number().nullish(),
  total_red_lines_accepted: z.number().nullish(),
  total_green_lines_rejected: z.number().nullish(),
  total_red_lines_rejected: z.number().nullish(),
  total_green_lines_suggested: z.number().nullish(),
  total_red_lines_suggested: z.number().nullish(),
  total_lines_suggested: z.number().nullish(),
  total_lines_accepted: z.number().nullish(),
};

/** Wrap a row schema in the standard `{ data: Row[], params }` analytics envelope. */
function teamArrayResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({ data: z.array(row), params: AnalyticsParamsSchema });
}

export const DauRowSchema = z.object({
  date: z.string(),
  dau: z.number().nullish(),
  cli_dau: z.number().nullish(),
  cloud_agent_dau: z.number().nullish(),
  bugbot_dau: z.number().nullish(),
});
export const DauResponseSchema = teamArrayResponse(DauRowSchema);
export type DauRow = z.infer<typeof DauRowSchema>;

export const AgentEditsRowSchema = z.object({
  event_date: z.string(),
  total_suggested_diffs: z.number().nullish(),
  total_accepted_diffs: z.number().nullish(),
  total_rejected_diffs: z.number().nullish(),
  ...lineColumns,
});
export const AgentEditsResponseSchema = teamArrayResponse(AgentEditsRowSchema);
export type AgentEditsRow = z.infer<typeof AgentEditsRowSchema>;

export const TabsRowSchema = z.object({
  event_date: z.string(),
  total_suggestions: z.number().nullish(),
  total_accepts: z.number().nullish(),
  total_rejects: z.number().nullish(),
  ...lineColumns,
});
export const TabsResponseSchema = teamArrayResponse(TabsRowSchema);
export type TabsRow = z.infer<typeof TabsRowSchema>;

export const ClientVersionRowSchema = z.object({
  event_date: z.string(),
  client_version: z.string(),
  user_count: z.number().nullish(),
  percentage: z.number().nullish(),
});
export const ClientVersionsResponseSchema = teamArrayResponse(ClientVersionRowSchema);
export type ClientVersionRow = z.infer<typeof ClientVersionRowSchema>;

/** `model_breakdown` maps a model name to its messages/users for that day. */
export const ModelBreakdownEntrySchema = z.object({
  messages: z.number().nullish(),
  users: z.number().nullish(),
});
export const ModelsRowSchema = z.object({
  date: z.string(),
  model_breakdown: z.record(z.string(), ModelBreakdownEntrySchema),
});
export const ModelsResponseSchema = teamArrayResponse(ModelsRowSchema);
export type ModelsRow = z.infer<typeof ModelsRowSchema>;

/** Team `/analytics/team/top-file-extensions` — one row per day per extension. */
export const TopFileExtensionRowSchema = z.object({
  event_date: z.string(),
  file_extension: z.string().nullish(),
  total_files: z.number().nullish(),
  total_accepts: z.number().nullish(),
  total_rejects: z.number().nullish(),
  total_lines_suggested: z.number().nullish(),
  total_lines_accepted: z.number().nullish(),
  total_lines_rejected: z.number().nullish(),
});
export const TopFileExtensionsResponseSchema = teamArrayResponse(TopFileExtensionRowSchema);
export type TopFileExtensionRow = z.infer<typeof TopFileExtensionRowSchema>;

/**
 * By-user `/analytics/by-user/top-file-extensions` — window aggregates per extension; the live
 * API omits `event_date` on each row (unlike the team endpoint). Sync stamps `event_date` from
 * the chunk end when missing.
 */
export const ByUserTopFileExtensionRowSchema = z.object({
  event_date: z.string().optional(),
  date: z.string().optional(),
  file_extension: z.string().nullish(),
  total_files: z.number().nullish(),
  total_accepts: z.number().nullish(),
  total_rejects: z.number().nullish(),
  total_lines_suggested: z.number().nullish(),
  total_lines_accepted: z.number().nullish(),
  total_lines_rejected: z.number().nullish(),
});
export type ByUserTopFileExtensionRow = z.infer<typeof ByUserTopFileExtensionRowSchema>;

export const McpRowSchema = z.object({
  event_date: z.string(),
  tool_name: z.string(),
  mcp_server_name: z.string(),
  usage: z.number().nullish(),
});
export const McpResponseSchema = teamArrayResponse(McpRowSchema);
export type McpRow = z.infer<typeof McpRowSchema>;

export const CommandsRowSchema = z.object({
  event_date: z.string(),
  command_name: z.string(),
  usage: z.number().nullish(),
});
export const CommandsResponseSchema = teamArrayResponse(CommandsRowSchema);
export type CommandsRow = z.infer<typeof CommandsRowSchema>;

/** Plans and ask-mode share the `{ event_date, model, usage }` shape. */
export const ModelUsageRowSchema = z.object({
  event_date: z.string(),
  model: z.string(),
  usage: z.number().nullish(),
});
export const PlansResponseSchema = teamArrayResponse(ModelUsageRowSchema);
export const AskModeResponseSchema = teamArrayResponse(ModelUsageRowSchema);
export type ModelUsageRow = z.infer<typeof ModelUsageRowSchema>;

export const SkillsRowSchema = z.object({
  event_date: z.string(),
  skill_name: z.string(),
  usage: z.number().nullish(),
});
export const SkillsResponseSchema = teamArrayResponse(SkillsRowSchema);
export type SkillsRow = z.infer<typeof SkillsRowSchema>;

/**
 * Conversation insights: one object per slice. The label field name varies by slice
 * (`intent`, `complexity`, `category`, `guidanceLevel`, `workType`), so distribution /
 * time-series items are validated as flat records and the label is extracted by the
 * transform (the non-`date`/`count` key).
 */
const InsightItemSchema = z.record(z.string(), z.union([z.string(), z.number()]));
export const ConversationSliceSchema = z.object({
  distribution: z.array(InsightItemSchema).optional(),
  timeSeries: z.array(InsightItemSchema).optional(),
  topValues: z.array(z.unknown()).optional(),
  subcategories: z.unknown().optional(),
});
export const ConversationInsightsResponseSchema = z.object({
  data: z
    .object({
      intents: ConversationSliceSchema.optional(),
      complexity: ConversationSliceSchema.optional(),
      categories: ConversationSliceSchema.optional(),
      guidanceLevels: ConversationSliceSchema.optional(),
      workTypes: ConversationSliceSchema.optional(),
    })
    .optional(),
  params: AnalyticsParamsSchema,
});
export type ConversationSlice = z.infer<typeof ConversationSliceSchema>;

export const LeaderboardEntrySchema = z.object({
  email: z.string().nullish(),
  user_id: z.string(),
  profile_picture_url: z.string().nullish(),
  total_accepts: z.number().nullish(),
  total_lines_accepted: z.number().nullish(),
  total_lines_suggested: z.number().nullish(),
  line_acceptance_ratio: z.number().nullish(),
  accept_ratio: z.number().nullish(),
  rank: z.number().nullish(),
});
const LeaderboardBoardSchema = z.object({
  data: z.array(LeaderboardEntrySchema),
  total_users: z.number().nullish(),
});
export const LeaderboardResponseSchema = z.object({
  data: z.object({
    tab_leaderboard: LeaderboardBoardSchema.nullish(),
    agent_leaderboard: LeaderboardBoardSchema.nullish(),
  }),
  pagination: PaginationSchema.optional(),
  params: AnalyticsParamsSchema,
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

const SeveritySchema = z.object({
  high: z.number().nullish(),
  medium: z.number().nullish(),
  low: z.number().nullish(),
});
export const BugbotRowSchema = z.object({
  repo: z.string(),
  pr_number: z.number(),
  timestamp: numericString.nullish(),
  reviews: z.number().nullish(),
  issues: z
    .object({ total: z.number().nullish(), by_severity: SeveritySchema.nullish() })
    .nullish(),
  issues_resolved: z
    .object({ total: z.number().nullish(), by_severity: SeveritySchema.nullish() })
    .nullish(),
});
export const BugbotResponseSchema = z.object({
  data: z.array(BugbotRowSchema),
  pagination: PaginationSchema.optional(),
  params: AnalyticsParamsSchema,
});
export type BugbotRow = z.infer<typeof BugbotRowSchema>;

// ---------------------------------------------------------------------------
// Analytics API — by user (data keyed by email)
// ---------------------------------------------------------------------------

/** Build the `{ data: { email: Row[] }, pagination, params }` by-user envelope. */
function byUserResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    data: z.record(z.string(), z.array(row)),
    pagination: PaginationSchema.optional(),
    params: AnalyticsParamsSchema,
  });
}

export const ByUserAgentEditsResponseSchema = byUserResponse(AgentEditsRowSchema);
export const ByUserTabsResponseSchema = byUserResponse(TabsRowSchema);
export const ByUserModelsResponseSchema = byUserResponse(ModelsRowSchema);
export const ByUserTopFileExtensionsResponseSchema = byUserResponse(
  ByUserTopFileExtensionRowSchema,
);
export const ByUserClientVersionsResponseSchema = byUserResponse(ClientVersionRowSchema);
export const ByUserMcpResponseSchema = byUserResponse(McpRowSchema);
export const ByUserCommandsResponseSchema = byUserResponse(CommandsRowSchema);
export const ByUserPlansResponseSchema = byUserResponse(ModelUsageRowSchema);
export const ByUserSkillsResponseSchema = byUserResponse(SkillsRowSchema);
export const ByUserAskModeResponseSchema = byUserResponse(ModelUsageRowSchema);

/** Generic by-user response type (data keyed by email -> rows). */
export type ByUserResponse<Row> = {
  data: Record<string, Row[]>;
  pagination?: Pagination;
  params?: { userMappings?: { id: string; email: string }[] } & Record<string, unknown>;
};
