import getCurrentUser from "@/app/actions/getCurrentUser";
import { isAdminEmail } from "@/lib/adminAuth";
import prisma from "@/lib/prismadb";
import { normalizeEmail } from "@/lib/emailAddress";
import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { NextResponse } from "next/server";

/**
 * Marks a seller as verified, or withdraws it.
 *
 * `User.verified` shipped in June 2026 with a badge and no writer, so every
 * account has read "Pending verification" ever since. This is the writer. It
 * gates creating a service — not signing in, and not submitting a robot to the
 * registry, because an administrator needs a submission in front of them
 * before they can judge whether the company is real.
 */
export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(currentUser.email)) {
    return NextResponse.json(
      { error: "Forbidden: administrator access required." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const verified = body?.verified !== false;
  if (!email) {
    return NextResponse.json(
      { error: "An account email is required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, verified: true },
  });
  if (!user) {
    return NextResponse.json({ error: `No account for ${email}.` }, { status: 404 });
  }

  if (user.verified === verified) {
    return NextResponse.json({ ok: true, verified, unchanged: true });
  }

  await prisma.user.update({ where: { id: user.id }, data: { verified } });
  // No audit table covers users, so the server log is the only trace. Worth
  // replacing with a real record if seller verification ever carries weight.
  console.info(
    `[verify-seller] ${currentUser.email} set verified=${verified} for ${email}`
  );

  return NextResponse.json({ ok: true, verified });
}
