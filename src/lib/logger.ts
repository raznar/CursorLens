import "server-only";
import pino from "pino";
import { config } from "./config";

/**
 * Structured logger. `pino` is in `serverExternalPackages` so it loads at runtime and is
 * never bundled. Use child loggers (`logger.child({ module: "sync" })`) to add context.
 */
export const logger = pino({
  level: config.logLevel,
  base: { app: "cursor-lens" },
  redact: {
    paths: ["apiKey", "*.apiKey", "authorization", "*.authorization", "headers.authorization"],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
