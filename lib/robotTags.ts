import prisma from "@/lib/prismadb";
import { USE_CASES } from "@/lib/useCases";

/**
 * Customer-facing robot tags. A tag is any `RobotModel.useCase` value carried by
 * at least one listable model, so tagging a model in the admin catalog (and
 * marking it listable) is all it takes for the tag to appear on the home page
 * and on `/services`. Tags are read live from the database, never hard-coded.
 */
export type RobotTagModel = {
  id: string;
  brand: string;
  model: string;
  imageUrl: string | null;
  priceDaily: number | null;
};

export type RobotTag = {
  tag: string;
  slug: string;
  models: RobotTagModel[];
  fromPrice: number | null;
  coverImage: string | null;
};

export function robotTagSlug(tag: string) {
  return tag
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Editorial copy for the tags in the admin picker. Tags added later fall back
// to a generic line built from the tag name.
const TAG_COPY: Record<string, string> = {
  Performance:
    "Robots that dance, perform and entertain on stage, at launches and at private celebrations.",
  Guide:
    "Robots that greet visitors, answer questions and lead tours through venues, stores and campuses.",
  Patrol:
    "Robots that walk routes, monitor spaces and report what they see across sites and facilities.",
  Cleaning:
    "Robots that keep floors and public areas clean in hotels, malls, offices and warehouses.",
  Delivery:
    "Robots that carry food, parcels and supplies between tables, rooms and floors.",
  "Live streaming":
    "Robots that host and appear in live broadcasts, product streams and online events.",
};

export function robotTagDescription(tag: string) {
  return (
    TAG_COPY[tag] ??
    `Robots tagged for ${tag.toLowerCase()} work, available as Hifivebot service packages.`
  );
}

function byPickerOrder(a: string, b: string) {
  const order = USE_CASES as readonly string[];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  }
  return a.localeCompare(b);
}

export async function getRobotTags(): Promise<RobotTag[]> {
  const models = await prisma.robotModel.findMany({
    where: { listable: true, NOT: { useCase: { isEmpty: true } } },
    orderBy: [{ brand: "asc" }, { model: "asc" }],
    select: {
      id: true,
      brand: true,
      model: true,
      imageUrl: true,
      priceDaily: true,
      useCase: true,
    },
  });

  const grouped = new Map<string, RobotTagModel[]>();
  for (const { useCase, ...model } of models) {
    for (const raw of useCase) {
      const tag = raw.trim();
      if (!tag) continue;
      const list = grouped.get(tag) ?? [];
      list.push(model);
      grouped.set(tag, list);
    }
  }

  return Array.from(grouped.keys())
    .sort(byPickerOrder)
    .map((tag) => {
      const tagModels = grouped.get(tag)!;
      // Models with photography lead, so cards and slides open on a real robot.
      tagModels.sort((a, b) => Number(!a.imageUrl) - Number(!b.imageUrl));
      const prices = tagModels
        .map((m) => m.priceDaily)
        .filter((p): p is number => typeof p === "number" && p > 0);
      return {
        tag,
        slug: robotTagSlug(tag),
        models: tagModels,
        fromPrice: prices.length ? Math.min(...prices) : null,
        coverImage: tagModels.find((m) => m.imageUrl)?.imageUrl ?? null,
      };
    });
}

export async function getRobotTag(slug: string) {
  const tags = await getRobotTags();
  return tags.find((t) => t.slug === slug) ?? null;
}
