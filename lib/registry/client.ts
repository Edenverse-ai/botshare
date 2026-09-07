import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;
export function registryDatabase() {
  const url = process.env.REGISTRY_DATABASE_URL;
  if (
    !url ||
    !["development", "test", "production"].includes(
      process.env.REGISTRY_ENVIRONMENT || "",
    )
  ) {
    throw new Error(
      "Explicit registry database and environment configuration required.",
    );
  }
  if (process.env.REGISTRY_ENVIRONMENT !== "production") {
    const target = new URL(url);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
      (!target.pathname.startsWith("/botshare_registry_") &&
        !target.pathname.startsWith("/registry_test_"))
    ) {
      throw new Error(
        "Nonproduction registry must use an isolated local registry database.",
      );
    }
  }
  client ||= new PrismaClient({ datasources: { db: { url } } });
  return client;
}
