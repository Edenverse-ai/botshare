import { PrismaClient } from "@prisma/client";

/**
 * The isolated local development database from compose.registry.yml. Hard-coded
 * so a stray DATABASE_URL in the shell (the repo's .env points at PRODUCTION)
 * can never be used by the auth tests.
 */
const LOCAL_URL =
  "postgresql://registry:registry_local_only@127.0.0.1:55439/botshare_registry_dev";

export const db = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });

/** Unique address per test run so reruns never collide. */
export function freshEmail(tag: string): string {
  return `authtest-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

export const GOOD_PASSWORD = "Robots2026";
