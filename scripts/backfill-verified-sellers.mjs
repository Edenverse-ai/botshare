/**
 * backfill-verified-sellers.mjs — mark Hifivebot's own accounts as verified.
 *
 * `User.verified` was dead until now: a badge with no writer, so every account
 * has read "Pending verification" since it shipped. Activating it as the gate
 * on creating a service would otherwise lock out the platform's own accounts,
 * which have been selling all along.
 *
 * Only Hifivebot's accounts are backfilled. External sellers go through the
 * review, which is the entire point of turning the flag on.
 *
 * Dry run (default):  node scripts/backfill-verified-sellers.mjs
 * Execute:            node scripts/backfill-verified-sellers.mjs --confirm
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATFORM_ACCOUNTS = [
  "info@usrobotx.com",
  "sam@usrobotx.com",
  "tech@hifivebot.com",
];

const confirm = process.argv.includes("--confirm");

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: PLATFORM_ACCOUNTS, mode: "insensitive" } },
    select: { id: true, email: true, verified: true },
  });

  const missing = PLATFORM_ACCOUNTS.filter(
    (email) => !users.some((u) => u.email?.toLowerCase() === email)
  );
  for (const email of missing) {
    console.log(`  not found, skipping: ${email}`);
  }

  const toVerify = users.filter((u) => !u.verified);
  for (const u of users) {
    console.log(`  ${u.verified ? "already verified" : "will verify     "}  ${u.email}`);
  }

  if (!confirm) {
    console.log(`\nDry run. ${toVerify.length} account(s) would change. Add --confirm.`);
    return;
  }

  const { count } = await prisma.user.updateMany({
    where: { id: { in: toVerify.map((u) => u.id) } },
    data: { verified: true },
  });
  console.log(`\nverified = ${count}`);

  const stillUnverified = await prisma.user.count({
    where: { userType: "PROVIDER", verified: false },
  });
  console.log(`providers still unverified = ${stillUnverified} (expected: the external ones)`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
