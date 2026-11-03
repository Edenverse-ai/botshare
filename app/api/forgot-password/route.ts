import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { issueVerificationCode } from "@/lib/emailVerification";
import { attemptSend, sendPasswordResetCode } from "@/lib/email";
import { findUserByEmail, normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp } from "@/lib/rateLimit";
import { getRateLimitResponse } from "@/lib/rateLimitResponse";
import { NextResponse } from "next/server";

const SEND_FAILED =
  "We could not send the email just now. Please try again in a moment.";

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
  // Same trade as verify-email/resend: an unknown address still gets a bare ok,
  // but a transport failure is reported rather than swallowed. Telling someone
  // their reset code is on the way when it is not costs them the account.
  if (user && user.hashedPassword) {
    let sent = false;
    try {
      const code = await issueVerificationCode(email, "reset");
      sent = await attemptSend("forgot-password", () =>
        sendPasswordResetCode(email, code, user.name)
      );
    } catch (err) {
      console.error("[forgot-password] could not issue a code:", err);
    }
    if (!sent) {
      return NextResponse.json({ error: SEND_FAILED }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}
