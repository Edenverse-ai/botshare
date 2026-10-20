/**
 * Publish the curated X2 scenario cuts to Cloudinary under
 * `scenarios/<category-slug>/<shot>`.
 *
 * Cloudinary pulls each file from the public asset repo itself, so nothing
 * large travels from this machine — a local VPN/proxy tunnel resets multipart
 * uploads of this size (see CLAUDE.md deployment gotcha 6), and remote-URL
 * ingest sidesteps that entirely.
 *
 * Idempotent: a shot already on Cloudinary is skipped unless --force.
 *   node scripts/upload-x2-videos.mjs [--force] [--only=<slug-substring>]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

const env = Object.fromEntries(
  (await readFile(path.join(ROOT, ".env"), "utf8"))
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const CLOUD = env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const AUTH = `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`;
if (!CLOUD || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
  throw new Error("Cloudinary credentials missing from .env");
}

const basic = "Basic " + Buffer.from(AUTH).toString("base64");

const alreadyUploaded = async (publicId) =>
  (await fetch(`https://res.cloudinary.com/${CLOUD}/video/upload/${publicId}.mp4`, { method: "HEAD" })).ok;

const { sourceBase, shots } = JSON.parse(
  await readFile(path.join(ROOT, "scripts", "x2-video-manifest.json"), "utf8")
);
const queue = ONLY ? shots.filter((s) => s.slug.includes(ONLY)) : shots;
console.log(`${queue.length} shot(s) -> cloudinary/${CLOUD}\n`);

const results = [];
for (const [i, shot] of queue.entries()) {
  const publicId = `scenarios/${shot.slug}`;
  const tag = `[${String(i + 1).padStart(2, "0")}/${queue.length}] ${publicId}`;

  if (!FORCE && (await alreadyUploaded(publicId))) {
    console.log(`${tag} — present, skipped`);
    results.push({ ...shot, publicId, status: "skipped" });
    continue;
  }

  process.stdout.write(`${tag} — ingesting… `);
  const body = new URLSearchParams({
    file: sourceBase + encodeURIComponent(shot.file),
    public_id: publicId,
    overwrite: "true",
  });

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.log(`FAILED — ${json?.error?.message ?? res.status}`);
    results.push({ ...shot, publicId, status: "failed", error: json?.error?.message });
    continue;
  }
  console.log(`${json.width}x${json.height}, ${json.duration?.toFixed(1)}s, ${(json.bytes / 1048576).toFixed(1)} MB`);
  results.push({
    ...shot,
    publicId,
    status: "uploaded",
    width: json.width,
    height: json.height,
    duration: json.duration,
    bytes: json.bytes,
  });
}

await writeFile(
  path.join(ROOT, "scripts", "x2-video-upload-report.json"),
  JSON.stringify(results, null, 2) + "\n"
);

const tally = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
console.log("\n" + JSON.stringify(tally));
const failed = results.filter((r) => r.status === "failed");
if (failed.length) {
  failed.forEach((f) => console.log(`  ${f.slug} — ${f.error}`));
  process.exitCode = 1;
}
