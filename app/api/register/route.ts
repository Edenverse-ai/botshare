import prisma from "@/lib/prismadb";
import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { issueVerificationCode } from "@/lib/emailVerification";
import { sendVerificationCode } from "@/lib/email";
import { findUserByEmail, normalizeEmail } from "@/lib/emailAddress";
import { AUTH_RATE_LIMITS, clientIp } from "@/lib/rateLimit";
import { getRateLimitResponse } from "@/lib/rateLimitResponse";
import { validatePassword, PASSWORD_RULE_MESSAGE } from "@/lib/passwordPolicy";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const emailField = z
  .string({ required_error: "Enter your email address." })
  .transform(normalizeEmail)
  .pipe(z.string().email("Enter a valid email address."));

const registerSchema = z.object({
  email: emailField,
  name: z
    .string({ required_error: "Choose a username." })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Choose a username.").max(60, "That username is too long.")),
  password: z.string({ required_error: PASSWORD_RULE_MESSAGE }),
  userType: z.enum(["CUSTOMER", "PROVIDER"], {
    errorMap: () => ({ message: "Invalid user type." }),
  }),
  phone: z.string().trim().max(40).optional(),
  businessName: z.string().trim().max(120).optional(),
  termsVersion: z.string().optional(),
});

export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const limited = getRateLimitResponse([
    { key: `register:${clientIp(request.headers)}`, rule: AUTH_RATE_LIMITS.register },
  ]);
  if (limited) return limited;

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." },
      { status: 400 }
    );
  }
  const { email, name, password, userType, phone, businessName, termsVersion } = parsed.data;

  if (userType === "CUSTOMER") {
    if (typeof termsVersion !== "string" || termsVersion.length === 0) {
      return NextResponse.json(
        { error: "You must accept the Terms to continue." },
        { status: 400 }
      );
    }
  }

  // Enforce the password policy server-side (the client gate is bypassable).
  if (!validatePassword(password).valid) {
    return NextResponse.json({ error: PASSWORD_RULE_MESSAGE }, { status: 400 });
  }

  // Reject duplicate emails up-front for a clean client message. Case-insensitive
  // so one mailbox cannot become two accounts.
  const existing = await findUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      hashedPassword,
      userType,
      // emailVerified stays null until the code is confirmed.
      ...(phone ? { phone } : {}),
      ...(businessName ? { businessName } : {}),
      ...(userType === "CUSTOMER"
        ? { termsAcceptedAt: new Date(), termsAcceptedVersion: termsVersion }
        : {}),
    },
  });

  // Issue + email the verification code. Storing the code is what matters for
  // the flow; if the email transport hiccups we still return ok and let the
  // user hit "Resend".
  try {
    const code = await issueVerificationCode(email, "signup");
    await sendVerificationCode(email, code, name);
  } catch (err) {
    console.error("[register] verification email failed:", err);
  }

  return NextResponse.json({ ok: true, id: user.id });
}
