/**
 * deploy.mjs — Netlify deploy commands that work the same on macOS and Windows.
 *
 *   node scripts/deploy.mjs status [--table]   # recent deploys (JSON by default)
 *   node scripts/deploy.mjs build [--wait]     # trigger a CI build of main; preview only
 *   node scripts/deploy.mjs logs               # stream the log of a build in progress
 *   node scripts/deploy.mjs local              # macOS/Linux escape hatch, see below
 *
 * Publishing stays in promote-deploy.mjs (`deploy:promote` / `deploy:rollback`).
 */
import { spawnSync } from "node:child_process";
import { DEPLOY_URL_SUFFIX, getDeploy, getSite, listDeploys, netlify, SITE_ID } from "./netlify-api.mjs";

const [command, ...args] = process.argv.slice(2);

// The CLI is still needed for log streaming and local builds. On Windows `npx`
// is a .cmd shim, which spawnSync only finds through a shell.
function netlifyCli(cliArgs) {
  const env = { ...process.env };
  for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) delete env[k];
  const result = spawnSync("npx", ["netlify", ...cliArgs], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function status() {
  const deploys = await listDeploys(10);
  if (!args.includes("--table")) {
    console.log(JSON.stringify(deploys, null, 2));
    return;
  }
  const liveId = (await getSite()).published_deploy?.id;
  for (const d of deploys) {
    console.log(
      [
        d.id === liveId ? "LIVE" : "    ",
        d.id,
        d.state.padEnd(10),
        d.context.padEnd(14),
        (d.commit_ref || "no-commit").slice(0, 8),
        d.created_at,
        d.error_message ? `— ${d.error_message.split("\n")[0].slice(0, 80)}` : "",
      ].join("  ")
    );
  }
}

async function build() {
  const created = await netlify("POST", `/sites/${SITE_ID}/builds`, { clear_cache: false });
  console.log(`build ${created.id} -> deploy ${created.deploy_id}`);
  console.log(`preview: https://${created.deploy_id}${DEPLOY_URL_SUFFIX}`);
  if (!args.includes("--wait")) return;
  for (;;) {
    await sleep(15000);
    const d = await getDeploy(created.deploy_id);
    console.log(`${new Date().toISOString().slice(11, 19)} ${d.state}`);
    if (d.state === "ready") {
      console.log(`ready — check, then publish: npm run deploy:promote -- ${d.id} --confirm`);
      return;
    }
    if (d.state === "error" || d.state === "rejected") {
      console.error(d.error_message || "build failed");
      process.exit(1);
    }
  }
}

// Escape hatch for when Netlify CI is unavailable. Unlike the old script it never
// publishes: the upload becomes an unpublished preview that still has to pass
// deploy:promote's preflight. Windows is refused outright — a Windows build bakes
// C:\ paths into the server bundle and every page 500s on the Linux function.
function local() {
  if (process.platform === "win32") {
    console.error(
      "deploy:local is not supported on Windows: the build embeds Windows paths and\n" +
        "every page returns 500 on Netlify. Push to main and use deploy:build instead."
    );
    process.exit(1);
  }
  netlifyCli(["build", "--context", "production"]);
  netlifyCli(["deploy", "--no-build", "--site", SITE_ID, "--message", "local build (deploy:local)"]);
  console.log("Uploaded as an unpublished preview. Check it, then: npm run deploy:promote -- <deploy_id> --confirm");
}

const commands = { status, build, local, logs: () => netlifyCli(["logs:deploy"]) };
if (!commands[command]) {
  console.error(`usage: node scripts/deploy.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
await commands[command]();
