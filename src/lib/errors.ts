/**
 * Single typed error taxonomy for the app. Every failure that crosses a boundary
 * (API client, sync, routes) should be one of these so callers can branch on `kind`
 * and `retryable` instead of sniffing strings. See the `architecture-overview` skill.
 */

export type ErrorKind =
  | "auth" // 401/403 — bad or insufficient API key
  | "rate_limit" // 429 — too many requests
  | "validation" // response/body failed schema validation
  | "transport" // network / non-2xx we can't classify better
  | "not_found" // 404
  | "config" // misconfiguration (missing key, bad env)
  | "unknown";

export interface AppErrorOptions {
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly context?: Record<string, unknown>;

  constructor(kind: ErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.context = options.context;
  }

  /** Safe, serializable shape for logs and API responses. */
  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      context: this.context,
    };
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed", options: AppErrorOptions = {}) {
    super("auth", message, { ...options, retryable: false });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded", options: AppErrorOptions = {}) {
    super("rate_limit", message, { ...options, retryable: true });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Response failed validation", options: AppErrorOptions = {}) {
    super("validation", message, { ...options, retryable: false });
  }
}

export class TransportError extends AppError {
  constructor(message = "Request failed", options: AppErrorOptions = {}) {
    super("transport", message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", options: AppErrorOptions = {}) {
    super("not_found", message, { ...options, retryable: false });
  }
}

export class ConfigError extends AppError {
  constructor(message = "Invalid configuration", options: AppErrorOptions = {}) {
    super("config", message, { ...options, retryable: false });
  }
}

/** Map an HTTP status to a typed error (used by the API client). */
export function errorFromStatus(
  status: number,
  message: string,
  options: AppErrorOptions = {},
): AppError {
  const merged = { ...options, status };
  if (status === 401 || status === 403) return new AuthError(message, merged);
  if (status === 404) return new NotFoundError(message, merged);
  if (status === 429) return new RateLimitError(message, merged);
  return new TransportError(message, { ...merged, retryable: status >= 500 });
}

/** Append the first Zod issue path to a validation error message (for sync status UI). */
export function formatValidationError(err: ValidationError): string {
  const issues = err.context?.issues as
    | Array<{ path: (string | number)[]; message: string }>
    | undefined;
  if (!issues?.length) return err.message;
  const first = issues[0]!;
  const path = first.path.length ? first.path.join(".") : "(root)";
  return `${err.message} at ${path}: ${first.message}`;
}

/** Coerce any thrown value into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof ValidationError) {
    return new ValidationError(formatValidationError(err), {
      status: err.status,
      cause: err.cause,
      context: err.context,
    });
  }
  if (err instanceof AppError) return err;
  if (err instanceof Error) return new AppError("unknown", err.message, { cause: err });
  return new AppError("unknown", String(err), { cause: err });
}
