// app/actions/getAllReservations.ts
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prismadb";
import { SafeAdminReservation } from "@/types";

interface IAdminReservationParams {
  search?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}

export default async function getAllReservations(
  params: IAdminReservationParams
): Promise<SafeAdminReservation[]> {
  try {
    const { search, category, startDate, endDate } = params;

    const where: Prisma.ReservationWhereInput = {};

    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (category) {
      where.listing = { category };
    }

    // Date filter: service window overlaps [startDate, endDate]
    if (startDate && endDate) {
      where.startDate = { lte: new Date(endDate) };
      where.endDate = { gte: new Date(startDate) };
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        user: true,
        listing: true,        // NO listing.user — the provider's name is not shown here
        operator: { select: { email: true, name: true, businessName: true } },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return reservations.map((r) => {
      const { user, operator, ...rest } = r; // drop raw rows — DateTime is not RSC-serializable
      return {
        ...rest,
        operatorEmail: operator?.email ?? null,
        operatorLabel:
          operator?.businessName || operator?.name || operator?.email || null,
        createdAt: r.createdAt.toISOString(),
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        listing: {
          ...r.listing,
          createdAt: r.listing.createdAt.toISOString(),
          // providerName intentionally omitted — listing.user not included in query
        },
        customerName: user.name ?? "",
        customerEmail: user.email ?? "",
        customerPhone: user.phone ?? null,
        customerBusinessName: user.businessName ?? null,
      };
    });
  } catch (error: any) {
    throw new Error(error.message);
  }
}
