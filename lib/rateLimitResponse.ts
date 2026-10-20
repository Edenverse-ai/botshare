import { NextResponse } from "next/server";
import { TOO_MANY_REQUESTS_MESSAGE } from "./authMessages";
import { RateLimitRule, consumeRateLimit } from "./rateLimit";

/**
 * Applies every rule in order and returns a 429 response for the first one that
 * is exhausted, or null when the request is within budget.
 */
export function getRateLimitResponse(
  checks: ReadonlyArray<{ key: string; rule: RateLimitRule }>
): NextResponse | null {
  for (const { key, rule } of checks) {
    const result = consumeRateLimit(key, rule);
    if (result.allowed) continue;
    return NextResponse.json(
      { error: TOO_MANY_REQUESTS_MESSAGE },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
    );
  }
  return null;
}
