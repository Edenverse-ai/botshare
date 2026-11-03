import getCurrentUser from "@/app/actions/getCurrentUser";
import { isAdminEmail } from "@/lib/adminAuth";
import prisma from "@/lib/prismadb";
import { normalizeEmail } from "@/lib/emailAddress";
import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { NextResponse } from "next/server";

interface IParams {
  reservationId?: string;
}

/**
 * Records who physically performs a booked service.
 *
 * The customer's counterparty is the robot's owner, but the party that turns
 * up on site may be someone else. This endpoint only writes that fact down —
 * it does not assign work, notify anyone, or check availability. An empty
 * email clears it.
 */
export async function PATCH(request: Request, { params }: { params: IParams }) {
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

  const { reservationId } = params;
  if (!reservationId) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const rawEmail = typeof body?.operatorEmail === "string" ? body.operatorEmail : "";
  const email = normalizeEmail(rawEmail);

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true, operatorId: true },
  });
  if (!reservation) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  let operatorId: string | null = null;
  let operatorLabel = "nobody";
  if (email) {
    const operator = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, name: true, businessName: true },
    });
    if (!operator) {
      return NextResponse.json(
        { error: `No account for ${email}.` },
        { status: 400 }
      );
    }
    operatorId = operator.id;
    operatorLabel =
      operator.businessName || operator.name || operator.email || email;
  }

  if (operatorId === reservation.operatorId) {
    return NextResponse.json({ ok: true, operatorId, unchanged: true });
  }

  await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservation.id },
      data: { operatorId },
    }),
    // The event log is the booking's history; an operator change belongs in it
    // even though the order status did not move.
    prisma.reservationEvent.create({
      data: {
        reservationId: reservation.id,
        status: reservation.status,
        actorId: currentUser.id,
        note: operatorId
          ? `Operator set to ${operatorLabel}`
          : "Operator cleared",
      },
    }),
  ]);

  return NextResponse.json({ ok: true, operatorId });
}
