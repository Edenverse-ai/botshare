// Next 13's App Router traces retain optional native packages for every OS.
// Trim only non-Linux build-host packages before the Netlify adapter copies them.
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const localOnly =
  /node_modules\/(?:@img\/(?:sharp(?:-libvips)?-darwin-[^/]+|sharp-wasm32)\/|\.prisma\/client\/[^/]*darwin)/;
let removed = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(path, "utf8"));
      const files = trace.files.filter((file) => !localOnly.test(file));
      removed += trace.files.length - files.length;
      if (files.length !== trace.files.length)
        await writeFile(path, JSON.stringify({ ...trace, files }));
    }
  }
}
await visit(".next");
// Next has already materialized standalone before this script runs. Netlify
// copies that tree, so prune the same files there without touching node_modules
// used by local development or removing either required Linux Prisma engine.
async function pruneStandalone(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (localOnly.test(path)) await rm(path, { recursive: true, force: true });
    else if (entry.isDirectory()) await pruneStandalone(path);
  }
}
await pruneStandalone(".next/standalone");
console.log(
  `[registry-native] Removed ${removed} local-only native trace references; Linux dependencies retained.`,
);
