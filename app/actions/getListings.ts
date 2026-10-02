import prisma from "@/lib/prismadb";
import { Prisma } from "@prisma/client";
import { isServiceCategory, SERVICE_CATEGORIES } from "@/lib/serviceCategories";
import { getZipData } from "@/lib/zipMetro";
import { customerVisibilityWhere } from "@/lib/individualListing";

export interface IListingsParams {
  userId?: string;
  adminAll?: boolean;
  guestCount?: number;
  roomCount?: number;
  bathroomCount?: number;
  startDate?: string;
  endDate?: string;
  zipCode?: string;
  category?: string;
  robotModel?: string;
  /** Restricts results to services built on these robot models (robot tag pages). */
  robotModelIds?: string[];
}

export default async function getListings(params: IListingsParams) {
  try {
    const {
      userId,
      adminAll,
      roomCount,
      guestCount,
      bathroomCount,
      zipCode,
      startDate,
      endDate,
      category,
      robotModelIds,
    } = params;

    let query: any = {};

    if (userId) {
      query.userId = userId;
    } else if (!adminAll) {
      // Public catalog: hide AVAILABLE individual-owned pool robots; show
      // company listings and CLAIMED (now operator-run) individual robots.
      // Admin all-listings (adminAll) intentionally bypasses this to retain
      // oversight of the pending pool.
      Object.assign(query, customerVisibilityWhere());
    }

    // `category` is one of the 8 canonical service scenarios; anything else is
    // a dead filter rather than an unfiltered catalog.
    if (category && !isServiceCategory(category)) {
      return [];
    }

    if (category) {
      query.AND = [...(query.AND ?? []), { category }];
    }

    if (robotModelIds) {
      if (robotModelIds.length === 0) return [];
      query.AND = [
        ...(query.AND ?? []),
        { robotModelId: { in: robotModelIds } },
      ];
    }

    if (roomCount) {
      query.roomCount = {
        gte: +roomCount,
      };
    }

    if (guestCount) {
      query.guestCount = {
        gte: +guestCount,
      };
    }

    if (bathroomCount) {
      query.bathroomCount = {
        gte: +bathroomCount,
      };
    }

    if (zipCode) {
      const zipData = getZipData(zipCode);
      if (!zipData) return [];

      const nearbyRows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT DISTINCT ON (title) id
          FROM "Listing"
          WHERE "metro"::text = ${zipData.metro}
            AND (
              3959 * acos(
                LEAST(1.0,
                  cos(radians(${zipData.lat})) * cos(radians(lat)) *
                  cos(radians(lng) - radians(${zipData.lng})) +
                  sin(radians(${zipData.lat})) * sin(radians(lat))
                )
              )
            ) <= 100
          ORDER BY title,
            (3959 * acos(
              LEAST(1.0,
                cos(radians(${zipData.lat})) * cos(radians(lat)) *
                cos(radians(lng) - radians(${zipData.lng})) +
                sin(radians(${zipData.lat})) * sin(radians(lat))
              )
            )) ASC
        `
      );
      if (nearbyRows.length === 0) return [];
      query.id = { in: nearbyRows.map((r) => r.id) };
    }

    if (startDate && endDate) {
      query.NOT = {
        reservations: {
          some: {
            OR: [
              {
                endDate: { gte: startDate },
                startDate: { lte: startDate },
              },
              {
                startDate: { lte: endDate },
                endDate: { gte: endDate },
              },
            ],
          },
        },
      };
    }

    const listing = await prisma.listing.findMany({
      where: query,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        user: { select: { name: true, businessName: true } },
        operator: { select: { name: true, businessName: true } },
      },
    });

    const safeListings = listing.map(({ user, operator, ...list }) => {
      const operatorName =
        list.isIndividualOwned && list.status === "CLAIMED" && operator
          ? operator.businessName || operator.name || undefined
          : user?.businessName || user?.name || undefined;
      return {
        ...list,
        createdAt: list.createdAt.toISOString(),
        operatorName,
      };
    });

    if (!category) {
      // Unfiltered catalog leads with the scenarios customers browse most.
      const order = new Map(
        SERVICE_CATEGORIES.map((label, index) => [label as string, index])
      );
      safeListings.sort(
        (a, b) =>
          (order.get(a.category) ?? order.size) -
          (order.get(b.category) ?? order.size)
      );
    }

    if (!userId) {
      const seen = new Set<string>();
      return safeListings.filter((l) => {
        if (seen.has(l.title)) return false;
        seen.add(l.title);
        return true;
      });
    }

    return safeListings;
  } catch (error: any) {
    throw new Error(error.message);
  }
}
