import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/prismadb";
import stripe from "@/lib/stripe";
import { getWritesBlockedResponse } from "@/lib/writeGuard";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const writesBlocked = getWritesBlockedResponse();
  if (writesBlocked) return writesBlocked;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { listingId, startDate, endDate, totalPrice } = body;

  if (!listingId || !startDate || !endDate || !totalPrice) {
    return NextResponse.json(
      { error: "Missing booking fields." },
      { status: 400 }
    );
  }

  if (totalPrice <= 0) {
    return NextResponse.json(
      { error: "Invalid booking total." },
      { status: 400 }
    );
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { title: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Service not found." }, { status: 404 });
  }

  const origin = request.headers.get("origin") ?? "https://hifivebot.com";

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_email: currentUser.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: totalPrice * 100,
          tax_behavior: "exclusive",
          product_data: {
            name: listing.title,
            description: "Hifivebot service booking",
            tax_code: "txcd_99999999",
          },
        },
      },
    ],
    metadata: {
      userId: currentUser.id,
      listingId,
      startDate,
      endDate,
      totalPrice: String(totalPrice),
    },
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/listings/${listingId}`,
  });

  return NextResponse.json({ url: session.url });
}
