/**
 * Best-effort in-process rate limiting for the auth endpoints. Each serverless
 * instance keeps its own counters, so a burst spread across instances gets a
 * proportionally higher allowance — enough to stop scripted abuse of a single
 * mailbox or address, not a substitute for an edge/shared-store limiter if
 * abuse becomes a real problem.
 */
export type RateLimitRule = {
  /** Requests allowed per window. */
  readonly limit: number;
  readonly windowMs: number;
};

const MINUTE_MS = 60 * 1000;

export const AUTH_RATE_LIMITS = {
  register: { limit: 8, windowMs: 10 * MINUTE_MS },
  verifyEmail: { limit: 20, windowMs: 10 * MINUTE_MS },
  resendPerEmail: { limit: 3, windowMs: 10 * MINUTE_MS },
  resendPerIp: { limit: 10, windowMs: 10 * MINUTE_MS },
  forgotPasswordPerEmail: { limit: 3, windowMs: 10 * MINUTE_MS },
  forgotPasswordPerIp: { limit: 8, windowMs: 10 * MINUTE_MS },
  resetPassword: { limit: 20, windowMs: 10 * MINUTE_MS },
  loginPerIdentity: { limit: 8, windowMs: 10 * MINUTE_MS },
  loginPerIp: { limit: 20, windowMs: 10 * MINUTE_MS },
} as const;

type Counter = { count: number; resetAt: number };

const counters = new Map<string, Counter>();
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now: number): void {
  counters.forEach((counter, key) => {
    if (counter.resetAt <= now) counters.delete(key);
  });
}

export type RateLimitResult = {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
};

/** Counts one hit against `key` and reports whether it is still within budget. */
export function consumeRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  if (counters.size > MAX_TRACKED_KEYS) pruneExpired(now);

  const existing = counters.get(key);
  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const next = { count: existing.count + 1, resetAt: existing.resetAt };
  counters.set(key, next);
  if (next.count <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - now) / 1000)),
  };
}

/** Test seam: drops every counter. Never called from application code. */
export function resetRateLimits(): void {
  counters.clear();
}

/**
 * The caller's address as seen behind Netlify's proxy. Spoofable in principle,
 * which is why the sensitive endpoints also throttle per email address.
 */
export function clientIp(headers: Headers | Record<string, string | undefined>): string {
  const read = (name: string): string | undefined =>
    headers instanceof Headers ? headers.get(name) ?? undefined : headers[name];
  const forwarded = read("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return read("x-nf-client-connection-ip") ?? read("x-real-ip") ?? "unknown";
}

