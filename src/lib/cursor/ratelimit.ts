/**
 * Per-team-per-minute rate limiters, one `bottleneck` instance per {@link RateLimitGroup}.
 *
 * Each limiter uses a reservoir of `RATE_LIMITS[group]` tokens that refreshes every 60s,
 * plus `minTime` spacing so a burst can't fire the whole reservoir in one tick. The
 * reservoir is the primary guard (it caps requests/minute); `minTime` just smooths bursts.
 *
 * Pure module: imports only `bottleneck` and the registry (shared lib). It must never
 * touch `db`, the sync engine, or UI.
 */
import Bottleneck from "bottleneck";
import { RATE_LIMITS, type RateLimitGroup } from "@/lib/registry";

export type Limiters = Record<RateLimitGroup, Bottleneck>;

export interface LimiterOptions {
  /** Reservoir refresh window in ms (default 60_000). Lowered in tests. */
  refreshIntervalMs?: number;
  /** Max concurrent in-flight requests per group (default 4). */
  maxConcurrent?: number;
  /**
   * Override the per-minute limits (defaults to the registry's `RATE_LIMITS`). Useful for
   * tests that want a tiny reservoir to observe throttling without waiting a full minute.
   */
  limits?: Partial<Record<RateLimitGroup, number>>;
  /** Override `minTime` spacing in ms (defaults to ceil(refresh / limit)). */
  minTimeMs?: number;
}

/** Create one Bottleneck per rate-limit group. */
export function createLimiters(options: LimiterOptions = {}): Limiters {
  const refresh = options.refreshIntervalMs ?? 60_000;
  const maxConcurrent = options.maxConcurrent ?? 4;
  const groups = Object.keys(RATE_LIMITS) as RateLimitGroup[];

  const entries = groups.map((group) => {
    const limit = options.limits?.[group] ?? RATE_LIMITS[group];
    const minTime = options.minTimeMs ?? Math.max(1, Math.ceil(refresh / limit));
    const limiter = new Bottleneck({
      reservoir: limit,
      reservoirRefreshAmount: limit,
      reservoirRefreshInterval: refresh,
      maxConcurrent,
      minTime,
    });
    return [group, limiter] as const;
  });

  return Object.fromEntries(entries) as Limiters;
}

/** Schedule a task on the limiter for `group`, awaiting a reservoir token + spacing. */
export function schedule<T>(
  limiters: Limiters,
  group: RateLimitGroup,
  task: () => Promise<T>,
): Promise<T> {
  return limiters[group].schedule(task);
}

/** Release timers held by the limiters (call on shutdown to let the process exit cleanly). */
export async function disposeLimiters(limiters: Limiters): Promise<void> {
  await Promise.all(
    Object.values(limiters).map((l) => l.stop({ dropWaitingJobs: false }).catch(() => {})),
  );
}
