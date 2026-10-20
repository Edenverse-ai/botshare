// Client-safe email checks. Kept separate from lib/emailAddress.ts so the
// browser bundle never pulls in Prisma.

/** Deliberately permissive: one @, no spaces, a dot in the domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_RULE_MESSAGE = "Enter a valid email address.";

export function isValidEmailAddress(value: unknown): boolean {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}
