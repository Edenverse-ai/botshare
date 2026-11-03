import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/prismadb";
import { canManageServices, isAdminEmail } from "@/lib/adminAuth";
import { isServiceCategory } from "@/lib/serviceCategories";
import { defaultCategoryForUseCases } from "@/lib/useCases";
import { isProviderProfileComplete } from "@/lib/providerProfile";
import { getMetroLabel, getZipData } from "@/lib/zipMetro";
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
  const {
    title,
    description,
    category,
    imageSrc,
    videoSrc,
    sku,
    skuImageSrc,
    zipCode,
    robotAssetId,
  } = body;

  if (!canManageServices(currentUser)) {
    return NextResponse.json(
      { error: "Forbidden: service provider access required." },
      { status: 403 }
    );
  }
  if (!isProviderProfileComplete(currentUser)) {
    return NextResponse.json(
      { error: "Complete your provider profile (name, phone, company) before listing." },
      { status: 400 }
    );
  }
  // Selling requires a verified seller. Submitting a robot to the registry does
  // not — an administrator needs something concrete to review before deciding
  // whether the company is real, and gating both would deadlock onboarding.
  // Profile completeness is a form check; this is the trust decision.
  if (!currentUser.verified && !isAdminEmail(currentUser.email)) {
    return NextResponse.json(
      {
        error:
          "Hifivebot has not verified your account yet. Submit your robots to the Robot Registry and we will review them together.",
      },
      { status: 403 }
    );
  }

  if (!title || !description || !imageSrc) {
    return NextResponse.json(
      { error: "Missing required service fields." },
      { status: 400 }
    );
  }

  const normalizedZip = zipCode ? String(zipCode).trim() : "";
  if (!/^\d{5}$/.test(normalizedZip)) {
    return NextResponse.json(
      { error: "A 5-digit zip code is required." },
      { status: 400 }
    );
  }

  const zipData = getZipData(normalizedZip);
  if (!zipData) {
    return NextResponse.json(
      { error: "Zip code is not in a supported service area." },
      { status: 400 }
    );
  }

  // A service is built on a robot registered in the Robot Registry; the model
  // and price come from that robot, never from the client.
  if (!robotAssetId) {
    return NextResponse.json(
      { error: "Choose a registered robot." },
      { status: 400 }
    );
  }
  const asset = await prisma.robotAsset.findUnique({
    where: { id: String(robotAssetId) },
    select: {
      id: true,
      lifecycle: true,
      publicId: true,
      ownerId: true,
      model: { select: { id: true, useCase: true, priceDaily: true } },
    },
  });
  if (!asset || asset.lifecycle !== "REGISTERED" || !asset.publicId || !asset.model) {
    return NextResponse.json(
      { error: "Only registered robots can be listed." },
      { status: 400 }
    );
  }

  // Owning a robot and selling it are one role: a provider lists only their own
  // machines. An administrator is the single exception, so a partner can be
  // onboarded without the platform taking ownership of their inventory — the
  // listing is still the owner's, and the acting administrator is recorded.
  const actingAsAdmin = isAdminEmail(currentUser.email);
  if (!actingAsAdmin && asset.ownerId !== currentUser.id) {
    return NextResponse.json(
      { error: "You can only list a robot your account owns." },
      { status: 403 }
    );
  }
  if (actingAsAdmin && !asset.ownerId) {
    return NextResponse.json(
      { error: "This robot has no owner account yet. Set one in the Robot Registry first." },
      { status: 400 }
    );
  }
  const listingOwnerId = asset.ownerId ?? currentUser.id;
  const model = asset.model;

  if (model.priceDaily == null) {
    return NextResponse.json(
      { error: "This robot model has no daily price yet. Set it in Robot registry → Pricing." },
      { status: 400 }
    );
  }
  if (!isServiceCategory(category) && model.useCase.length === 0) {
    return NextResponse.json(
      { error: "Choose a service scenario." },
      { status: 400 }
    );
  }

  // The service scenario is the provider's choice; fall back to the robot's
  // primary capability so older clients keep working.
  const derivedCategory = isServiceCategory(category)
    ? category
    : defaultCategoryForUseCases(model.useCase);
  const derivedPrice = model.priceDaily;

  const parsedGuestCount = 1;
  const parsedRoomCount = 1;
  const parsedBathroomCount = 1;

  const listing = await prisma.listing.create({
    data: {
      title,
      description,
      imageSrc,
      ...(videoSrc ? { videoSrc } : {}),
      ...(sku ? { sku: String(sku) } : {}),
      ...(skuImageSrc ? { skuImageSrc: String(skuImageSrc) } : {}),
      category: derivedCategory,
      roomCount: parsedRoomCount,
      bathroomCount: parsedBathroomCount,
      guestCount: parsedGuestCount,
      locationValue: getMetroLabel(zipData.metro),
      metro: zipData.metro,
      zipCode: normalizedZip,
      lat: zipData.lat,
      lng: zipData.lng,
      price: derivedPrice,
      userId: listingOwnerId,
      robotModelId: model.id,
      robotAssetId: asset.id,
    },
  });

  // An administrator acting for an owner leaves a trace on the robot, which is
  // where anyone asking "who put this on sale?" will look.
  if (actingAsAdmin && listingOwnerId !== currentUser.id) {
    await prisma.robotAudit.create({
      data: {
        robotId: asset.id,
        kind: "LISTED_BY_ADMIN",
        data: {
          listingId: listing.id,
          listingTitle: listing.title,
          onBehalfOfUserId: listingOwnerId,
        },
        actorId: currentUser.id,
        actorEmail: currentUser.email!,
      },
    });
  }

  return NextResponse.json(listing);
}
