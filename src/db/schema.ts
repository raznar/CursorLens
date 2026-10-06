/**
 * Drizzle SQLite schema: the local cache of a Cursor team's Admin + Analytics API data.
 *
 * Conventions (see the `data-model-and-migrations` skill):
 * - snake_case table and column names.
 * - Timestamps are INTEGER epoch milliseconds (plain `integer`, a JS number).
 * - Money is INTEGER cents, except where the API returns fractional cents
 *   (`requests_costs`, `total_cents`, `charged_cents`, `cursor_token_fee`, and the
 *   `/teams/spend` `spend_cents` / `overall_spend_cents`) which use `real`.
 * - Booleans use `integer({ mode: "boolean" })`; day strings ("2024-03-18") are `text`.
 *
 * This module is intentionally PURE: it imports only `drizzle-orm/sqlite-core` so it can be
 * loaded by tests and the schema-doc generator without pulling in `server-only`. It must not
 * import the DB client, the Cursor API client, the sync engine, or any UI
 * (enforced by `.dependency-cruiser.cjs`).
 */
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Green/red/total line columns shared by the agent-edits and tabs metrics, at both the
 * team and per-user grain. Returned as fresh column builders on each call so every table
 * gets its own independent column instances.
 */
function editLineColumns() {
  return {
    total_green_lines_accepted: integer("total_green_lines_accepted"),
    total_red_lines_accepted: integer("total_red_lines_accepted"),
    total_green_lines_rejected: integer("total_green_lines_rejected"),
    total_red_lines_rejected: integer("total_red_lines_rejected"),
    total_green_lines_suggested: integer("total_green_lines_suggested"),
    total_red_lines_suggested: integer("total_red_lines_suggested"),
    total_lines_suggested: integer("total_lines_suggested"),
    total_lines_accepted: integer("total_lines_accepted"),
  };
}

/** Per-file-extension productivity metrics shared by the team + per-user variants. */
function fileExtMetricColumns() {
  return {
    total_files: integer("total_files"),
    total_accepts: integer("total_accepts"),
    total_rejects: integer("total_rejects"),
    total_lines_suggested: integer("total_lines_suggested"),
    total_lines_accepted: integer("total_lines_accepted"),
    total_lines_rejected: integer("total_lines_rejected"),
  };
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

/** `/teams/members` — roster of team members. */
export const teamMembers = sqliteTable(
  "team_members",
  {
    /** Numeric or `user_…` string from the Admin API. */
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role"),
    is_removed: integer("is_removed", { mode: "boolean" }),
    /** Epoch ms when this row was last synced. */
    updated_at: integer("updated_at"),
  },
  (t) => [index("team_members_email_idx").on(t.email)],
);

/** `/teams/audit-logs` — security/administrative events (Enterprise-only). */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    event_id: text("event_id").primaryKey(),
    timestamp: integer("timestamp"),
    ip_address: text("ip_address"),
    user_email: text("user_email"),
    event_type: text("event_type"),
    /** Originating surface: "cursor", "grok_bot", or "" / null when unknown. */
    application_type: text("application_type"),
    /** Raw event payload as a JSON string. */
    event_data: text("event_data"),
    synced_at: integer("synced_at"),
  },
  (t) => [
    index("audit_logs_timestamp_idx").on(t.timestamp),
    index("audit_logs_event_type_idx").on(t.event_type),
    index("audit_logs_user_email_idx").on(t.user_email),
  ],
);

/** `/teams/daily-usage-data` — per-user-per-day usage rollup. */
export const dailyUsage = sqliteTable(
  "daily_usage",
  {
    /** Numeric or `user_...` string from the Admin API. */
    user_id: text("user_id").notNull(),
    /** Day string, e.g. "2024-03-18". */
    day: text("day").notNull(),
    /** Epoch ms for the day (as returned by the API). */
    date: integer("date"),
    email: text("email"),
    is_active: integer("is_active", { mode: "boolean" }),
    total_lines_added: integer("total_lines_added"),
    total_lines_deleted: integer("total_lines_deleted"),
    accepted_lines_added: integer("accepted_lines_added"),
    accepted_lines_deleted: integer("accepted_lines_deleted"),
    total_applies: integer("total_applies"),
    total_accepts: integer("total_accepts"),
    total_rejects: integer("total_rejects"),
    total_tabs_shown: integer("total_tabs_shown"),
    total_tabs_accepted: integer("total_tabs_accepted"),
    composer_requests: integer("composer_requests"),
    chat_requests: integer("chat_requests"),
    agent_requests: integer("agent_requests"),
    cmdk_usages: integer("cmdk_usages"),
    subscription_included_reqs: integer("subscription_included_reqs"),
    api_key_reqs: integer("api_key_reqs"),
    usage_based_reqs: integer("usage_based_reqs"),
    bugbot_usages: integer("bugbot_usages"),
    most_used_model: text("most_used_model"),
    apply_most_used_extension: text("apply_most_used_extension"),
    tab_most_used_extension: text("tab_most_used_extension"),
    client_version: text("client_version"),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.day] }),
    index("daily_usage_day_idx").on(t.day),
    index("daily_usage_email_idx").on(t.email),
  ],
);

/**
 * `/teams/spend` — per-user spend for the current billing cycle. Doubles as the
 * "user spend limits" read view via `monthly_limit_dollars`, `hard_limit_override_dollars`,
 * and the derived `effective_per_user_limit_dollars`. Spend is fractional cents (`real`).
 */
export const spend = sqliteTable(
  "spend",
  {
    user_id: text("user_id").primaryKey(),
    name: text("name"),
    email: text("email"),
    role: text("role"),
    spend_cents: real("spend_cents"),
    overall_spend_cents: real("overall_spend_cents"),
    fast_premium_requests: integer("fast_premium_requests"),
    hard_limit_override_dollars: integer("hard_limit_override_dollars"),
    monthly_limit_dollars: integer("monthly_limit_dollars"),
    effective_per_user_limit_dollars: integer("effective_per_user_limit_dollars"),
    subscription_cycle_start: integer("subscription_cycle_start"),
    synced_at: integer("synced_at"),
  },
  (t) => [index("spend_email_idx").on(t.email)],
);

/**
 * `/teams/filtered-usage-events` — granular per-request events. `event_key` is a
 * deterministic dedupe key computed by the sync layer (see the file header / report).
 * Fractional-cent money columns use `real`.
 */
export const usageEvents = sqliteTable(
  "usage_events",
  {
    event_key: text("event_key").primaryKey(),
    timestamp: integer("timestamp"),
    user_email: text("user_email"),
    service_account_id: text("service_account_id"),
    service_account_name: text("service_account_name"),
    /** Cloud agent run id (null outside cloud agents). */
    cloud_agent_id: text("cloud_agent_id"),
    /** Automation UUID (null outside automations). */
    automation_id: text("automation_id"),
    /** Agent session id; joins to AI Code Tracking conversations. */
    conversation_id: text("conversation_id"),
    model: text("model"),
    kind: text("kind"),
    max_mode: integer("max_mode", { mode: "boolean" }),
    requests_costs: real("requests_costs"),
    is_token_based_call: integer("is_token_based_call", { mode: "boolean" }),
    is_chargeable: integer("is_chargeable", { mode: "boolean" }),
    is_headless: integer("is_headless", { mode: "boolean" }),
    input_tokens: integer("input_tokens"),
    output_tokens: integer("output_tokens"),
    cache_write_tokens: integer("cache_write_tokens"),
    cache_read_tokens: integer("cache_read_tokens"),
    total_cents: real("total_cents"),
    discount_percent_off: real("discount_percent_off"),
    charged_cents: real("charged_cents"),
    cursor_token_fee: real("cursor_token_fee"),
  },
  (t) => [
    index("usage_events_timestamp_idx").on(t.timestamp),
    index("usage_events_user_email_idx").on(t.user_email),
    index("usage_events_model_idx").on(t.model),
    index("usage_events_conversation_id_idx").on(t.conversation_id),
  ],
);

// ---------------------------------------------------------------------------
// Analytics API — team level
// ---------------------------------------------------------------------------

/** `/analytics/team/dau` — daily active users (incl. CLI / Cloud Agent / BugBot). */
export const analyticsDau = sqliteTable("analytics_dau", {
  date: text("date").primaryKey(),
  dau: integer("dau"),
  cli_dau: integer("cli_dau"),
  cloud_agent_dau: integer("cloud_agent_dau"),
  bugbot_dau: integer("bugbot_dau"),
});

/** `/analytics/team/agent-edits` — AI-suggested diffs and accepted/rejected lines. */
export const analyticsAgentEdits = sqliteTable("analytics_agent_edits", {
  event_date: text("event_date").primaryKey(),
  total_suggested_diffs: integer("total_suggested_diffs"),
  total_accepted_diffs: integer("total_accepted_diffs"),
  total_rejected_diffs: integer("total_rejected_diffs"),
  ...editLineColumns(),
});

/** `/analytics/team/tabs` — Tab autocomplete suggestions, accepts, and lines. */
export const analyticsTabs = sqliteTable("analytics_tabs", {
  event_date: text("event_date").primaryKey(),
  total_suggestions: integer("total_suggestions"),
  total_accepts: integer("total_accepts"),
  total_rejects: integer("total_rejects"),
  ...editLineColumns(),
});

/** `/analytics/team/client-versions` — distribution of client versions per day. */
export const analyticsClientVersions = sqliteTable(
  "analytics_client_versions",
  {
    event_date: text("event_date").notNull(),
    client_version: text("client_version").notNull(),
    user_count: integer("user_count"),
    percentage: real("percentage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.client_version] })],
);

/** `/analytics/team/models` — messages and unique users per model per day. */
export const analyticsModels = sqliteTable(
  "analytics_models",
  {
    date: text("date").notNull(),
    model: text("model").notNull(),
    messages: integer("messages"),
    users: integer("users"),
  },
  (t) => [primaryKey({ columns: [t.date, t.model] })],
);

/** `/analytics/team/top-file-extensions` — most-edited extensions by suggestion volume. */
export const analyticsTopFileExtensions = sqliteTable(
  "analytics_top_file_extensions",
  {
    event_date: text("event_date").notNull(),
    file_extension: text("file_extension").notNull(),
    ...fileExtMetricColumns(),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.file_extension] })],
);

/** `/analytics/team/mcp` — MCP tool usage per day by server + tool. */
export const analyticsMcp = sqliteTable(
  "analytics_mcp",
  {
    event_date: text("event_date").notNull(),
    mcp_server_name: text("mcp_server_name").notNull(),
    tool_name: text("tool_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.mcp_server_name, t.tool_name] })],
);

/** `/analytics/team/commands` — Cursor command usage per day by command name. */
export const analyticsCommands = sqliteTable(
  "analytics_commands",
  {
    event_date: text("event_date").notNull(),
    command_name: text("command_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.command_name] })],
);

/** `/analytics/team/plans` — Plan mode usage per day by model. */
export const analyticsPlans = sqliteTable(
  "analytics_plans",
  {
    event_date: text("event_date").notNull(),
    model: text("model").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.model] })],
);

/** `/analytics/team/skills` — Skills usage per day by skill name. */
export const analyticsSkills = sqliteTable(
  "analytics_skills",
  {
    event_date: text("event_date").notNull(),
    skill_name: text("skill_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.skill_name] })],
);

/** `/analytics/team/ask-mode` — Ask mode usage per day by model. */
export const analyticsAskMode = sqliteTable(
  "analytics_ask_mode",
  {
    event_date: text("event_date").notNull(),
    model: text("model").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.event_date, t.model] })],
);

/**
 * `/analytics/team/conversation-insights` — long/narrow store of every insight slice.
 * `slice` is one of intents|complexity|categories|guidanceLevels|workTypes. `date` is ""
 * for distribution totals, or a day string for time-series rows.
 */
export const analyticsConversationInsights = sqliteTable(
  "analytics_conversation_insights",
  {
    slice: text("slice").notNull(),
    label: text("label").notNull(),
    date: text("date").notNull(),
    count: integer("count"),
  },
  (t) => [primaryKey({ columns: [t.slice, t.label, t.date] })],
);

/**
 * `/analytics/team/leaderboard` — team members ranked per board. `board` is "tab" | "agent";
 * `user_id` is text here (the leaderboard's user identifier).
 */
export const analyticsLeaderboard = sqliteTable(
  "analytics_leaderboard",
  {
    board: text("board").notNull(),
    user_id: text("user_id").notNull(),
    email: text("email"),
    total_accepts: integer("total_accepts"),
    total_lines_accepted: integer("total_lines_accepted"),
    total_lines_suggested: integer("total_lines_suggested"),
    line_acceptance_ratio: real("line_acceptance_ratio"),
    accept_ratio: real("accept_ratio"),
    rank: integer("rank"),
    period_start: text("period_start"),
    period_end: text("period_end"),
  },
  (t) => [primaryKey({ columns: [t.board, t.user_id] })],
);

/** `/analytics/team/bugbot` — per-PR BugBot review analytics. */
export const analyticsBugbot = sqliteTable(
  "analytics_bugbot",
  {
    repo: text("repo").notNull(),
    pr_number: integer("pr_number").notNull(),
    timestamp: integer("timestamp"),
    reviews: integer("reviews"),
    issues_total: integer("issues_total"),
    issues_high: integer("issues_high"),
    issues_medium: integer("issues_medium"),
    issues_low: integer("issues_low"),
    resolved_total: integer("resolved_total"),
    resolved_high: integer("resolved_high"),
    resolved_medium: integer("resolved_medium"),
    resolved_low: integer("resolved_low"),
  },
  (t) => [primaryKey({ columns: [t.repo, t.pr_number] })],
);

/** `/analytics/team/bugbot-reviews` — one row per completed review (posted or dry-run). */
export const analyticsBugbotReviews = sqliteTable(
  "analytics_bugbot_reviews",
  {
    request_id: text("request_id").primaryKey(),
    timestamp: integer("timestamp"),
    repo: text("repo"),
    repo_node_id: text("repo_node_id"),
    pr_number: integer("pr_number"),
    commit_sha: text("commit_sha"),
    bugs_found: integer("bugs_found"),
    /** Billed cost in fractional cents; null when not billed separately. */
    cost_cents: real("cost_cents"),
    dry_run: integer("dry_run", { mode: "boolean" }),
    /** e.g. "posted" | "dry_run". */
    publication_status: text("publication_status"),
  },
  (t) => [
    index("analytics_bugbot_reviews_timestamp_idx").on(t.timestamp),
    index("analytics_bugbot_reviews_repo_idx").on(t.repo),
  ],
);

/** Findings within a BugBot review (`bugs[]`), in response order. */
export const analyticsBugbotReviewFindings = sqliteTable(
  "analytics_bugbot_review_findings",
  {
    request_id: text("request_id").notNull(),
    idx: integer("idx").notNull(),
    /** Posted findings only. */
    comment_id: text("comment_id"),
    /** "resolved" | "unresolved" | null (dry run). */
    resolution_status: text("resolution_status"),
    severity: text("severity"),
    title: text("title"),
    description: text("description"),
    /** JSON array of `{ file, start_line, end_line }` (dry-run findings). */
    locations: text("locations"),
  },
  (t) => [primaryKey({ columns: [t.request_id, t.idx] })],
);

// ---------------------------------------------------------------------------
// Admin API — billing groups + Team directory groups
// ---------------------------------------------------------------------------

/** `/teams/groups` — one row per billing group per billing cycle (`cycle_start` day). */
export const billingGroups = sqliteTable(
  "billing_groups",
  {
    id: text("id").notNull(),
    /** Cycle start day "YYYY-MM-DD" ("" when the API omits the cycle). */
    cycle_start: text("cycle_start").notNull(),
    cycle_end: text("cycle_end"),
    name: text("name").notNull(),
    type: text("type"),
    directory_group_id: text("directory_group_id"),
    member_count: integer("member_count"),
    /** Group spend for the cycle, fractional cents. */
    spend_cents: real("spend_cents"),
    /** True for the reserved `Unassigned` group. */
    is_unassigned: integer("is_unassigned", { mode: "boolean" }),
    created_at: integer("created_at"),
    updated_at: integer("updated_at"),
    synced_at: integer("synced_at"),
  },
  (t) => [primaryKey({ columns: [t.id, t.cycle_start] })],
);

/** Current + former members of a billing group for a cycle, with their cycle spend. */
export const billingGroupMembers = sqliteTable(
  "billing_group_members",
  {
    group_id: text("group_id").notNull(),
    cycle_start: text("cycle_start").notNull(),
    user_id: text("user_id").notNull(),
    name: text("name"),
    email: text("email"),
    joined_at: integer("joined_at"),
    left_at: integer("left_at"),
    spend_cents: real("spend_cents"),
    is_current: integer("is_current", { mode: "boolean" }),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.cycle_start, t.user_id] }),
    index("billing_group_members_email_idx").on(t.email),
  ],
);

/** Daily spend per billing group (`dailySpend[]`). */
export const billingGroupDailySpend = sqliteTable(
  "billing_group_daily_spend",
  {
    group_id: text("group_id").notNull(),
    date: text("date").notNull(),
    spend_cents: real("spend_cents"),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.date] }),
    index("billing_group_daily_spend_date_idx").on(t.date),
  ],
);

/** `/teams/directory-groups` — Team directory groups (`team_group_…` ids). */
export const directoryGroups = sqliteTable("directory_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  member_count: integer("member_count"),
  monthly_spending_limit_dollars: integer("monthly_spending_limit_dollars"),
  created_at: integer("created_at"),
  updated_at: integer("updated_at"),
  synced_at: integer("synced_at"),
});

/** `/teams/directory-groups/:id/members` — group membership. */
export const directoryGroupMembers = sqliteTable(
  "directory_group_members",
  {
    group_id: text("group_id").notNull(),
    user_id: text("user_id").notNull(),
    name: text("name"),
    email: text("email"),
    joined_at: integer("joined_at"),
    synced_at: integer("synced_at"),
  },
  (t) => [
    primaryKey({ columns: [t.group_id, t.user_id] }),
    index("directory_group_members_email_idx").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// AI Code Tracking API (Enterprise alpha)
// ---------------------------------------------------------------------------

/**
 * `/analytics/ai-code/commits` — per-commit AI line attribution. Amended commits can reappear
 * with the same hash and a new ingestion time, so the key includes `created_at`.
 */
export const aiCodeCommits = sqliteTable(
  "ai_code_commits",
  {
    commit_hash: text("commit_hash").notNull(),
    /** Ingestion time on Cursor's side (epoch ms). */
    created_at: integer("created_at").notNull(),
    user_id: text("user_id"),
    user_email: text("user_email"),
    repo_name: text("repo_name"),
    branch_name: text("branch_name"),
    is_primary_branch: integer("is_primary_branch", { mode: "boolean" }),
    /** "ide" | "cli" | "cloud". */
    commit_source: text("commit_source"),
    total_lines_added: integer("total_lines_added"),
    total_lines_deleted: integer("total_lines_deleted"),
    tab_lines_added: integer("tab_lines_added"),
    tab_lines_deleted: integer("tab_lines_deleted"),
    composer_lines_added: integer("composer_lines_added"),
    composer_lines_deleted: integer("composer_lines_deleted"),
    non_ai_lines_added: integer("non_ai_lines_added"),
    non_ai_lines_deleted: integer("non_ai_lines_deleted"),
    message: text("message"),
    /** Commit timestamp (epoch ms) and its UTC day for grouping. */
    commit_ts: integer("commit_ts"),
    commit_day: text("commit_day"),
  },
  (t) => [
    primaryKey({ columns: [t.commit_hash, t.created_at] }),
    index("ai_code_commits_commit_day_idx").on(t.commit_day),
    index("ai_code_commits_user_email_idx").on(t.user_email),
    index("ai_code_commits_repo_name_idx").on(t.repo_name),
  ],
);

/** `/analytics/ai-code/changes` — accepted AI changes grouped by deterministic change id. */
export const aiCodeChanges = sqliteTable(
  "ai_code_changes",
  {
    change_id: text("change_id").primaryKey(),
    user_id: text("user_id"),
    user_email: text("user_email"),
    /** "TAB" | "COMPOSER". */
    source: text("source"),
    model: text("model"),
    total_lines_added: integer("total_lines_added"),
    total_lines_deleted: integer("total_lines_deleted"),
    created_at: integer("created_at"),
    created_day: text("created_day"),
  },
  (t) => [
    index("ai_code_changes_created_day_idx").on(t.created_day),
    index("ai_code_changes_user_email_idx").on(t.user_email),
  ],
);

/** Per-file metadata of an AI change (`metadata[]`); `file_name` may be null in privacy mode. */
export const aiCodeChangeFiles = sqliteTable(
  "ai_code_change_files",
  {
    change_id: text("change_id").notNull(),
    idx: integer("idx").notNull(),
    file_name: text("file_name"),
    file_extension: text("file_extension"),
    lines_added: integer("lines_added"),
    lines_deleted: integer("lines_deleted"),
  },
  (t) => [
    primaryKey({ columns: [t.change_id, t.idx] }),
    index("ai_code_change_files_extension_idx").on(t.file_extension),
  ],
);

// ---------------------------------------------------------------------------
// Analytics API — by user (one table per by-user metric)
// ---------------------------------------------------------------------------

/** `/analytics/by-user/models` — messages per user per model per day. */
export const byUserModels = sqliteTable(
  "by_user_models",
  {
    email: text("email").notNull(),
    date: text("date").notNull(),
    model: text("model").notNull(),
    messages: integer("messages"),
  },
  (t) => [primaryKey({ columns: [t.email, t.date, t.model] })],
);

/** `/analytics/by-user/agent-edits` — same shape as `analytics_agent_edits`, per user. */
export const byUserAgentEdits = sqliteTable(
  "by_user_agent_edits",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    total_suggested_diffs: integer("total_suggested_diffs"),
    total_accepted_diffs: integer("total_accepted_diffs"),
    total_rejected_diffs: integer("total_rejected_diffs"),
    ...editLineColumns(),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date] })],
);

/** `/analytics/by-user/tabs` — same shape as `analytics_tabs`, per user. */
export const byUserTabs = sqliteTable(
  "by_user_tabs",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    total_suggestions: integer("total_suggestions"),
    total_accepts: integer("total_accepts"),
    total_rejects: integer("total_rejects"),
    ...editLineColumns(),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date] })],
);

/** `/analytics/by-user/top-file-extensions` — same shape as the team variant, per user. */
export const byUserTopFileExtensions = sqliteTable(
  "by_user_top_file_extensions",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    file_extension: text("file_extension").notNull(),
    ...fileExtMetricColumns(),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.file_extension] })],
);

/** `/analytics/by-user/client-versions` — client version distribution per user per day. */
export const byUserClientVersions = sqliteTable(
  "by_user_client_versions",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    client_version: text("client_version").notNull(),
    user_count: integer("user_count"),
    percentage: real("percentage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.client_version] })],
);

/** `/analytics/by-user/mcp` — MCP tool usage per user per day. */
export const byUserMcp = sqliteTable(
  "by_user_mcp",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    mcp_server_name: text("mcp_server_name").notNull(),
    tool_name: text("tool_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.mcp_server_name, t.tool_name] })],
);

/** `/analytics/by-user/commands` — command usage per user per day. */
export const byUserCommands = sqliteTable(
  "by_user_commands",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    command_name: text("command_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.command_name] })],
);

/** `/analytics/by-user/plans` — Plan mode usage per user per day. */
export const byUserPlans = sqliteTable(
  "by_user_plans",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    model: text("model").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.model] })],
);

/** `/analytics/by-user/skills` — Skills usage per user per day. */
export const byUserSkills = sqliteTable(
  "by_user_skills",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    skill_name: text("skill_name").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.skill_name] })],
);

/** `/analytics/by-user/ask-mode` — Ask mode usage per user per day. */
export const byUserAskMode = sqliteTable(
  "by_user_ask_mode",
  {
    email: text("email").notNull(),
    event_date: text("event_date").notNull(),
    model: text("model").notNull(),
    usage: integer("usage"),
  },
  (t) => [primaryKey({ columns: [t.email, t.event_date, t.model] })],
);

// ---------------------------------------------------------------------------
// Ops — sync bookkeeping, settings, saved conversations
// ---------------------------------------------------------------------------

/** Per-data-type sync cursor + status (e.g. "daily-usage", "models", "by-user/models"). */
export const syncState = sqliteTable("sync_state", {
  data_type: text("data_type").primaryKey(),
  last_synced_at: integer("last_synced_at").notNull(),
  /** Last ingested date/timestamp watermark, when the data type supports incremental sync. */
  watermark: text("watermark"),
  etag: text("etag"),
  status: text("status").notNull(),
  last_error: text("last_error"),
  last_run_id: integer("last_run_id"),
});

/**
 * Windows a windowed data type has fully ingested (complete UTC days only). Backfills skip
 * covered windows and resume at the first uncovered one; an analytics window's ETag is kept
 * so a forced re-pull of unchanged history returns a free 304. See `sync-and-rate-limits`.
 */
export const syncCoverage = sqliteTable(
  "sync_coverage",
  {
    data_type: text("data_type").notNull(),
    /** First covered day, "YYYY-MM-DD" (UTC, inclusive). */
    window_start: text("window_start").notNull(),
    /** Last covered day, "YYYY-MM-DD" (UTC, inclusive). */
    window_end: text("window_end").notNull(),
    etag: text("etag"),
    rows: integer("rows"),
    synced_at: integer("synced_at").notNull(),
    run_id: integer("run_id"),
  },
  (t) => [
    primaryKey({ columns: [t.data_type, t.window_start, t.window_end] }),
    index("sync_coverage_data_type_idx").on(t.data_type),
  ],
);

/** One row per sync invocation. */
export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  started_at: integer("started_at").notNull(),
  finished_at: integer("finished_at"),
  /** "cron" | "manual" | "cli" | "backfill". */
  trigger: text("trigger").notNull(),
  /** "running" | "ok" | "error" | "partial". */
  status: text("status").notNull(),
  /** 1 when the run used bundled fixtures (no live Admin API calls). */
  mock: integer("mock").notNull().default(0),
  /** JSON summary blob. */
  summary: text("summary"),
});

/** Per-data-type result within a sync run. */
export const syncRunItems = sqliteTable(
  "sync_run_items",
  {
    run_id: integer("run_id").notNull(),
    data_type: text("data_type").notNull(),
    /** "running" | "ok" | "error" | "skipped". */
    status: text("status").notNull(),
    rows: integer("rows").notNull(),
    duration_ms: integer("duration_ms").notNull(),
    error: text("error"),
    /** Completed progress units, usually completed API windows/chunks. */
    progress_current: integer("progress_current"),
    /** Total progress units, usually total API windows/chunks. */
    progress_total: integer("progress_total"),
    /** Human-readable progress detail for the Settings UI. */
    progress_message: text("progress_message"),
  },
  (t) => [primaryKey({ columns: [t.run_id, t.data_type] })],
);

/** Key/value store for encrypted API keys and config (encryption handled elsewhere). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: integer("updated_at").notNull(),
});

/** Saved Ask-Agent conversations (name + prompt + captured response). */
export const savedReports = sqliteTable("saved_reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull().default(""),
  sql: text("sql"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Inferred row types (select + insert) for every table
// ---------------------------------------------------------------------------

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type DailyUsage = typeof dailyUsage.$inferSelect;
export type NewDailyUsage = typeof dailyUsage.$inferInsert;

export type Spend = typeof spend.$inferSelect;
export type NewSpend = typeof spend.$inferInsert;

export type UsageEvent = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;

export type AnalyticsDau = typeof analyticsDau.$inferSelect;
export type NewAnalyticsDau = typeof analyticsDau.$inferInsert;

export type AnalyticsTeamAgentEdits = typeof analyticsAgentEdits.$inferSelect;
export type NewAnalyticsTeamAgentEdits = typeof analyticsAgentEdits.$inferInsert;

export type AnalyticsTabs = typeof analyticsTabs.$inferSelect;
export type NewAnalyticsTabs = typeof analyticsTabs.$inferInsert;

export type AnalyticsClientVersion = typeof analyticsClientVersions.$inferSelect;
export type NewAnalyticsClientVersion = typeof analyticsClientVersions.$inferInsert;

export type AnalyticsModel = typeof analyticsModels.$inferSelect;
export type NewAnalyticsModel = typeof analyticsModels.$inferInsert;

export type AnalyticsTopFileExtension = typeof analyticsTopFileExtensions.$inferSelect;
export type NewAnalyticsTopFileExtension = typeof analyticsTopFileExtensions.$inferInsert;

export type AnalyticsMcp = typeof analyticsMcp.$inferSelect;
export type NewAnalyticsMcp = typeof analyticsMcp.$inferInsert;

export type AnalyticsCommand = typeof analyticsCommands.$inferSelect;
export type NewAnalyticsCommand = typeof analyticsCommands.$inferInsert;

export type AnalyticsPlan = typeof analyticsPlans.$inferSelect;
export type NewAnalyticsPlan = typeof analyticsPlans.$inferInsert;

export type AnalyticsSkill = typeof analyticsSkills.$inferSelect;
export type NewAnalyticsSkill = typeof analyticsSkills.$inferInsert;

export type AnalyticsAskMode = typeof analyticsAskMode.$inferSelect;
export type NewAnalyticsAskMode = typeof analyticsAskMode.$inferInsert;

export type AnalyticsConversationInsight = typeof analyticsConversationInsights.$inferSelect;
export type NewAnalyticsConversationInsight = typeof analyticsConversationInsights.$inferInsert;

export type AnalyticsLeaderboardEntry = typeof analyticsLeaderboard.$inferSelect;
export type NewAnalyticsLeaderboardEntry = typeof analyticsLeaderboard.$inferInsert;

export type AnalyticsBugbot = typeof analyticsBugbot.$inferSelect;
export type NewAnalyticsBugbot = typeof analyticsBugbot.$inferInsert;

export type AnalyticsBugbotReview = typeof analyticsBugbotReviews.$inferSelect;
export type NewAnalyticsBugbotReview = typeof analyticsBugbotReviews.$inferInsert;

export type AnalyticsBugbotReviewFinding = typeof analyticsBugbotReviewFindings.$inferSelect;
export type NewAnalyticsBugbotReviewFinding = typeof analyticsBugbotReviewFindings.$inferInsert;

export type BillingGroup = typeof billingGroups.$inferSelect;
export type NewBillingGroup = typeof billingGroups.$inferInsert;

export type BillingGroupMember = typeof billingGroupMembers.$inferSelect;
export type NewBillingGroupMember = typeof billingGroupMembers.$inferInsert;

export type BillingGroupDailySpend = typeof billingGroupDailySpend.$inferSelect;
export type NewBillingGroupDailySpend = typeof billingGroupDailySpend.$inferInsert;

export type DirectoryGroup = typeof directoryGroups.$inferSelect;
export type NewDirectoryGroup = typeof directoryGroups.$inferInsert;

export type DirectoryGroupMember = typeof directoryGroupMembers.$inferSelect;
export type NewDirectoryGroupMember = typeof directoryGroupMembers.$inferInsert;

export type AiCodeCommit = typeof aiCodeCommits.$inferSelect;
export type NewAiCodeCommit = typeof aiCodeCommits.$inferInsert;

export type AiCodeChange = typeof aiCodeChanges.$inferSelect;
export type NewAiCodeChange = typeof aiCodeChanges.$inferInsert;

export type AiCodeChangeFile = typeof aiCodeChangeFiles.$inferSelect;
export type NewAiCodeChangeFile = typeof aiCodeChangeFiles.$inferInsert;

export type ByUserModel = typeof byUserModels.$inferSelect;
export type NewByUserModel = typeof byUserModels.$inferInsert;

export type ByUserAgentEdits = typeof byUserAgentEdits.$inferSelect;
export type NewByUserAgentEdits = typeof byUserAgentEdits.$inferInsert;

export type ByUserTabs = typeof byUserTabs.$inferSelect;
export type NewByUserTabs = typeof byUserTabs.$inferInsert;

export type ByUserTopFileExtension = typeof byUserTopFileExtensions.$inferSelect;
export type NewByUserTopFileExtension = typeof byUserTopFileExtensions.$inferInsert;

export type ByUserClientVersion = typeof byUserClientVersions.$inferSelect;
export type NewByUserClientVersion = typeof byUserClientVersions.$inferInsert;

export type ByUserMcp = typeof byUserMcp.$inferSelect;
export type NewByUserMcp = typeof byUserMcp.$inferInsert;

export type ByUserCommand = typeof byUserCommands.$inferSelect;
export type NewByUserCommand = typeof byUserCommands.$inferInsert;

export type ByUserPlan = typeof byUserPlans.$inferSelect;
export type NewByUserPlan = typeof byUserPlans.$inferInsert;

export type ByUserSkill = typeof byUserSkills.$inferSelect;
export type NewByUserSkill = typeof byUserSkills.$inferInsert;

export type ByUserAskMode = typeof byUserAskMode.$inferSelect;
export type NewByUserAskMode = typeof byUserAskMode.$inferInsert;

export type SyncState = typeof syncState.$inferSelect;
export type NewSyncState = typeof syncState.$inferInsert;

export type SyncCoverage = typeof syncCoverage.$inferSelect;
export type NewSyncCoverage = typeof syncCoverage.$inferInsert;

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

export type SyncRunItem = typeof syncRunItems.$inferSelect;
export type NewSyncRunItem = typeof syncRunItems.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type SavedReport = typeof savedReports.$inferSelect;
export type NewSavedReport = typeof savedReports.$inferInsert;
