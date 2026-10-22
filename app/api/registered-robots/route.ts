import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/prismadb";
import { canManageServices } from "@/lib/adminAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Registered robots a provider can build a service on, with their model's
// price sheet. Any provider may list any registered robot for now.
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageServices(currentUser)) {
    return NextResponse.json(
      { error: "Forbidden: service provider access required." },
      { status: 403 }
    );
  }

  const robots = await prisma.robotAsset.findMany({
    where: { lifecycle: "REGISTERED", publicId: { not: null }, modelId: { not: null } },
    orderBy: { publicId: "asc" },
    select: {
      id: true,
      publicId: true,
      model: {
        select: {
          id: true,
          slug: true,
          brand: true,
          model: true,
          productName: true,
          description: true,
          msrp: true,
          serviceCategory: true,
          capabilityTag: true,
          imageUrl: true,
          priceHourly: true,
          priceDaily: true,
          priceMonthly: true,
          useCase: true,
          priceTiers: {
            select: { unit: true, minQty: true, maxQty: true, pricing: true, amount: true },
            orderBy: [{ unit: "asc" }, { minQty: "asc" }],
          },
        },
      },
    },
  });

  return NextResponse.json(robots);
}
