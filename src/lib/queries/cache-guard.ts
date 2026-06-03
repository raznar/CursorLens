import "server-only";
import { getIngestedCacheReadable } from "@/lib/server/request-cache";

/** Run a dashboard query only when ingested data may be shown (live key ⇒ post-live sync). */
export function whenCacheReadable<T>(empty: T, load: () => T): T {
  if (!getIngestedCacheReadable()) return empty;
  return load();
}
