import "server-only";
import { cache } from "react";
import { adminKeyStatus } from "@/lib/keys";
import { ingestedCacheReadable } from "@/lib/sync/cache-policy";

/** Per-request memo for layout + query helpers that share the same SQLite reads. */
export const getIngestedCacheReadable = cache(ingestedCacheReadable);

export const getAdminKeyStatus = cache(adminKeyStatus);
