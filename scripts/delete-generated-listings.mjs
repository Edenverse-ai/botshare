/**
 * delete-generated-listings.mjs — remove the 144 batch-generated catalog
 * listings, keeping the hand-built ones.
 *
 * The catalog was padded by two script runs: 29 titles replicated across six
 * metros, none bound to a robot model. They advertise capacity that no
 * physical robot backs, which is what the registered-robot requirement exists
 * to prevent. The five hand-built listings (all bound to a model) stay and are
 * the first candidates for a robotAssetId backfill.
 *
 * Deleting a Listing cascades to its Reservations, so the script refuses to
 * touch any row that has one. It exports everything it is about to delete
 * first, and it refuses to run at all if the match count is not what this
 * ticket surveyed.
 *
 * Dry run (default):  node scripts/delete-generated-listings.mjs
 * Execute:            node scripts/delete-generated-listings.mjs --confirm
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The two generation runs, by UTC date. Anything created outside these days was
// made by hand and is not in scope.
const GENERATED_ON = ["2026-04-23", "2026-08-20"];
const EXPECTED_COUNT = 144;

const confirm = process.argv.includes("--confirm");
const exportPath = resolve("scripts/.deleted-generated-listings.json");

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const all = await prisma.listing.findMany({
    include: { _count: { select: { reservations: true, favoritedBy: true } } },
  });

  // Generated rows carry no robotModelId; that plus the creation day is what
  // separates them from the hand-built five.
  const doomed = all.filter(
    (l) => GENERATED_ON.includes(utcDay(l.createdAt)) && l.robotModelId === null
  );

  console.log(`listings in catalog      = ${all.length}`);
  console.log(`matched for deletion     = ${doomed.length} (expected ${EXPECTED_COUNT})`);

  if (doomed.length !== EXPECTED_COUNT) {
    throw new Error(
      `Refusing to run: matched ${doomed.length} rows, expected ${EXPECTED_COUNT}. ` +
        `The catalog is not in the state this script was written for.`
    );
  }

  // A cascade would take the reservation with it, so a matched row that has one
  // means the survey was wrong and a human should look.
  const withReservations = doomed.filter((l) => l._count.reservations > 0);
  if (withReservations.length > 0) {
    throw new Error(
      `Refusing to run: ${withReservations.length} matched listing(s) have reservations, ` +
        `which deleting would destroy: ${withReservations.map((l) => l.id).join(", ")}`
    );
  }

  const favourited = doomed.reduce((n, l) => n + l._count.favoritedBy, 0);
  console.log(`favourites that go too   = ${favourited}`);
  console.log(`keeping                  = ${all.length - doomed.length}`);

  mkdirSync(dirname(exportPath), { recursive: true });
  writeFileSync(exportPath, JSON.stringify(doomed, null, 2));
  console.log(`exported                 → ${exportPath}`);

  if (!confirm) {
    console.log("\nDry run. Nothing deleted. Add --confirm to delete.");
    return;
  }

  const { count } = await prisma.listing.deleteMany({
    where: { id: { in: doomed.map((l) => l.id) } },
  });
  console.log(`\ndeleted                  = ${count}`);
  console.log(`catalog now              = ${await prisma.listing.count()}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
