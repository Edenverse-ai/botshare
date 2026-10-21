/**
 * add-ff-models.mjs — add Faraday Future's FF / FX robot models to the catalog.
 *
 * Faraday Future is a robot owner on the platform; these are its own models,
 * sold under its FF (premium) and FX sub-brands. They are standalone catalog
 * entries with no mapping to other manufacturers' hardware, and customer-facing
 * pages must show only these names. Prices come from FF's rate card
 * (RoboShare_Price_List_1008): priceDaily = the 1-day price, priceMonthly = the
 * 3-month-commitment monthly price. The full tiered rate card lands separately.
 *
 * Only touches these seven slugs (upsert), so it is safe to rerun.
 *   node scripts/add-ff-models.mjs --target staging      # isolated registry schema (.env.local)
 *   node scripts/add-ff-models.mjs --target production   # live catalog (.env DATABASE_URL)
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { FF_MODELS } from "./ff-models.mjs";

function envValue(file, key) {
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^"|"$/g, "");
}

async function main() {
  const target = process.argv[process.argv.indexOf("--target") + 1];
  let url;
  if (target === "staging") {
    url = envValue(".env.local", "REGISTRY_DATABASE_URL");
    if (!/schema=registry_preview_/.test(url || "")) {
      throw new Error("staging needs REGISTRY_DATABASE_URL with a registry_preview_ schema in .env.local");
    }
  } else if (target === "production") {
    url = envValue(".env", "DATABASE_URL");
  } else {
    throw new Error("usage: node scripts/add-ff-models.mjs --target staging|production");
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const [slug, brand, model, tag, msrp, day, month, useCase, listable] of FF_MODELS) {
      const kind = tag === "humanoid" ? "humanoid" : "quadruped";
      const common = {
        brand,
        model,
        productName: `${brand} ${model}`,
        msrp,
        priceDaily: day,
        priceMonthly: month,
        useCase,
        listable,
        serviceCategory: useCase[0], // vestigial, keep non-null (as curate-listable-models.mjs)
        capabilityTag: tag,
      };
      await prisma.robotModel.upsert({
        where: { slug },
        update: common,
        create: {
          slug,
          ...common,
          description: `${brand} ${kind} robot · pricing per the ${brand} rate card.`,
        },
      });
      console.log(`  ✓ ${slug}${listable ? " (listable)" : ""}`);
    }
    const rows = await prisma.robotModel.findMany({
      where: { slug: { in: FF_MODELS.map(([slug]) => slug) } },
      select: { slug: true, listable: true },
    });
    console.log(`${target}: ${rows.length} FF/FX models, ${rows.filter((r) => r.listable).length} listable`);
    if (rows.length !== FF_MODELS.length) throw new Error("not every FF/FX model was written");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
