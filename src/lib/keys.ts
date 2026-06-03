import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { config } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";

/**
 * Resolves the two API keys the app needs:
 *  - admin/analytics key (Basic auth) for data ingestion
 *  - Cursor SDK key (CURSOR_API_KEY) for the Ask Agent
 *
 * Env vars win over stored values (useful for headless/CI). Stored values are encrypted
 * (see crypto.ts). The Cursor API client never reads keys directly — the sync engine and
 * agent resolve a key here and pass it in, keeping `src/lib/cursor` pure.
 */
export const SETTING_ADMIN_KEY = "cursor_admin_api_key";
export const SETTING_SDK_KEY = "cursor_api_key";

export type KeySource = "env" | "stored" | "none";
export interface KeyStatus {
  configured: boolean;
  source: KeySource;
}

function getRaw(key: string): string | undefined {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? undefined;
}

function setRaw(key: string, value: string): void {
  const now = Date.now();
  db.insert(settings)
    .values({ key, value, updated_at: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at: now } })
    .run();
}

function deleteRaw(key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

function getStoredSecret(key: string): string | undefined {
  const raw = getRaw(key);
  if (!raw) return undefined;
  try {
    return decryptSecret(raw);
  } catch {
    return undefined;
  }
}

/** Store (or clear, when `plaintext` is null/empty) an encrypted secret. */
export function setSecret(key: string, plaintext: string | null): void {
  if (!plaintext) {
    deleteRaw(key);
    return;
  }
  setRaw(key, encryptSecret(plaintext));
}

export function getAdminApiKey(): string | undefined {
  return config.adminApiKeyFromEnv ?? getStoredSecret(SETTING_ADMIN_KEY);
}

export function getCursorApiKey(): string | undefined {
  return config.cursorApiKeyFromEnv ?? getStoredSecret(SETTING_SDK_KEY);
}

function statusFor(envValue: string | undefined, settingKey: string): KeyStatus {
  if (envValue) return { configured: true, source: "env" };
  if (getRaw(settingKey)) return { configured: true, source: "stored" };
  return { configured: false, source: "none" };
}

export function adminKeyStatus(): KeyStatus {
  return statusFor(config.adminApiKeyFromEnv, SETTING_ADMIN_KEY);
}

export function cursorKeyStatus(): KeyStatus {
  return statusFor(config.cursorApiKeyFromEnv, SETTING_SDK_KEY);
}
