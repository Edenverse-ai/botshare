import prisma from "@/lib/prismadb";

interface IParams {
  listingId?: string;
}

export default async function getListingById(params: IParams) {
  try {
    const { listingId } = params;

    const listing = await prisma.listing.findUnique({
      where: {
        id: listingId,
      },
      include: {
        user: {
          include: {
            favoriteListings: {
              select: {
                listingId: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return null;
    }

    const { favoriteListings, ...safeListingUser } = listing.user;

    return {
      ...listing,
      createdAt: listing.createdAt.toString(),
      user: {
        ...safeListingUser,
        createdAt: safeListingUser.createdAt.toString(),
        updatedAt: safeListingUser.updatedAt.toString(),
        emailVerified: safeListingUser.emailVerified?.toString() || null,
        favoriteListingIds: favoriteListings.map((favorite) => favorite.listingId),
      },
    };
  } catch (error: any) {
    throw new Error(error.message);
  }
}
