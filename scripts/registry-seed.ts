import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createRegistryHandler } from "../lib/registry/http";

async function seed() {
  const url = process.env.REGISTRY_DATABASE_URL || "";
  if (
    url !==
      "postgresql://registry:registry_local_only@127.0.0.1:55439/botshare_registry_dev" ||
    process.env.REGISTRY_ENVIRONMENT !== "development"
  )
    throw new Error(
      "Seed is restricted to the isolated local development database.",
    );
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const role of ["admin", "customer", "provider"]) {
      await db.user.upsert({
        where: { email: `${role}@registry.test` },
        update: {},
        create: {
          email: `${role}@registry.test`,
          name: `Registry test ${role}`,
          userType: role === "provider" ? "PROVIDER" : "CUSTOMER",
          hashedPassword: await bcrypt.hash("Registry-local-demo-2026!", 10),
          emailVerified: new Date(),
        },
      });
    }
    const model = await db.robotModel.upsert({
      where: { slug: "registry-demo-agibot-x2" },
      update: {},
      create: {
        slug: "registry-demo-agibot-x2",
        brand: "AGIBOT",
        model: "X2",
        productName: "AGIBOT X2 (local demo)",
        description: "Isolated development catalog entry",
        useCase: [],
        serviceCategory: "Entertainment",
        capabilityTag: "humanoid",
      },
    });
    const admin = await db.user.findUniqueOrThrow({
      where: { email: "admin@registry.test" },
    });
    const api = createRegistryHandler({ db, actor: async () => admin });
    for (let number = 1; number <= 3; number++) {
      const response = await api(
        new Request("http://localhost/api/registry/robots", {
          method: "POST",
          headers: {
            "Idempotency-Key": `local-draft-${number}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            modelId: model.id,
            ownerName: "Hifivebot",
            notes: `TEST DRAFT ${number} — placeholder, real serial and evidence not supplied.`,
          }),
        }),
      );
      if (!response.ok)
        throw new Error(`Draft seed failed (${response.status})`);
    }
    console.log(
      "Three local draft placeholders ready. Test login: admin@registry.test / Registry-local-demo-2026!",
    );
  } finally {
    await db.$disconnect();
  }
}
seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
