import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { confirmVerificationCode } from "@/lib/emailVerification";
import { normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp } from "@/lib/rateLimit";
import { getRateLimitResponse } from "@/lib/rateLimitResponse";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const limited = getRateLimitResponse([
    { key: `verify-email:${clientIp(request.headers)}`, rule: AUTH_RATE_LIMITS.verifyEmail },
  ]);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code : "";

  if (!email || code.length !== 6) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  const result = await confirmVerificationCode(email, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
