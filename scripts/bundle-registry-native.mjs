// Local Netlify builds run on macOS, while deployed functions run on Linux x64.
// Retain the local Sharp packages and add its exact pinned Linux optional packages.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const sharp = JSON.parse(
  readFileSync("node_modules/sharp/package.json", "utf8"),
);
for (const name of ["@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"]) {
  const version = sharp.optionalDependencies[name];
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
    throw new Error(
      `Expected an exact Sharp optional dependency version: ${name}`,
    );
  }
  const destination = join("node_modules", name);
  const manifest = join(destination, "package.json");
  if (
    existsSync(manifest) &&
    JSON.parse(readFileSync(manifest, "utf8")).version === version
  )
    continue;
  const temporary = mkdtempSync(join(tmpdir(), "registry-native-"));
  try {
    const output = execFileSync(
      "npm",
      [
        "pack",
        `${name}@${version}`,
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        temporary,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const [{ filename }] = JSON.parse(output);
    if (filename.includes("/") || !filename.endsWith(".tgz"))
      throw new Error("Unexpected package archive name");
    mkdirSync(destination, { recursive: true });
    execFileSync("tar", [
      "-xzf",
      join(temporary, filename),
      "--strip-components=1",
      "-C",
      destination,
    ]);
    if (JSON.parse(readFileSync(manifest, "utf8")).version !== version)
      throw new Error("Native package version mismatch");
    console.log(`[registry-native] Staged ${name}@${version}`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
console.log("[registry-native] Linux image-validation dependencies ready.");
