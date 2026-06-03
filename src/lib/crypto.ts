import "server-only";
import crypto from "node:crypto";
import { config } from "./config";
import { ConfigError, ValidationError } from "./errors";

/**
 * AES-256-GCM encryption for API keys stored at rest in the `settings` table.
 * The key is derived from `CURSOR_LENS_SECRET` via scrypt. The legacy
 * `ANALYTICS_AGENT_SECRET` env var is still accepted by config for existing deployments.
 * Format of a stored value: `iv:authTag:ciphertext`, all base64.
 */
const ALGO = "aes-256-gcm";
// Preserve the original salt so existing encrypted keys remain decryptable after the rename.
const SCRYPT_SALT = "analytics-agent.v1";

function derivedKey(): Buffer {
  if (!config.secret) {
    throw new ConfigError(
      "CURSOR_LENS_SECRET is required to store API keys. Generate one with `openssl rand -hex 32`.",
    );
  }
  return crypto.scryptSync(config.secret, SCRYPT_SALT, 32);
}

export function isEncryptionAvailable(): boolean {
  return Boolean(config.secret);
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new ValidationError("Malformed encrypted secret");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const decipher = crypto.createDecipheriv(ALGO, derivedKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
