import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { issueVerificationCode } from "@/lib/emailVerification";
import { sendVerificationCode } from "@/lib/email";
import { findUserByEmail, normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp } from "@/lib/rateLimit";
import { getRateLimitResponse } from "@/lib/rateLimitResponse";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  // Throttled per address as well as per caller: without this, the six-attempt
  // budget on a code could be reset indefinitely and the code brute-forced.
  const limited = getRateLimitResponse([
    { key: `resend:ip:${clientIp(request.headers)}`, rule: AUTH_RATE_LIMITS.resendPerIp },
    { key: `resend:email:${email}`, rule: AUTH_RATE_LIMITS.resendPerEmail },
  ]);
  if (limited) return limited;

  const user = await findUserByEmail(email);
  // Always respond ok — including when the transport fails — so the response
  // never reveals whether an address has an account.
  if (user && !user.emailVerified) {
    try {
      const code = await issueVerificationCode(email, "signup");
      await sendVerificationCode(email, code, user.name);
    } catch (err) {
      console.error("[verify-email/resend] failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
