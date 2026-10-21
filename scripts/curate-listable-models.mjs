/**
 * curate-listable-models.mjs — set prices, use cases, labels, and the `listable`
 * flag for the 13 robots a provider can list. Idempotent (upsert by slug).
 * Faraday Future's FF / FX models (scripts/ff-models.mjs, written by
 * add-ff-models.mjs) are re-listed after the reset rather than curated here.
 * Run: node scripts/curate-listable-models.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { FF_MODELS } from "./ff-models.mjs";

const prisma = new PrismaClient();

// slug, label, brand, model, hr, day, month, useCase[], capabilityTag, msrp, isNew
const MODELS = [
  ["unitree-g1-edu", "G1 Edu", "Unitree", "G1 Edu", 930, 1500, 700, ["Performance"], "humanoid", 43900, true],
  ["agibot-a2-edu", "A2 Edu", "Agibot", "A2 Edu", 690, 1000, 3500, ["Guide"], "reception", null, true],
  ["agibot-a3", "A3", "Agibot", "A3", 950, 1500, 5000, ["Performance"], "humanoid", null, true],
  ["agibot-a2-ultra", "A2 Ultra", "Agibot", "A2 Ultra", 1250, 2000, 3000, ["Guide"], "humanoid", null, false],
  ["agibot-x2-ultra", "X2 Ultra", "Agibot", "X2 Ultra", 625, 900, 2000, ["Guide"], "humanoid", null, false],
  ["unitree-a2-standard", "Unitree A2", "Unitree", "A2 Standard", 800, 1400, 3000, ["Patrol"], "quadruped", null, false],
  ["unitree-go2-edu-u2", "Go2 Edu U2", "Unitree", "Go2 EDU-U2", 340, 650, 1500, ["Performance"], "quadruped", null, false],
  ["agibot-d1-ultra", "D1 Ultra", "Agibot", "D1 Ultra", 250, 460, 750, ["Patrol"], "quadruped", null, false],
  ["agibot-d1-edu", "D1 Edu", "Agibot", "D1 EDU", 94, 160, 650, ["Guide"], "education", null, false],
  ["agibot-c5", "C5", "Agibot", "C5", 200, 400, 2000, ["Cleaning"], "cleaning", null, true],
  ["pudu-mt1", "Pudu MT1", "Pudu", "MT1", 475, 900, 2000, ["Cleaning"], "cleaning", null, false],
  ["unitree-r1-edu", "R1 Edu", "Unitree", "R1 Edu", 390, 750, null, ["Performance", "Guide"], "humanoid", 15950, true],
  ["unitree-go2-pro", "Go2 Pro", "Unitree", "Go2 Pro", 95, 160, null, ["Performance", "Patrol"], "quadruped", null, false],
];

// For consolidated rows, pull image/description from an existing "standard" variant.
const VARIANT_SOURCE = {
  "unitree-g1-edu": "G1 Edu Standard",
  "unitree-r1-edu": "R1 Edu standard",
};

async function main() {
  // 1. Reset: nothing is listable unless in the curated set.
  await prisma.robotModel.updateMany({ data: { listable: false } });

  for (const [slug, label, brand, model, hr, day, month, useCase, tag, msrp, isNew] of MODELS) {
    let imageUrl = null;
    let description = `${label} — available for ${useCase.join(" and ").toLowerCase()} deployments.`;
    if (isNew && VARIANT_SOURCE[slug]) {
      const src = await prisma.robotModel.findFirst({
        where: { productName: VARIANT_SOURCE[slug] },
        select: { imageUrl: true, description: true },
      });
      if (src) {
        imageUrl = src.imageUrl;
        if (src.description) description = src.description;
      }
    }

    const common = {
      brand,
      model,
      productName: label,
      priceHourly: hr,
      priceDaily: day,
      priceMonthly: month,
      useCase,
      listable: true,
      serviceCategory: useCase[0], // vestigial, keep non-null
      capabilityTag: tag,
    };

    await prisma.robotModel.upsert({
      where: { slug },
      update: common,
      create: {
        slug,
        ...common,
        description,
        msrp,
        ...(imageUrl ? { imageUrl } : {}),
      },
    });
    console.log(`  ✓ ${slug} (listable)`);
  }

  // 2. Faraday Future's own models keep the listable flag their rate card sets.
  const ffListable = FF_MODELS.filter((m) => m.at(-1)).map(([slug]) => slug);
  await prisma.robotModel.updateMany({ where: { slug: { in: ffListable } }, data: { listable: true } });

  const expected = MODELS.length + ffListable.length;
  const count = await prisma.robotModel.count({ where: { listable: true } });
  console.log(`listable RobotModel count = ${count}`);
  if (count !== expected) throw new Error(`Expected ${expected} listable models, got ${count}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
