import bcrypt from "bcryptjs";
import { db } from "./localDb";

/**
 * Plants a code we know the plaintext of. The real code is only ever stored as
 * a purpose-bound bcrypt hash and delivered by email (Resend is disabled
 * locally), so this is the test seam for the code steps.
 */
export async function plantCode(
  email: string,
  code = "123456",
  purpose: "signup" | "reset" = "signup"
): Promise<string> {
  const codeHash = await bcrypt.hash(`${purpose}:${code}`, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.emailVerificationCode.upsert({
    where: { email },
    update: { codeHash, expiresAt, attempts: 0 },
    create: { email, codeHash, expiresAt },
  });
  return code;
}

export async function cleanup(...emails: string[]): Promise<void> {
  for (const email of emails) {
    const normalized = email.trim().toLowerCase();
    await db.emailVerificationCode.deleteMany({ where: { email: normalized } });
    await db.user.deleteMany({
      where: { email: { in: [email, normalized] } },
    });
  }
}

let ipCounter = 0;

/**
 * A distinct caller address per request. The auth endpoints throttle per IP, so
 * without this one test's budget would spill into the next; the tests that
 * exercise the throttle deliberately reuse a single address.
 */
export function freshIp(): Record<string, string> {
  ipCounter += 1;
  const block = Math.floor(ipCounter / 250) + 1;
  return { "x-forwarded-for": `198.51.${block}.${(ipCounter % 250) + 1}` };
}
