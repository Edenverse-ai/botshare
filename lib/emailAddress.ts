import prisma from "./prismadb";
import type { User } from "@prisma/client";

/**
 * Canonical form of an email address: trimmed and lower-cased. Every write path
 * (registration, verification, password reset) stores this form, and every read
 * path looks it up with `findUserByEmail`, so a mailbox is one account no matter
 * how the user capitalises it.
 */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Finds a user by email without caring about case. Accounts created before
 * normalization existed may still be stored with capital letters, so an exact
 * match is not enough.
 *
 * The fallback compares `lower(email)` in raw SQL on purpose. Prisma's
 * `mode: "insensitive"` compiles to `ILIKE`, which would treat `%` and `_` in
 * the submitted address as wildcards — and `_` is a legal character in a real
 * mailbox, so a lookalike address could be made to match somebody else's
 * account.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const exact = await prisma.user.findUnique({ where: { email: normalized } });
  if (exact) return exact;

  const [legacy] = await prisma.$queryRaw<User[]>`
    SELECT * FROM "User" WHERE lower("email") = ${normalized} LIMIT 1
  `;
  return legacy ?? null;
}
