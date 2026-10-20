import prisma from "@/lib/prismadb";
import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { verifyResetCode } from "@/lib/emailVerification";
import { findUserByEmail, normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp } from "@/lib/rateLimit";
import { getRateLimitResponse } from "@/lib/rateLimitResponse";
import { validatePassword, PASSWORD_RULE_MESSAGE } from "@/lib/passwordPolicy";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const limited = getRateLimitResponse([
    {
      key: `reset-password:${clientIp(request.headers)}`,
      rule: AUTH_RATE_LIMITS.resetPassword,
    },
  ]);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || code.length !== 6) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  // Enforce the password policy server-side (the client gate is bypassable).
  if (!validatePassword(password).valid) {
    return NextResponse.json({ error: PASSWORD_RULE_MESSAGE }, { status: 400 });
  }

  const result = await verifyResetCode(email, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  // Proving control of the email also verifies it, so mark it verified.
  await prisma.user.update({
    where: { id: user.id },
    data: { hashedPassword, emailVerified: new Date() },
  });

  return NextResponse.json({ ok: true });
}
