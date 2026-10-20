import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { issueVerificationCode } from "@/lib/emailVerification";
import { sendPasswordResetCode } from "@/lib/email";
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

  const limited = getRateLimitResponse([
    {
      key: `forgot:ip:${clientIp(request.headers)}`,
      rule: AUTH_RATE_LIMITS.forgotPasswordPerIp,
    },
    { key: `forgot:email:${email}`, rule: AUTH_RATE_LIMITS.forgotPasswordPerEmail },
  ]);
  if (limited) return limited;

  const user = await findUserByEmail(email);
  // Always respond ok — including when the transport fails — so the response
  // never reveals whether an address has an account.
  if (user && user.hashedPassword) {
    try {
      const code = await issueVerificationCode(email, "reset");
      await sendPasswordResetCode(email, code, user.name);
    } catch (err) {
      console.error("[forgot-password] failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
