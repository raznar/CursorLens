/**
 * Next.js instrumentation hook. On the Node.js server runtime (never during build, never on
 * edge), schedule an hourly incremental sync via `node-cron` — but only when ingestion can
 * actually run (an admin key is configured, or mock mode is on). Guards against double
 * registration (Next can call `register` more than once) and never throws at boot.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const globalForCron = globalThis as typeof globalThis & { __analyticsCronStarted?: boolean };
  if (globalForCron.__analyticsCronStarted) return;
  globalForCron.__analyticsCronStarted = true;

  try {
    const { config } = await import("@/lib/config");
    const { logger } = await import("@/lib/logger");
    const log = logger.child({ module: "cron" });

    const { getAdminApiKey } = await import("@/lib/keys");
    const adminKey = getAdminApiKey();
    const ingestionAvailable = Boolean(adminKey) || (!adminKey && config.mock);
    if (!ingestionAvailable) {
      log.info("no admin key configured and mock disabled; hourly sync not scheduled");
      return;
    }

    if (adminKey && !config.mock) {
      const { ensureLiveCacheBaseline } = await import("@/lib/sync/cache-policy");
      ensureLiveCacheBaseline();
    }

    const { schedule } = await import("node-cron");
    const { runSync, getSyncConfig } = await import("@/lib/sync");

    let intervalHours = 1;
    try {
      intervalHours = getSyncConfig().intervalHours;
    } catch {
      intervalHours = 1;
    }
    const expression = intervalHours <= 1 ? "0 * * * *" : `0 */${intervalHours} * * *`;

    schedule(expression, () => {
      void runSync({ mode: "incremental", trigger: "cron" }).catch((err: unknown) => {
        log.error({ err: String(err) }, "scheduled incremental sync failed");
      });
    });

    log.info({ expression }, "hourly incremental sync scheduled");
  } catch (err) {
    // Boot must never fail because scheduling did.
    console.error("[instrumentation] failed to schedule sync:", err);
  }
}
