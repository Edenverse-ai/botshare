---
name: prod-deploy
description: Publish an already-built Netlify deploy to production for hifivebot.com. Use only when the user explicitly invokes /prod-deploy. Auto-publishing is disabled on this site (the published deploy is locked), so pushes to main build a preview but never go live — this skill is the only path to production.
---

# prod-deploy

Publishes an existing, verified Netlify deploy to `hifivebot.com`. It does **not** build:
Netlify CI already built it on push to `main`. Promotion is an API call — instant, no
build minutes, nothing uploaded over the local network.

The mechanics live in `scripts/promote-deploy.mjs`. This skill is the judgment layer
around it: choose the right deploy, confirm with the user, run it, report.

## Procedure

### 1. See what is available

```bash
npm run --silent deploy:status -- --table
```

`LIVE` marks the deploy that is published right now (asked from the site, not inferred
from `published_at`, which stays set on every deploy that was ever published). Without
`--table` the command prints the raw JSON; `npm run` prints a banner to stdout, so
`--silent` is required whenever piping it.

These commands work on macOS and Windows. In PowerShell a bare `--` is dropped and npm
then swallows the script's flags — run them from `cmd` or Git Bash, or call
`node scripts/promote-deploy.mjs ...` directly.

### 2. Preflight and show the user what would ship

```bash
npm run deploy:promote
```

This prints the currently published deploy and the target, then checks the target on its
own deploy URL: home returns 200, and `/services` returns 200 rendering real database rows.
Without `--confirm` it changes nothing. The DB check is the one that matters — a function bundled without the
Prisma rhel query engine serves HTML fine and throws on every query (see CLAUDE.md
"Deployment gotchas" #1).

Report the target's commit sha and subject to the user and **confirm before publishing**.
Invoking this skill authorizes a production publish; it does not authorize publishing a
commit the user did not expect. If the target is not the commit they have in mind, stop.

If the dry run aborts, do not try to work around it. Report the reason and stop.

### 3. Publish

```bash
npm run deploy:promote -- --confirm
```

Unlocks the current deploy, publishes the target, re-locks it so auto-publishing stays off,
then verifies the site. A non-zero exit means production may be in an unexpected state —
check `npm run --silent deploy:status` before doing anything else.

To publish a specific deploy instead of the newest ready one:

```bash
npm run deploy:promote -- <deploy_id> --confirm
```

### 4. Report

Give the user the published deploy id, the commit, the verified status codes, and:

```bash
npm run deploy:rollback -- --confirm
```

## Variants

- **Nothing to promote.** If no `ready` unpublished production deploy exists, there is
  nothing built since the last publish. Trigger a build, wait for it, then promote:

  ```bash
  npm run deploy:build -- --wait   # costs build minutes — say so before running
  npm run deploy:logs       # attach once state=building, to see failures
  ```

  Netlify only streams logs for builds *in progress*; there is no way to fetch the log of a
  finished build. Poll `deploy:status` until `state=building`, then attach.

- **Build failed on `next/font`.** `Failed to fetch 'Barlow Condensed' from Google Fonts` is
  a transient build-time network failure, not a code problem. Retry `npm run deploy:build`.

## Do not

- Do not run `npm run deploy:local` (or `netlify deploy --prod`) as the normal path. It
  builds locally and uploads ~32 MB over a connection that is unreliable here. It is an
  escape hatch for when Netlify CI is down, macOS/Linux only (a Windows build 500s on every
  page), and its upload is an unpublished preview that still needs `deploy:promote`.
- Do not leave the published deploy unlocked. Unlocked means every push to `main` goes
  straight to production. `promote-deploy.mjs` re-locks and fails loudly if it cannot.
- Do not set `PRISMA_CLI_BINARY_TARGETS` to fix an engine problem — Prisma 4.12 rejects
  `native` in that variable and the build dies with `Unknown binaryTarget native`.
