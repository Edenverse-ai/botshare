import bcrypt from "bcryptjs";
import prisma from "./prismadb";
import { findUserByEmail, normalizeEmail } from "./emailAddress";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 6;

/**
 * What a code was issued for. The purpose is folded into the hashed payload, so
 * a signup code cannot be replayed against the password-reset endpoint (and
 * vice versa) even though both share one row per email address.
 */
export type CodePurpose = "signup" | "reset";

/** Random 6-digit numeric code as a string ("000000"–"999999"). */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashedPayload(purpose: CodePurpose, code: string): string {
  return `${purpose}:${code}`;
}

/**
 * Creates (or replaces) the active code for an email and returns the PLAINTEXT
 * code so the caller can email it. Only the purpose-bound hash is stored.
 */
export async function issueVerificationCode(
  email: string,
  purpose: CodePurpose
): Promise<string> {
  const normalized = normalizeEmail(email);
  const code = generateCode();
  const codeHash = await bcrypt.hash(hashedPayload(purpose, code), 10);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.emailVerificationCode.upsert({
    where: { email: normalized },
    update: { codeHash, expiresAt, attempts: 0 },
    create: { email: normalized, codeHash, expiresAt },
  });

  return code;
}

type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * Shared expiry / attempt-budget / hash checks. Consumes one attempt on a wrong
 * guess and deletes the row once a code has been accepted.
 */
async function consumeCode(
  email: string,
  code: string,
  purpose: CodePurpose,
  missingMessage: string
): Promise<ConfirmResult> {
  const normalized = normalizeEmail(email);
  const record = await prisma.emailVerificationCode.findUnique({
    where: { email: normalized },
  });
  if (!record) {
    return { ok: false, error: missingMessage };
  }
  if (record.expiresAt < new Date()) {
    await prisma.emailVerificationCode
      .delete({ where: { email: normalized } })
      .catch(() => {});
    return { ok: false, error: "This code has expired. Request a new one." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Request a new code." };
  }

  const valid = await bcrypt.compare(hashedPayload(purpose, code), record.codeHash);
  if (!valid) {
    await prisma.emailVerificationCode.update({
      where: { email: normalized },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "Invalid or expired code." };
  }

  await prisma.emailVerificationCode.delete({ where: { email: normalized } });
  return { ok: true };
}

/**
 * Validates a submitted signup code. On success, marks the user's email
 * verified and clears the code.
 */
export async function confirmVerificationCode(
  email: string,
  code: string
): Promise<ConfirmResult> {
  const user = await findUserByEmail(email);
  if (!user) {
    return { ok: false, error: "No verification request found. Please sign up again." };
  }

  const consumed = await consumeCode(
    email,
    code,
    "signup",
    "No verification request found. Please sign up again."
  );
  if (!consumed.ok) return consumed;

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  });
  return { ok: true };
}

/**
 * Validates a code for a password reset. Same expiry/attempt/hash checks as
 * confirmVerificationCode, but on success it only clears the code — it does
 * NOT flip emailVerified or change the password (the caller does that). Used
 * by the forgot-password flow.
 */
export async function verifyResetCode(
  email: string,
  code: string
): Promise<ConfirmResult> {
  return consumeCode(email, code, "reset", "No reset request found. Request a new code.");
}
