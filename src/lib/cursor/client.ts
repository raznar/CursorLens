/**
 * The low-level Cursor API HTTP client. Pure and self-contained: it is handed an API key
 * (never reads it from `db`/`keys`), Basic-auths every request, routes it through the
 * per-group rate limiter, retries 429/5xx/network errors with backoff that honors
 * `Retry-After` / `X-RateLimit-Reset`, threads ETag / `If-None-Match`, and Zod-validates
 * every response. Failures surface as the typed errors in `src/lib/errors`.
 *
 * In mock mode the injected `fetchImpl` serves bundled fixtures (see `mock.ts`) and the
 * rate limiter is bypassed, so the full request/parse/validate path still runs offline.
 *
 * Boundary: imports only shared lib (`config`, `errors`, `logger`, `registry`) + sibling
 * client modules. Never `db` / sync / UI.
 */
import type { z } from "zod";
import { config } from "@/lib/config";
import {
  AuthError,
  RateLimitError,
  TransportError,
  ValidationError,
  errorFromStatus,
} from "@/lib/errors";
import { logger as rootLogger, type Logger } from "@/lib/logger";
import type { RateLimitGroup } from "@/lib/registry";
import { createLimiters, schedule, type Limiters } from "./ratelimit";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CursorClientOptions {
  /** Admin/Analytics key for Basic auth. Omitted in mock mode. */
  apiKey?: string;
  /** API base URL (no trailing slash). Defaults to `config.cursorApiBaseUrl`. */
  baseUrl?: string;
  /** Serve bundled fixtures instead of hitting the network. Defaults to `config.mock`. */
  mock?: boolean;
  /** Injected fetch (defaults to global `fetch`, or the mock shim in mock mode). */
  fetchImpl?: FetchLike;
  /** Injected rate limiters (defaults to fresh limiters from the registry). */
  limiters?: Limiters;
  /** Max retry attempts for 429 / 5xx / network errors (default 4). */
  maxRetries?: number;
  /** Base backoff delay in ms for exponential backoff (default 500). */
  backoffBaseMs?: number;
  /** Backoff ceiling in ms (default 30_000). */
  backoffMaxMs?: number;
  /** Sleep function (injected in tests to avoid real waits). */
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

export interface RequestSpec<T> {
  method: "GET" | "POST";
  path: string;
  group: RateLimitGroup;
  schema: z.ZodType<T>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** ETag to send as `If-None-Match`; a matching response yields `notModified: true`. */
  etag?: string;
}

export interface ApiResult<T> {
  /** Parsed/validated body, or `null` when the server returned 304 Not Modified. */
  data: T | null;
  /** ETag from the response (store this to send as `If-None-Match` next time). */
  etag?: string;
  notModified: boolean;
  status: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function basicAuthHeader(apiKey: string | undefined): string {
  // Admin/Analytics API uses the key as the Basic-auth username with an empty password.
  return `Basic ${Buffer.from(`${apiKey ?? ""}:`).toString("base64")}`;
}

function buildUrl(baseUrl: string, path: string, query?: RequestSpec<unknown>["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Parse `Retry-After` (seconds or HTTP-date) and `X-RateLimit-Reset` (epoch s/ms). */
export function parseRetryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset) {
    const value = Number(reset);
    if (Number.isFinite(value)) {
      // Heuristic: values that look like epoch seconds are < ~10^11; larger are ms.
      const resetMs = value > 1e11 ? value : value * 1000;
      return Math.max(0, resetMs - now);
    }
  }
  return undefined;
}

export class CursorHttp {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  readonly mock: boolean;
  private readonly fetchImpl: FetchLike;
  private readonly limiters: Limiters;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: Logger;

  constructor(options: CursorClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? config.cursorApiBaseUrl).replace(/\/$/, "");
    this.mock = options.mock ?? config.mock;
    this.fetchImpl = options.fetchImpl ?? (fetch as FetchLike);
    this.limiters = options.limiters ?? createLimiters();
    this.maxRetries = options.maxRetries ?? 4;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.sleep = options.sleep ?? defaultSleep;
    this.log = (options.logger ?? rootLogger).child({ module: "cursor-client" });
  }

  /** Exponential backoff with full jitter, capped at `backoffMaxMs`. */
  private backoffDelay(attempt: number): number {
    const ceil = Math.min(this.backoffMaxMs, this.backoffBaseMs * 2 ** attempt);
    return Math.floor(Math.random() * ceil);
  }

  /** Issue a request (rate-limited unless in mock mode), retrying transient failures. */
  async request<T>(spec: RequestSpec<T>): Promise<ApiResult<T>> {
    const run = () => this.execute(spec);
    return this.mock ? run() : schedule(this.limiters, spec.group, run);
  }

  private async execute<T>(spec: RequestSpec<T>): Promise<ApiResult<T>> {
    const url = buildUrl(this.baseUrl, spec.path, spec.query);
    const headers: Record<string, string> = {
      Authorization: basicAuthHeader(this.apiKey),
      Accept: "application/json",
    };
    if (spec.body !== undefined) headers["Content-Type"] = "application/json";
    if (spec.etag) headers["If-None-Match"] = spec.etag;

    const init: RequestInit = {
      method: spec.method,
      headers,
      body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
    };

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, init);
      } catch (cause) {
        if (attempt < this.maxRetries) {
          const wait = this.backoffDelay(attempt);
          this.log.warn({ url, attempt, wait, err: String(cause) }, "network error, retrying");
          await this.sleep(wait);
          continue;
        }
        throw new TransportError("Network request to Cursor API failed", {
          cause,
          retryable: true,
          context: { url, method: spec.method },
        });
      }

      if (response.status === 304) {
        return { data: null, notModified: true, status: 304, etag: spec.etag };
      }

      if (response.status === 429) {
        if (attempt < this.maxRetries) {
          const wait = parseRetryAfterMs(response.headers) ?? this.backoffDelay(attempt);
          this.log.warn({ url, attempt, wait }, "rate limited (429), backing off");
          await this.sleep(wait);
          continue;
        }
        throw new RateLimitError("Cursor API rate limit exceeded", {
          status: 429,
          retryAfterMs: parseRetryAfterMs(response.headers),
          context: { url },
        });
      }

      if (response.status >= 500 && attempt < this.maxRetries) {
        const wait = this.backoffDelay(attempt);
        this.log.warn({ url, attempt, wait, status: response.status }, "server error, retrying");
        await this.sleep(wait);
        continue;
      }

      if (!response.ok) {
        const detail = await safeText(response);
        const err = errorFromStatus(response.status, `Cursor API ${response.status}: ${detail}`, {
          context: { url, method: spec.method },
        });
        // 401/403 on Enterprise-only endpoints is expected for non-enterprise keys; let the
        // sync engine decide how to surface it. Re-throw as the typed error.
        if (err instanceof AuthError) {
          this.log.debug({ url, status: response.status }, "auth/permission error");
        }
        throw err;
      }

      const json = await this.parseJson(response, url);
      const parsed = spec.schema.safeParse(json);
      if (!parsed.success) {
        throw new ValidationError("Cursor API response failed schema validation", {
          context: { url, issues: parsed.error.issues.slice(0, 5) },
        });
      }
      return {
        data: parsed.data,
        notModified: false,
        status: response.status,
        etag: response.headers.get("etag") ?? undefined,
      };
    }
  }

  private async parseJson(response: Response, url: string): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw new TransportError("Failed to parse Cursor API JSON response", {
        cause,
        context: { url },
      });
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return response.statusText;
  }
}
