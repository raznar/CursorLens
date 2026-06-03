"use server";

import { revalidatePath } from "next/cache";
import { isEncryptionAvailable } from "@/lib/crypto";
import { SETTING_ADMIN_KEY, SETTING_SDK_KEY, setSecret } from "@/lib/keys";
import {
  clearAllMockAndFixtureData,
  onAdminKeyConfigured,
  runSync,
  setSyncConfig,
} from "@/lib/sync";

/**
 * Server actions for the Settings page. Secrets are stored encrypted via `lib/keys`;
 * non-secret sync config goes through `lib/sync`. Every action revalidates `/settings`
 * so the status reflects the change immediately.
 */

function readKey(formData: FormData): string {
  return String(formData.get("key") ?? "").trim();
}

export async function saveAdminKey(formData: FormData): Promise<void> {
  const key = readKey(formData);
  if (key && isEncryptionAvailable()) {
    setSecret(SETTING_ADMIN_KEY, key);
    onAdminKeyConfigured();
  }
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function clearAdminKey(): Promise<void> {
  setSecret(SETTING_ADMIN_KEY, null);
  revalidatePath("/settings");
}

export async function saveCursorKey(formData: FormData): Promise<void> {
  const key = readKey(formData);
  if (key && isEncryptionAvailable()) setSecret(SETTING_SDK_KEY, key);
  revalidatePath("/settings");
}

export async function clearCursorKey(): Promise<void> {
  setSecret(SETTING_SDK_KEY, null);
  revalidatePath("/settings");
}

export async function saveSyncSettings(formData: FormData): Promise<void> {
  const intervalHours = Number(formData.get("intervalHours"));
  const backfillDays = Number(formData.get("backfillDays"));
  setSyncConfig({
    intervalHours: Number.isFinite(intervalHours) ? intervalHours : undefined,
    backfillDays: Number.isFinite(backfillDays) ? backfillDays : undefined,
  });
  revalidatePath("/settings");
}

export async function triggerSync(formData: FormData): Promise<void> {
  const mode = formData.get("mode") === "backfill" ? "backfill" : "incremental";
  await runSync({ mode, trigger: "manual" });
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function clearCachedData(): Promise<void> {
  clearAllMockAndFixtureData();
  revalidatePath("/settings");
  revalidatePath("/");
}
