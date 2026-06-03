/**
 * Offline mock: a `fetch` shim that serves deterministic, schema-valid fixtures for every
 * Admin + Analytics endpoint. Used when `config.mock` is on (CURSOR_MOCK=1) or no admin key
 * is configured, so CI, the dashboards, and a full backfill all work without a live key.
 *
 * The data is generated per request from the requested window, so a 30-day backfill yields
 * ~30 days across 5 users (plus a headless service account). Models are varied and include
 * Claude Opus usage for two users, so "which users used Opus in the last 90 days" is
 * answerable from `usage_events` / `by_user_models`.
 *
 * Pure module: produces plain JSON `Response`s; no `db` / sync / UI imports.
 */
import type { FetchLike } from "./client";

const DAY_MS = 24 * 60 * 60 * 1000;

interface MockUser {
  id: number;
  publicId: string;
  email: string;
  name: string;
  role: string;
  models: string[];
}

/** Five team members; Alice and Carol use Claude Opus. */
export const MOCK_USERS: MockUser[] = [
  {
    id: 1001,
    publicId: "user_alice0001",
    email: "alice@acme.test",
    name: "Alice Anderson",
    role: "owner",
    models: ["claude-opus-4.5", "claude-sonnet-4.5", "gpt-5"],
  },
  {
    id: 1002,
    publicId: "user_bob00002",
    email: "bob@acme.test",
    name: "Bob Brown",
    role: "member",
    models: ["claude-sonnet-4.5", "gpt-4o"],
  },
  {
    id: 1003,
    publicId: "user_carol0003",
    email: "carol@acme.test",
    name: "Carol Carter",
    role: "member",
    models: ["claude-opus-4.5", "gemini-2.5-pro"],
  },
  {
    id: 1004,
    publicId: "user_dave0004",
    email: "dave@acme.test",
    name: "Dave Davis",
    role: "member",
    models: ["gpt-5", "default"],
  },
  {
    id: 1005,
    publicId: "user_erin0005",
    email: "erin@acme.test",
    name: "Erin Evans",
    role: "member",
    models: ["claude-sonnet-4.5"],
  },
];

const SERVICE_ACCOUNT = { id: "sa_nightly_ci", name: "Nightly CI Agent", email: "ci@acme.test" };

const ALL_MODELS = ["claude-opus-4.5", "claude-sonnet-4.5", "gpt-5", "gpt-4o", "gemini-2.5-pro"];
const CLIENT_VERSIONS = ["0.45.2", "0.45.1", "0.44.9"];
const FILE_EXTS = ["tsx", "ts", "py", "go", "md"];
const MCP_TOOLS: Array<[string, string]> = [
  ["read_file", "filesystem"],
  ["search_web", "brave-search"],
  ["query", "postgres"],
];
const COMMANDS = ["explain", "refactor", "doc", "fix"];
const SKILLS = ["react-best-practices", "usage-billing", "create-rule", "commit-helper"];

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness (FNV-1a hash -> [0,1))
// ---------------------------------------------------------------------------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function rand01(key: string): number {
  return (fnv1a(key) % 100_000) / 100_000;
}
function randInt(key: string, min: number, max: number): number {
  return min + Math.floor(rand01(key) * (max - min + 1));
}
function pick<T>(arr: T[], key: string): T {
  return arr[Math.floor(rand01(key) * arr.length)]!;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Day {
  day: string;
  ms: number;
}
function dayList(startMs: number, endMs: number): Day[] {
  const days: Day[] = [];
  const start = Math.floor(startMs / DAY_MS) * DAY_MS;
  const end = Math.floor(endMs / DAY_MS) * DAY_MS;
  for (let ms = start, n = 0; ms <= end && n < 400; ms += DAY_MS, n++) {
    days.push({ day: new Date(ms).toISOString().slice(0, 10), ms });
  }
  return days;
}

const USER_MAPPINGS = MOCK_USERS.map((u) => ({ id: u.publicId, email: u.email }));

interface UserPage {
  users: MockUser[];
  pagination: {
    page: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
function paginateUsers(page: number, pageSize: number): UserPage {
  const totalUsers = MOCK_USERS.length;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const users = MOCK_USERS.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  return {
    users,
    pagination: {
      page,
      pageSize,
      totalUsers,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-endpoint fixture generators
// ---------------------------------------------------------------------------

function genMembers() {
  return {
    teamMembers: MOCK_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isRemoved: false,
    })),
  };
}

function genSpend(page: number, pageSize: number) {
  const { users, pagination } = paginateUsers(page, pageSize);
  return {
    teamMemberSpend: users.map((u) => {
      const spendCents = randInt(`spend:${u.email}`, 0, 25_000);
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        spendCents,
        overallSpendCents: spendCents + randInt(`ospend:${u.email}`, 0, 40_000),
        fastPremiumRequests: randInt(`fpr:${u.email}`, 0, 2000),
        hardLimitOverrideDollars: u.role === "owner" ? 0 : pick([0, 100, 200], `hl:${u.email}`),
        monthlyLimitDollars: pick([null, 100, 200, 500], `ml:${u.email}`),
      };
    }),
    subscriptionCycleStart: Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    totalMembers: MOCK_USERS.length,
    totalPages: pagination.totalPages,
  };
}

function genDailyUsage(startMs: number, endMs: number, page: number, pageSize: number) {
  const { users, pagination } = paginateUsers(page, pageSize);
  const days = dayList(startMs, endMs);
  const data = users.flatMap((u) =>
    days.map((d) => {
      const seed = `du:${u.email}:${d.day}`;
      const active = rand01(seed + ":act") > 0.1;
      return {
        userId: u.id,
        day: d.day,
        date: d.ms,
        email: u.email,
        isActive: active,
        totalLinesAdded: active ? randInt(seed + ":la", 50, 2000) : 0,
        totalLinesDeleted: active ? randInt(seed + ":ld", 10, 800) : 0,
        acceptedLinesAdded: active ? randInt(seed + ":ala", 20, 1200) : 0,
        acceptedLinesDeleted: active ? randInt(seed + ":ald", 5, 500) : 0,
        totalApplies: active ? randInt(seed + ":ap", 5, 120) : 0,
        totalAccepts: active ? randInt(seed + ":ac", 5, 100) : 0,
        totalRejects: active ? randInt(seed + ":rj", 0, 30) : 0,
        totalTabsShown: active ? randInt(seed + ":ts", 50, 600) : 0,
        totalTabsAccepted: active ? randInt(seed + ":ta", 20, 400) : 0,
        composerRequests: active ? randInt(seed + ":cr", 0, 60) : 0,
        chatRequests: active ? randInt(seed + ":ch", 0, 150) : 0,
        agentRequests: active ? randInt(seed + ":ag", 0, 40) : 0,
        cmdkUsages: active ? randInt(seed + ":ck", 0, 80) : 0,
        subscriptionIncludedReqs: active ? randInt(seed + ":si", 0, 200) : 0,
        apiKeyReqs: 0,
        usageBasedReqs: active ? randInt(seed + ":ub", 0, 20) : 0,
        bugbotUsages: active ? randInt(seed + ":bb", 0, 5) : 0,
        mostUsedModel: active ? pick(u.models, seed + ":mm") : null,
        applyMostUsedExtension: active ? "." + pick(FILE_EXTS, seed + ":ae") : null,
        tabMostUsedExtension: active ? "." + pick(FILE_EXTS, seed + ":te") : null,
        clientVersion: active ? pick(CLIENT_VERSIONS, seed + ":cv") : null,
      };
    }),
  );
  return { data, period: { startDate: startMs, endDate: endMs }, pagination };
}

interface MockEvent {
  timestamp: string;
  userEmail: string;
  serviceAccountId?: string;
  serviceAccountName?: string;
  model: string;
  kind: string;
  maxMode: boolean;
  requestsCosts: number;
  isTokenBasedCall: boolean;
  isChargeable: boolean;
  isHeadless: boolean;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    totalCents: number;
  };
  chargedCents: number;
  cursorTokenFee: number;
}

function buildAllEvents(startMs: number, endMs: number): MockEvent[] {
  const events: MockEvent[] = [];
  for (const d of dayList(startMs, endMs)) {
    for (const u of MOCK_USERS) {
      const count = randInt(`uec:${u.email}:${d.day}`, 1, 4);
      for (let i = 0; i < count; i++) {
        const seed = `ue:${u.email}:${d.day}:${i}`;
        const model = pick(u.models, seed + ":model");
        const input = randInt(seed + ":in", 100, 8000);
        const output = randInt(seed + ":out", 50, 2000);
        const totalCents = round2(
          input * 0.0003 +
            output * 0.0015 +
            (model.includes("opus") ? 6 : 1.5) * rand01(seed + ":m"),
        );
        const chargeable = i % 3 === 0;
        events.push({
          timestamp: String(d.ms + randInt(seed + ":h", 8, 19) * 3_600_000 + i * 61_000),
          userEmail: u.email,
          model,
          kind: chargeable ? "Usage-based" : "Included in Business",
          maxMode: rand01(seed + ":mm") > 0.5,
          requestsCosts: randInt(seed + ":rc", 1, 10),
          isTokenBasedCall: true,
          isChargeable: chargeable,
          isHeadless: false,
          tokenUsage: {
            inputTokens: input,
            outputTokens: output,
            cacheWriteTokens: randInt(seed + ":cw", 0, 12_000),
            cacheReadTokens: randInt(seed + ":cr", 0, 15_000),
            totalCents,
          },
          chargedCents: round2(totalCents + 1.18),
          cursorTokenFee: 1.18,
        });
      }
    }
    // One headless service-account event per day.
    events.push({
      timestamp: String(d.ms + 2 * 3_600_000),
      userEmail: SERVICE_ACCOUNT.email,
      serviceAccountId: SERVICE_ACCOUNT.id,
      serviceAccountName: SERVICE_ACCOUNT.name,
      model: "claude-sonnet-4.5",
      kind: "Usage-based",
      maxMode: true,
      requestsCosts: 5,
      isTokenBasedCall: true,
      isChargeable: true,
      isHeadless: true,
      tokenUsage: {
        inputTokens: 126,
        outputTokens: 450,
        cacheWriteTokens: 6112,
        cacheReadTokens: 11_964,
        totalCents: 20.18,
      },
      chargedCents: 21.36,
      cursorTokenFee: 1.18,
    });
  }
  events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  return events;
}

function genUsageEvents(body: Record<string, unknown>) {
  const startMs = Number(body.startDate ?? Date.now() - 7 * DAY_MS);
  const endMs = Number(body.endDate ?? Date.now());
  const page = Number(body.page ?? 1);
  const pageSize = Number(body.pageSize ?? 100);
  let events = buildAllEvents(startMs, endMs);
  if (typeof body.email === "string") events = events.filter((e) => e.userEmail === body.email);
  const totalCount = events.length;
  const numPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const slice = events.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  return {
    totalUsageEventsCount: totalCount,
    pagination: {
      numPages,
      currentPage: page,
      pageSize,
      hasNextPage: page < numPages,
      hasPreviousPage: page > 1,
    },
    usageEvents: slice,
    period: { startDate: startMs, endDate: endMs },
  };
}

function genAuditLogs(params: URLSearchParams) {
  const startMs = Number(params.get("startTime") ?? Date.now() - 7 * DAY_MS);
  const endMs = Number(params.get("endTime") ?? Date.now());
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 100);
  const types = ["login", "logout", "add_user", "user_spend_limit", "team_settings"];
  const all = dayList(startMs, endMs).flatMap((d) => {
    const n = randInt(`al:${d.day}`, 1, 3);
    return Array.from({ length: n }, (_, i) => {
      const user = pick(MOCK_USERS, `alu:${d.day}:${i}`);
      const type = pick(types, `alt:${d.day}:${i}`);
      return {
        event_id: `evt_${d.day}_${i}`,
        timestamp: new Date(d.ms + i * 3_600_000).toISOString(),
        ip_address: `203.0.113.${randInt(`ip:${d.day}:${i}`, 1, 254)}`,
        user_email: user.email,
        event_type: type,
        event_data: { method: "manual", target: user.email },
      };
    });
  });
  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const events = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
  return {
    events,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    params: { teamId: 12345, startDate: startMs, endDate: endMs },
  };
}

function analyticsParams(metric: string) {
  return { metric, teamId: 12345 };
}

function genDau(days: Day[]) {
  return {
    data: days.map((d) => ({
      date: d.day,
      dau: randInt(`dau:${d.day}`, 3, MOCK_USERS.length),
      cli_dau: randInt(`cli:${d.day}`, 0, 3),
      cloud_agent_dau: randInt(`cloud:${d.day}`, 0, MOCK_USERS.length),
      bugbot_dau: randInt(`bbdau:${d.day}`, 0, 3),
    })),
    params: analyticsParams("dau"),
  };
}

function lineColumns(seed: string) {
  return {
    total_green_lines_accepted: randInt(seed + ":gla", 100, 1500),
    total_red_lines_accepted: randInt(seed + ":rla", 20, 400),
    total_green_lines_rejected: randInt(seed + ":glr", 20, 300),
    total_red_lines_rejected: randInt(seed + ":rlr", 5, 120),
    total_green_lines_suggested: randInt(seed + ":gls", 200, 2000),
    total_red_lines_suggested: randInt(seed + ":rls", 40, 500),
    total_lines_suggested: randInt(seed + ":lts", 300, 2500),
    total_lines_accepted: randInt(seed + ":lta", 150, 1800),
  };
}

function genAgentEdits(days: Day[], scope: string) {
  return {
    data: days.map((d) => {
      const seed = `ae:${scope}:${d.day}`;
      return {
        event_date: d.day,
        total_suggested_diffs: randInt(seed + ":sd", 30, 200),
        total_accepted_diffs: randInt(seed + ":ad", 20, 150),
        total_rejected_diffs: randInt(seed + ":rd", 5, 60),
        ...lineColumns(seed),
      };
    }),
    params: analyticsParams("agent-edits"),
  };
}

function genTabs(days: Day[], scope: string) {
  return {
    data: days.map((d) => {
      const seed = `tb:${scope}:${d.day}`;
      return {
        event_date: d.day,
        total_suggestions: randInt(seed + ":sg", 1000, 6000),
        total_accepts: randInt(seed + ":ac", 400, 3500),
        total_rejects: randInt(seed + ":rj", 200, 2000),
        ...lineColumns(seed),
      };
    }),
    params: analyticsParams("tabs"),
  };
}

function genClientVersions(days: Day[]) {
  return {
    data: days.flatMap((d) =>
      CLIENT_VERSIONS.slice(0, 2).map((v, i) => ({
        event_date: d.day,
        client_version: v,
        user_count: i === 0 ? 3 : 2,
        percentage: i === 0 ? 0.6 : 0.4,
      })),
    ),
    params: analyticsParams("client-versions"),
  };
}

function genModelsTeam(days: Day[]) {
  return {
    data: days.map((d) => {
      const breakdown: Record<string, { messages: number; users: number }> = {};
      for (const m of ALL_MODELS) {
        const messages = randInt(`mdl:${m}:${d.day}`, 0, 400);
        if (messages > 0) breakdown[m] = { messages, users: randInt(`mdu:${m}:${d.day}`, 1, 5) };
      }
      if (!breakdown["claude-opus-4.5"]) {
        breakdown["claude-opus-4.5"] = {
          messages: randInt(`opus:${d.day}`, 20, 140),
          users: randInt(`opusu:${d.day}`, 1, 3),
        };
      }
      return { date: d.day, model_breakdown: breakdown };
    }),
    params: analyticsParams("models"),
  };
}

function genTopFileExtensions(days: Day[], scope: string) {
  return {
    data: days.flatMap((d) =>
      FILE_EXTS.slice(0, 3).map((ext) => {
        const seed = `tfe:${scope}:${ext}:${d.day}`;
        return {
          event_date: d.day,
          file_extension: ext,
          total_files: randInt(seed + ":f", 10, 160),
          total_accepts: randInt(seed + ":a", 5, 100),
          total_rejects: randInt(seed + ":r", 1, 40),
          total_lines_suggested: randInt(seed + ":ls", 200, 3000),
          total_lines_accepted: randInt(seed + ":la", 100, 2200),
          total_lines_rejected: randInt(seed + ":lr", 20, 800),
        };
      }),
    ),
    params: analyticsParams("top-files"),
  };
}

function genMcp(days: Day[]) {
  return {
    data: days.flatMap((d) =>
      MCP_TOOLS.map(([tool, server]) => ({
        event_date: d.day,
        tool_name: tool,
        mcp_server_name: server,
        usage: randInt(`mcp:${tool}:${d.day}`, 5, 250),
      })),
    ),
    params: analyticsParams("mcp"),
  };
}

function genCommands(days: Day[]) {
  return {
    data: days.flatMap((d) =>
      COMMANDS.map((cmd) => ({
        event_date: d.day,
        command_name: cmd,
        usage: randInt(`cmd:${cmd}:${d.day}`, 0, 100),
      })),
    ),
    params: analyticsParams("commands"),
  };
}

function genModelUsage(days: Day[], metric: string, models: string[]) {
  return {
    data: days.flatMap((d) =>
      models.map((m) => ({
        event_date: d.day,
        model: m,
        usage: randInt(`${metric}:${m}:${d.day}`, 0, 160),
      })),
    ),
    params: analyticsParams(metric),
  };
}

function genSkills(days: Day[]) {
  return {
    data: days.flatMap((d) =>
      SKILLS.map((s) => ({
        event_date: d.day,
        skill_name: s,
        usage: randInt(`skill:${s}:${d.day}`, 0, 60),
      })),
    ),
    params: analyticsParams("skills"),
  };
}

function genConversationInsights(days: Day[]) {
  const slice = (labelKey: string, values: string[], name: string) => {
    const distribution = values.map((v) => ({
      [labelKey]: v,
      count: randInt(`ci:${name}:${v}`, 1, 30),
    }));
    const timeSeries = days.flatMap((d) =>
      values.slice(0, 2).map((v) => ({
        date: d.day,
        [labelKey]: v,
        count: randInt(`cit:${name}:${v}:${d.day}`, 0, 8),
      })),
    );
    return { distribution, timeSeries };
  };
  return {
    data: {
      intents: slice("intent", ["Write Code", "Ask", "Plan"], "intents"),
      complexity: slice("complexity", ["high", "medium", "low"], "complexity"),
      categories: slice(
        "category",
        ["New Features", "Bug Fixing & Debugging", "Refactoring"],
        "categories",
      ),
      guidanceLevels: slice("guidanceLevel", ["high", "medium", "low"], "guidance"),
      workTypes: slice("workType", ["new_feature", "bug", "refactor"], "workTypes"),
    },
    params: {
      ...analyticsParams("conversation-insights"),
      include: ["intents", "complexity", "categories", "guidanceLevels", "workTypes"],
    },
  };
}

function genLeaderboard(page: number, pageSize: number) {
  const { users, pagination } = paginateUsers(page, pageSize);
  const board = (suffix: string) =>
    users.map((u, idx) => {
      const accepts = randInt(`lb:${suffix}:${u.email}`, 200, 1500);
      const accepted = randInt(`lba:${suffix}:${u.email}`, 1000, 60_000);
      const suggested = randInt(`lbs:${suffix}:${u.email}`, 5000, 200_000);
      return {
        email: u.email,
        user_id: u.publicId,
        total_accepts: accepts,
        total_lines_accepted: accepted,
        total_lines_suggested: suggested,
        line_acceptance_ratio: round2(accepted / suggested),
        accept_ratio: suffix === "tab" ? round2(accepts / (accepts + 500)) : undefined,
        rank: (page - 1) * pageSize + idx + 1,
      };
    });
  return {
    data: {
      tab_leaderboard: { data: board("tab"), total_users: MOCK_USERS.length },
      agent_leaderboard: { data: board("agent"), total_users: MOCK_USERS.length },
    },
    pagination,
    params: analyticsParams("leaderboard"),
  };
}

function genBugbot(days: Day[], page: number, pageSize: number) {
  const repos = ["github.com/acme/app", "github.com/acme/api"];
  const all = days.flatMap((d, di) =>
    repos.map((repo, ri) => {
      const seed = `bb:${repo}:${d.day}`;
      const high = randInt(seed + ":h", 0, 3);
      const medium = randInt(seed + ":m", 0, 5);
      const low = randInt(seed + ":l", 0, 6);
      return {
        repo,
        pr_number: 100 + di * 2 + ri,
        timestamp: new Date(d.ms).toISOString(),
        reviews: randInt(seed + ":rv", 1, 4),
        issues: { total: high + medium + low, by_severity: { high, medium, low } },
        issues_resolved: {
          total: Math.floor((high + medium + low) / 2),
          by_severity: { high: Math.min(high, 1), medium: Math.floor(medium / 2), low: 0 },
        },
      };
    }),
  );
  const totalItems = all.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    data: all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    params: analyticsParams("bugbot"),
  };
}

// ---------------------------------------------------------------------------
// By-user generators (data keyed by email)
// ---------------------------------------------------------------------------

function byUserResponse(
  metric: string,
  page: number,
  pageSize: number,
  rowsFor: (user: MockUser) => unknown[],
) {
  const { users, pagination } = paginateUsers(page, pageSize);
  const data: Record<string, unknown[]> = {};
  for (const u of users) data[u.email] = rowsFor(u);
  return { data, pagination, params: { ...analyticsParams(metric), userMappings: USER_MAPPINGS } };
}

function genByUserModels(days: Day[], page: number, pageSize: number) {
  return byUserResponse("models", page, pageSize, (u) =>
    days.map((d) => {
      const breakdown: Record<string, { messages: number; users: number }> = {};
      for (const m of u.models) {
        const messages = randInt(`bum:${u.email}:${m}:${d.day}`, 0, 120);
        if (messages > 0) breakdown[m] = { messages, users: 1 };
      }
      if (Object.keys(breakdown).length === 0) breakdown[u.models[0]!] = { messages: 5, users: 1 };
      return { date: d.day, model_breakdown: breakdown };
    }),
  );
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function parseDay(value: string | null, fallbackMs: number): number {
  if (!value) return fallbackMs;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(/T/.test(value) ? value : `${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function analyticsDays(params: URLSearchParams): Day[] {
  const end = parseDay(params.get("endDate"), Date.now());
  const start = parseDay(params.get("startDate"), end - 7 * DAY_MS);
  return dayList(start, end);
}

function routeGet(path: string, params: URLSearchParams): unknown | undefined {
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 100);

  if (path === "/teams/members") return genMembers();
  if (path === "/teams/audit-logs") return genAuditLogs(params);

  if (path.startsWith("/analytics/team/")) {
    const days = analyticsDays(params);
    switch (path) {
      case "/analytics/team/dau":
        return genDau(days);
      case "/analytics/team/agent-edits":
        return genAgentEdits(days, "team");
      case "/analytics/team/tabs":
        return genTabs(days, "team");
      case "/analytics/team/client-versions":
        return genClientVersions(days);
      case "/analytics/team/models":
        return genModelsTeam(days);
      case "/analytics/team/top-file-extensions":
        return genTopFileExtensions(days, "team");
      case "/analytics/team/mcp":
        return genMcp(days);
      case "/analytics/team/commands":
        return genCommands(days);
      case "/analytics/team/plans":
        return genModelUsage(days, "plans", ["claude-sonnet-4.5", "claude-opus-4.5", "default"]);
      case "/analytics/team/ask-mode":
        return genModelUsage(days, "ask-mode", ["claude-sonnet-4.5", "gpt-4o"]);
      case "/analytics/team/skills":
        return genSkills(days);
      case "/analytics/team/conversation-insights":
        return genConversationInsights(days);
      case "/analytics/team/leaderboard":
        return genLeaderboard(page, pageSize);
      case "/analytics/team/bugbot":
        return genBugbot(days, page, pageSize);
    }
  }

  if (path.startsWith("/analytics/by-user/")) {
    const days = analyticsDays(params);
    const metric = path.slice("/analytics/by-user/".length);
    switch (metric) {
      case "models":
        return genByUserModels(days, page, pageSize);
      case "agent-edits":
        return byUserResponse(
          "agent-edits",
          page,
          pageSize,
          (u) => genAgentEdits(days, u.email).data,
        );
      case "tabs":
        return byUserResponse("tabs", page, pageSize, (u) => genTabs(days, u.email).data);
      case "top-file-extensions":
        return byUserResponse("top-files", page, pageSize, (u) =>
          FILE_EXTS.slice(0, 3).map((ext) => {
            const seed = `butfe:${u.email}:${ext}`;
            return {
              file_extension: ext,
              total_files: randInt(seed + ":f", 10, 160),
              total_accepts: randInt(seed + ":a", 5, 100),
              total_rejects: randInt(seed + ":r", 1, 40),
              total_lines_suggested: randInt(seed + ":ls", 200, 3000),
              total_lines_accepted: randInt(seed + ":la", 100, 2200),
              total_lines_rejected: randInt(seed + ":lr", 20, 800),
            };
          }),
        );
      case "client-versions":
        return byUserResponse("client-versions", page, pageSize, (u) =>
          days.map((d) => ({
            event_date: d.day,
            client_version: pick(CLIENT_VERSIONS, `bucv:${u.email}:${d.day}`),
            user_count: 1,
            percentage: 1,
          })),
        );
      case "mcp":
        return byUserResponse("mcp", page, pageSize, (u) =>
          days.map((d) => {
            const [tool, server] = pick(MCP_TOOLS, `bumcp:${u.email}:${d.day}`);
            return {
              event_date: d.day,
              tool_name: tool,
              mcp_server_name: server,
              usage: randInt(`bumcpu:${u.email}:${d.day}`, 0, 60),
            };
          }),
        );
      case "commands":
        return byUserResponse("commands", page, pageSize, (u) =>
          days.map((d) => ({
            event_date: d.day,
            command_name: pick(COMMANDS, `bucmd:${u.email}:${d.day}`),
            usage: randInt(`bucmdu:${u.email}:${d.day}`, 0, 30),
          })),
        );
      case "plans":
        return byUserResponse("plans", page, pageSize, (u) =>
          days.map((d) => ({
            event_date: d.day,
            model: u.models[0]!,
            usage: randInt(`bupl:${u.email}:${d.day}`, 0, 25),
          })),
        );
      case "skills":
        return byUserResponse("skills", page, pageSize, (u) =>
          days.map((d) => ({
            event_date: d.day,
            skill_name: pick(SKILLS, `busk:${u.email}:${d.day}`),
            usage: randInt(`busku:${u.email}:${d.day}`, 0, 15),
          })),
        );
      case "ask-mode":
        return byUserResponse("ask-mode", page, pageSize, (u) =>
          days.map((d) => ({
            event_date: d.day,
            model: u.models[0]!,
            usage: randInt(`buam:${u.email}:${d.day}`, 0, 30),
          })),
        );
    }
  }

  return undefined;
}

function routePost(path: string, body: Record<string, unknown>): unknown | undefined {
  const page = Number(body.page ?? 1);
  const pageSize = Number(body.pageSize ?? 100);
  switch (path) {
    case "/teams/spend":
      return genSpend(page, pageSize);
    case "/teams/daily-usage-data":
      return genDailyUsage(
        Number(body.startDate ?? Date.now() - 7 * DAY_MS),
        Number(body.endDate ?? Date.now()),
        page,
        pageSize,
      );
    case "/teams/filtered-usage-events":
      return genUsageEvents(body);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Fetch shim
// ---------------------------------------------------------------------------

function readHeader(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === lower);
    return found?.[1];
  }
  const record = headers as Record<string, string>;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) return record[key];
  }
  return undefined;
}

function computeEtag(path: string, search: string): string {
  return `W/"${fnv1a(path + search).toString(16)}"`;
}

function jsonResponse(body: unknown, opts: { etag?: string } = {}): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.etag) headers.ETag = opts.etag;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

function notFound(path: string): Response {
  return new Response(JSON.stringify({ error: `mock: no handler for ${path}` }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a `fetch`-compatible function that serves the bundled fixtures. */
export function createMockFetch(): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "GET") {
      const body = routeGet(path, url.searchParams);
      if (body === undefined) return notFound(path);
      if (path.startsWith("/analytics/")) {
        const etag = computeEtag(path, url.search);
        if (readHeader(init, "if-none-match") === etag) {
          return new Response(null, { status: 304, headers: { ETag: etag } });
        }
        return jsonResponse(body, { etag });
      }
      return jsonResponse(body);
    }

    if (method === "POST") {
      const parsed = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const body = routePost(path, parsed);
      return body === undefined ? notFound(path) : jsonResponse(body);
    }

    return notFound(path);
  };
}
