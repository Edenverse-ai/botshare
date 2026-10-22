import getCurrentUser from "@/app/actions/getCurrentUser";
import prisma from "@/lib/prismadb";
import { canManageServices } from "@/lib/adminAuth";
import { isServiceCategory } from "@/lib/serviceCategories";
import { defaultCategoryForUseCases } from "@/lib/useCases";
import { isProviderProfileComplete } from "@/lib/providerProfile";
import { hasActiveSkuConflict } from "@/lib/individualListing";
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
    robotModelId,
    robotAssetId,
    isIndividualOwned,
  } = body;

  const individualIntent = isIndividualOwned === true;

  // Company listings require provider/admin + a complete provider profile.
  // Individual robot listings are open to any authenticated user.
  if (!individualIntent) {
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

  // Company services are built on a robot registered in the Robot Registry; the
  // model and price come from that robot, never from the client. Individual
  // pool listings (no registered robots) still pick a listable catalog model.
  let robot: { id: string; useCase: string[]; priceDaily: number | null } | null;
  let registeredRobotId: string | null = null;
  if (!individualIntent) {
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
        model: { select: { id: true, useCase: true, priceDaily: true } },
      },
    });
    if (!asset || asset.lifecycle !== "REGISTERED" || !asset.publicId || !asset.model) {
      return NextResponse.json(
        { error: "Only registered robots can be listed." },
        { status: 400 }
      );
    }
    robot = asset.model;
    registeredRobotId = asset.id;
  } else {
    if (!robotModelId) {
      return NextResponse.json(
        { error: "A robot model is required." },
        { status: 400 }
      );
    }
    const model = await prisma.robotModel.findUnique({
      where: { id: String(robotModelId) },
      select: { id: true, listable: true, useCase: true, priceDaily: true },
    });
    if (!model || !model.listable) {
      return NextResponse.json(
        { error: "Selected robot model is not available for listing." },
        { status: 400 }
      );
    }
    if (model.useCase.length === 0) {
      return NextResponse.json(
        { error: "Selected robot model is missing a use case." },
        { status: 400 }
      );
    }
    robot = model;
  }

  if (robot.priceDaily == null) {
    return NextResponse.json(
      { error: "This robot model has no daily price yet. Set it in Robot registry → Pricing." },
      { status: 400 }
    );
  }
  if (!isServiceCategory(category) && robot.useCase.length === 0) {
    return NextResponse.json(
      { error: "Choose a service scenario." },
      { status: 400 }
    );
  }

  if (individualIntent) {
    const normalizedSku = sku ? String(sku).trim() : "";
    if (!normalizedSku) {
      return NextResponse.json(
        { error: "A SKU is required to list your robot." },
        { status: 400 }
      );
    }
    const activeSameSku = await prisma.listing.findMany({
      where: {
        sku: normalizedSku,
        isIndividualOwned: true,
        status: { in: ["AVAILABLE", "CLAIMED"] },
      },
      select: { status: true },
    });
    if (hasActiveSkuConflict(activeSameSku)) {
      return NextResponse.json(
        { error: "This robot (SKU) already has an active listing." },
        { status: 409 }
      );
    }
  }

  // The service scenario is the provider's choice; fall back to the robot's
  // primary capability so older clients keep working.
  const derivedCategory = isServiceCategory(category)
    ? category
    : defaultCategoryForUseCases(robot.useCase);
  const derivedPrice = robot.priceDaily;

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
      userId: currentUser.id,
      robotModelId: robot.id,
      ...(registeredRobotId ? { robotAssetId: registeredRobotId } : {}),
      isIndividualOwned: individualIntent,
      ...(individualIntent ? { status: "AVAILABLE" as const } : {}),
    },
  });

  return NextResponse.json(listing);
}
