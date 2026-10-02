/**
 * netlify-api.mjs — minimal Netlify REST client shared by the deploy scripts.
 *
 * Calls api.netlify.com directly with Node's fetch instead of shelling out to
 * `npx netlify api ...`. That keeps the deploy commands identical on macOS and
 * Windows (no `env -u`, no shell-quoted JSON, no `npx` spawn lookup), and Node's
 * fetch ignores HTTP(S)_PROXY, so the local VPN/proxy problem in CLAUDE.md
 * gotcha 6 does not apply.
 *
 * Auth reuses the Netlify CLI login: run `npx netlify login` once per machine.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SITE_ID = "79afde94-abbe-422c-ba4c-f68ab0100e62";
export const DEPLOY_URL_SUFFIX = "--hifivebot-com.netlify.app";
const API = "https://api.netlify.com/api/v1";

// Where `netlify login` stores its token on each OS (env-paths "netlify" config dir).
function cliConfigPath() {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "netlify", "Config", "config.json");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Preferences", "netlify", "config.json");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "netlify", "config.json");
}

function token() {
  // Older CLI versions kept the login in ~/.netlify/config.json.
  const legacy = join(homedir(), ".netlify", "config.json");
  const path = existsSync(cliConfigPath()) ? cliConfigPath() : legacy;
  if (!existsSync(path)) {
    throw new Error("Not logged in to Netlify. Run `npx netlify login` first.");
  }
  const config = JSON.parse(readFileSync(path, "utf8"));
  const user = config.users?.[config.userId];
  const value = user?.auth?.token;
  if (!value) {
    throw new Error("Not logged in to Netlify. Run `npx netlify login` first.");
  }
  return value;
}

export async function netlify(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 ? " — run `npx netlify login` again" : "";
    throw new Error(`Netlify ${method} ${path} -> ${res.status}${hint}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

export const listDeploys = (perPage = 25) =>
  netlify("GET", `/sites/${SITE_ID}/deploys?per_page=${perPage}`);
export const getDeploy = (id) => netlify("GET", `/deploys/${id}`);
export const getSite = () => netlify("GET", `/sites/${SITE_ID}`);
