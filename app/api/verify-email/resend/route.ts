import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { issueVerificationCode } from "@/lib/emailVerification";
import { attemptSend, sendVerificationCode } from "@/lib/email";
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

  // Throttled per address as well as per caller: without this, the six-attempt
  // budget on a code could be reset indefinitely and the code brute-forced.
  const limited = getRateLimitResponse([
    { key: `resend:ip:${clientIp(request.headers)}`, rule: AUTH_RATE_LIMITS.resendPerIp },
    { key: `resend:email:${email}`, rule: AUTH_RATE_LIMITS.resendPerEmail },
  ]);
  if (limited) return limited;

  const user = await findUserByEmail(email);
  // An address with no unverified account still gets a bare ok, so the happy
  // path reveals nothing. A transport failure does return 502, which during an
  // outage distinguishes "unverified account exists" from "nothing here" — an
  // acceptable trade, because POST /api/register already answers that question
  // outright with 409, and because a resend that silently fails is the exact
  // defect that hid the botsharing.us outage. Close the 409 leak and this one
  // is worth revisiting.
  if (user && !user.emailVerified) {
    let sent = false;
    try {
      const code = await issueVerificationCode(email, "signup");
      sent = await attemptSend("verify-email/resend", () =>
        sendVerificationCode(email, code, user.name)
      );
    } catch (err) {
      console.error("[verify-email/resend] could not issue a code:", err);
    }
    if (!sent) {
      return NextResponse.json({ error: SEND_FAILED }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true });
}
