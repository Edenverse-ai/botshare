import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;
export function registryDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const url = env.REGISTRY_DATABASE_URL;
  if (
    !url ||
    !["development", "test", "staging", "production"].includes(
      env.REGISTRY_ENVIRONMENT || "",
    )
  ) {
    throw new Error(
      "Explicit registry database and environment configuration required.",
    );
  }
  if (env.REGISTRY_ENVIRONMENT === "staging") {
    const target = new URL(url);
    if (
      !/^registry_preview_[a-z0-9_]+$/.test(
        target.searchParams.get("schema") || "",
      )
    ) {
      throw new Error(
        "Staging registry requires an isolated registry_preview_ schema.",
      );
    }
  } else if (env.REGISTRY_ENVIRONMENT !== "production") {
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
  return url;
}

export function registryDatabase() {
  const url = registryDatabaseUrl();
  client ||= new PrismaClient({ datasources: { db: { url } } });
  return client;
}
