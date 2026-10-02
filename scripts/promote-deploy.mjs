/**
 * promote-deploy.mjs — publish an already-built Netlify deploy to production.
 *
 * Auto-publishing is deliberately OFF for this site: the published deploy is kept
 * "locked", so every CI build finishes as a ready-but-unpublished deploy with its own
 * URL. That makes each push to main a preview, and makes going live an explicit act.
 * This script is that act. It publishes an existing build — it never builds — so it is
 * instant, costs no build minutes, and uploads nothing over the local network.
 *
 * Usage (checks only unless --confirm is given):
 *   node scripts/promote-deploy.mjs                        # preflight newest ready production deploy
 *   node scripts/promote-deploy.mjs --confirm              # ...and publish it
 *   node scripts/promote-deploy.mjs <deploy_id> --confirm  # publish a specific deploy
 *   node scripts/promote-deploy.mjs --rollback --confirm   # republish the previously published deploy
 *
 * Publishing is opt-in so that a lost flag fails safe: PowerShell drops a bare `--`,
 * after which npm swallows the flags meant for this script. Without --confirm the
 * script only reports and preflights.
 *
 * Preflight before publishing: the target must be `ready`, serve 200 on its own deploy
 * URL, and render real DB rows. That last check is the one that matters — the recurring
 * failure on this repo is a function bundled without the Prisma rhel query engine, which
 * builds and serves HTML fine but throws on every DB query. See CLAUDE.md.
 */
import { DEPLOY_URL_SUFFIX, getSite, listDeploys, netlify, SITE_ID } from "./netlify-api.mjs";

// A route that must hit the database. If Prisma's engine is missing this 500s.
// `/services` lists robot tags from the catalog, but probe a scenario page too —
// it queries listings for its category on every request.
const DB_ROUTE = "/services/entertainment";
// getListings() dedupes the public catalog by title, so a category renders one
// row per distinct package (3-4 today). A missing query engine renders zero, so
// any non-trivial count still proves the database answered.
const MIN_DB_IDS = 3;

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  return { status: res.status, body: await res.text() };
}

const args = process.argv.slice(2);
const dryRun = !args.includes("--confirm");
const rollback = args.includes("--rollback");
const explicitId = args.find((a) => !a.startsWith("--"));

const SITE = SITE_ID;
const deploys = await listDeploys(25);
// Ask the site which deploy is live. `published_at` stays set on every deploy that
// was ever published, so after a rollback the newest such deploy is not the live one.
const liveId = (await getSite()).published_deploy?.id;
const published = deploys.find((d) => d.id === liveId) ?? null;

if (!published) throw new Error("no currently published deploy found — refusing to act blind");

let target;
if (rollback) {
  // The most recently published deploy other than the live one.
  target = deploys
    .filter((d) => d.id !== published.id && d.published_at && d.state === "ready")
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
  if (!target) throw new Error("no earlier published deploy to roll back to");
} else if (explicitId) {
  target = deploys.find((d) => d.id === explicitId);
  if (!target) throw new Error(`deploy ${explicitId} not in the last 25 deploys`);
} else {
  // Only builds newer than the live one; anything older is a rollback, which must
  // be asked for explicitly (--rollback or a deploy id).
  target = deploys.find(
    (d) =>
      d.state === "ready" &&
      d.context === "production" &&
      d.id !== published.id &&
      Date.parse(d.created_at) > Date.parse(published.created_at)
  );
  if (!target) throw new Error("no ready production deploy newer than the live one to promote");
}

const short = (d) =>
  `${d.id}  ${d.state}  ${d.context}  ${(d.commit_ref || "no-commit").slice(0, 8)}  ${d.created_at}`;

console.log(`site:      ${SITE}`);
console.log(`published: ${short(published)}`);
console.log(`target:    ${short(target)}`);
console.log(`title:     ${(target.title || "").split("\n")[0]}`);

if (target.id === published.id) {
  console.log("\nTarget is already published. Nothing to do.");
  process.exit(0);
}
if (target.state !== "ready") {
  console.error(`\nABORT: target state is '${target.state}', not 'ready'.`);
  process.exit(1);
}

// --- preflight on the target's own URL, before it is anywhere near production ---
const base = `https://${target.id}${DEPLOY_URL_SUFFIX}`;
console.log(`\npreflight ${base}`);

const home = await get(`${base}/`);
console.log(`  /            ${home.status}`);
if (home.status !== 200) {
  console.error("ABORT: home page did not return 200.");
  process.exit(1);
}

const db = await get(`${base}${DB_ROUTE}`);
const ids = new Set(db.body.match(/\\"id\\":\\"[a-z0-9]{15,}/g) || []);
console.log(`  ${DB_ROUTE.padEnd(12)} ${db.status}  (${ids.size} db ids)`);
if (db.status !== 200 || db.body.includes("Query engine library")) {
  console.error(
    "\nABORT: DB-backed route failed. The function is very likely missing the Prisma\n" +
      "rhel query engine. Do NOT publish. See CLAUDE.md 'Deployment gotchas'."
  );
  process.exit(1);
}
if (ids.size < MIN_DB_IDS) {
  console.error(
    `\nABORT: only ${ids.size} db ids rendered (expected >= ${MIN_DB_IDS}). The page loads but\n` +
      "the database is not answering. Do NOT publish."
  );
  process.exit(1);
}

if (dryRun) {
  console.log("\nPreflight passed, nothing changed. Add --confirm to publish this deploy.");
  process.exit(0);
}

// --- promote: unlock old, publish target, re-lock so auto-publishing stays off ---
console.log("\npromoting...");
await netlify("POST", `/deploys/${published.id}/unlock`);
await netlify("POST", `/sites/${SITE}/deploys/${target.id}/restore`);
await netlify("POST", `/deploys/${target.id}/lock`);

const site = await getSite();
const now = site.published_deploy || {};
console.log(`published: ${now.id}  locked: ${now.locked}`);

if (now.id !== target.id) {
  console.error("ABORT: published deploy is not the target. Check the Netlify dashboard.");
  process.exit(1);
}
if (!now.locked) {
  console.error("WARNING: deploy is NOT locked — auto-publishing is live. Re-lock it.");
  process.exit(1);
}

const prod = await get("https://hifivebot.com/");
console.log(`\nhttps://hifivebot.com/  ${prod.status}`);
console.log(`\nrollback: npm run deploy:rollback -- --confirm   (returns to ${published.id})`);
