import { existsSync, readFileSync } from "node:fs";

export function localRegistryEnvironment() {
  const env = { ...process.env };
  // Set local dotenv keys to empty before Next.js loads them, so a missing
  // local configuration cannot inherit production payment/storage/email keys.
  for (const file of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
  ]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const key = line.match(
        /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
      )?.[1];
      if (key) env[key] = "";
    }
  }
  const url =
    "postgresql://registry:registry_local_only@127.0.0.1:55439/botshare_registry_dev";
  return {
    ...env,
    DATABASE_URL: url,
    DIRECT_URL: url,
    REGISTRY_DATABASE_URL: url,
    REGISTRY_ENVIRONMENT: "development",
    REGISTRY_PUBLIC_ORIGIN: "http://localhost:3100",
    NEXTAUTH_URL: "http://localhost:3100",
    NEXTAUTH_SECRET: "registry-development-only-do-not-use-in-production",
    ADMIN_EMAILS: "admin@registry.test",
    DB_MIGRATION_READ_ONLY: "false",
    STRIPE_SECRET_KEY: "sk_test_registry_disabled",
    RESEND_API_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_ACCESS_TOKEN: "",
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",
    CLOUDINARY_URL: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
