import { spawn, spawnSync } from "node:child_process";
import { localRegistryEnvironment } from "./registry-local-env.mjs";

const env = localRegistryEnvironment();
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status || 1);
}
run("docker", ["compose", "-f", "compose.registry.yml", "up", "-d", "--wait"]);
run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"]);
run("npx", [
  "prisma",
  "db",
  "execute",
  "--file",
  "scripts/registry-local-baseline.sql",
  "--schema",
  "prisma/schema.prisma",
]);
run("npx", ["tsx", "scripts/registry-seed.ts"]);
if (process.argv.includes("--prepare-only")) process.exit(0);
console.log(
  "Local registry: http://localhost:3100/admin/robots (isolated development data)",
);
const server = spawn("npx", ["next", "dev", "-p", "3100", "-H", "127.0.0.1"], {
  stdio: "inherit",
  env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
