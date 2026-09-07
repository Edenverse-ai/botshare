// Disposable databases on our loopback-only Docker service; never load .env.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const compose = ["compose", "-f", "compose.registry.yml"];
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
}
run("docker", [...compose, "up", "-d", "--wait"]);
const database = `registry_test_${randomBytes(8).toString("hex")}`;
const url = `postgresql://registry:registry_local_only@127.0.0.1:55439/${database}`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  REGISTRY_DATABASE_URL: url,
  REGISTRY_ENVIRONMENT: "test",
  ADMIN_EMAILS: "admin@registry.test",
  DB_MIGRATION_READ_ONLY: "false",
};
run("docker", [
  ...compose,
  "exec",
  "-T",
  "registry-db",
  "createdb",
  "-U",
  "registry",
  database,
]);
try {
  run("npx", ["prisma", "migrate", "deploy"], env);
  run(
    "npx",
    [
      "prisma",
      "db",
      "execute",
      "--file",
      "scripts/registry-local-baseline.sql",
      "--schema",
      "prisma/schema.prisma",
    ],
    env,
  );
  run(
    "npx",
    [
      "vitest",
      "run",
      "--pool=threads",
      ...(process.argv.slice(2).length
        ? process.argv.slice(2)
        : ["lib/registry/registry.integration.test.ts"]),
    ],
    env,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  run("docker", [
    ...compose,
    "exec",
    "-T",
    "registry-db",
    "dropdb",
    "-U",
    "registry",
    "--force",
    database,
  ]);
}
