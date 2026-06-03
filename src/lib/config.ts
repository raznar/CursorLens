import "server-only";
import path from "node:path";
import { z } from "zod";
import { ConfigError } from "./errors";

/**
 * Zod-validated environment. Importing this module is the only sanctioned way to read
 * configuration; never touch `process.env` directly elsewhere. See `architecture-overview`.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CURSOR_LENS_SECRET: z.string().min(16).optional(),
  ANALYTICS_AGENT_SECRET: z.string().min(16).optional(),
  CURSOR_ADMIN_API_KEY: z.string().min(1).optional(),
  CURSOR_API_KEY: z.string().min(1).optional(),
  DATA_DIR: z.string().min(1).default("./data"),
  DATABASE_URL: z.string().min(1).optional(),
  CURSOR_MOCK: z.enum(["0", "1"]).default("0"),
  CURSOR_API_BASE_URL: z.string().url().default("https://api.cursor.com"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

const env = loadEnv();

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  /** Encryption secret for API keys at rest (optional; required only to save keys). */
  secret: env.CURSOR_LENS_SECRET ?? env.ANALYTICS_AGENT_SECRET,
  /** Keys optionally provided via env (the Settings UI is the primary path). */
  adminApiKeyFromEnv: env.CURSOR_ADMIN_API_KEY,
  cursorApiKeyFromEnv: env.CURSOR_API_KEY,
  dataDir: env.DATA_DIR,
  dbPath: env.DATABASE_URL ?? path.join(env.DATA_DIR, "analytics.db"),
  cursorApiBaseUrl: env.CURSOR_API_BASE_URL.replace(/\/$/, ""),
  /** Offline/fixture mode — no live API calls. */
  mock: env.CURSOR_MOCK === "1",
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;
