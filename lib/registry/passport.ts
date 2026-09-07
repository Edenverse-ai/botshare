import { PrismaClient } from "@prisma/client";

export async function readPublicPassport(db: PrismaClient, publicId: string) {
  if (!/^HFB-RB-\d{6}$/.test(publicId)) return null;
  const robot = await db.robotAsset.findUnique({
    where: { publicId },
    select: {
      publicId: true,
      registeredBrand: true,
      registeredModel: true,
      presentationId: true,
    },
  });
  if (!robot) return null;
  return {
    publicId: robot.publicId!,
    brand: robot.registeredBrand!,
    model: robot.registeredModel!,
    presentationPhoto: robot.presentationId
      ? `/api/registry/passports/${publicId}/photo`
      : null,
  };
}
