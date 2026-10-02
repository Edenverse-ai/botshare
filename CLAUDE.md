# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

**Hifivebot** (`hifivebot.com`) is a robot service rental booking platform. The `AGENTS.md` file contains the authoritative product and terminology rules; always consult it for any user-facing copy decisions.

## Commands

```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint check (must pass before any PR/merge)
```

## Deployment

This repo deploys to **hifivebot.com** (Netlify project `hifivebot-com`, site id `79afde94-abbe-422c-ba4c-f68ab0100e62`, Supabase project `jylxrvwxsjehthsqswib`).

**Netlify CI builds; you never build or upload locally.** Pushing to `main` triggers a build on Netlify. Nothing goes live from that build on its own.

**Auto-publishing is deliberately OFF.** The published deploy is kept *locked*, so each CI build finishes as a `ready` but unpublished deploy with its own URL (`https://<deploy_id>--hifivebot-com.netlify.app`). Every push is effectively a preview. Going live is a separate, explicit act.

```bash
git push origin main            # -> CI build; preview only, never goes live
npm run deploy:status                         # recent deploys as JSON (-- --table for a summary)
npm run deploy:logs                           # stream the log of a build in progress
npm run deploy:build                          # trigger a CI build without pushing (-- --wait to follow it)
npm run deploy:promote                        # preflight only; changes nothing
npm run deploy:promote -- <deploy_id> --confirm   # publish that deploy to hifivebot.com
npm run deploy:rollback -- --confirm          # republish the previously published deploy
```

The deploy scripts (`scripts/deploy.mjs`, `scripts/promote-deploy.mjs`) call the Netlify REST API directly through `scripts/netlify-api.mjs`, so they behave the same on macOS and Windows. They authenticate with the Netlify CLI login (`npx netlify login`, once per machine). **Publishing requires `--confirm`;** without it promote/rollback only preflight. In PowerShell a bare `--` is dropped and npm then swallows the flags, so run the npm commands from `cmd`/Git Bash, or call `node scripts/promote-deploy.mjs <deploy_id> --confirm` directly.

`deploy:promote` runs `scripts/promote-deploy.mjs`: it preflights the target deploy on its own URL (home 200, `/services` 200 rendering real DB rows) and refuses to publish if the database is not answering. Publishing is an API call — instant, no rebuild, no build minutes, nothing uploaded. Rollback is the same operation in reverse and equally instant. Prefer the `/prod-deploy` skill, which wraps this with a confirmation step.

`npm run deploy:local` is the escape hatch for when Netlify CI is unavailable (macOS/Linux only): it builds locally and uploads the result as an **unpublished** preview, which still goes through `deploy:promote`'s preflight. It refuses to run on Windows, where the build embeds `C:\` paths and every page 500s on the Linux function. It uploads ~32 MB and is unreliable on a flaky connection. Do not reach for it by default.

Netlify manages env vars (DATABASE_URL, SUPABASE_*, NEXTAUTH_URL, etc.) in the site dashboard, scoped to all contexts. The `.env` file is for local dev only, and is a strict subset of what the site holds.

### ⚠️ Deployment Gotchas (learned the hard way — read before deploying)

1. **The Prisma rhel query engine must be forced into the build.** `prisma generate` only materializes a schema `binaryTarget` when that engine is already in `~/.cache/prisma` or was fetched by the `@prisma/engines` postinstall. On Netlify's cold CI cache that silently yields a client with `rhel-openssl-1.0.x` but **not** the `rhel-openssl-3.0.x` the nodejs20.x Lambda loads. The result builds and serves HTML fine, then throws `Query engine library ... could not be found` on **every DB query** — login and all data break. `scripts/bundle-prisma-engines.mjs` (runs in `build:netlify`) now downloads any missing rhel engine straight from `binaries.prisma.sh`, pinned to the engine commit from `@prisma/engines-version`, then stages both engines into `node_modules/@prisma/client/runtime` where the Lambda looks first. `netlify.toml` `included_files` + `next.config.js` `outputFileTracingIncludes` bundle them. The script hard-fails the build if the engine is still absent — that guard is the reason a broken function cannot reach production. Never weaken it. Do **not** set `PRISMA_CLI_BINARY_TARGETS`: Prisma 4.12 rejects `native` in that list and the build dies with `Unknown binaryTarget native`.

2. **`next/font/google` fetches from `fonts.gstatic.com` at build time and intermittently times out** (`NextFontError: Failed to fetch 'Barlow Condensed'`), which fails the whole build. It is transient — retry with `npm run deploy:build`. The durable fix is self-hosting via `next/font/local`.

3. **`.env` points at the PRODUCTION Supabase database — there is NO separate dev DB.** `npm run dev`, any script in `scripts/`, and any local Prisma/Supabase call read and **write live production data**. Be deliberate; always clean up test rows/files you create.

4. **Prisma migration drift is common on prod.** The live schema is often ahead of `_prisma_migrations` (migrations applied out-of-band). `prisma migrate deploy` then fails `relation already exists` and leaves a FAILED record that blocks all future deploys. Recover with `prisma migrate resolve --applied <migration_name>` for each already-applied migration, then re-run `migrate deploy`. Verify objects exist first (read-only) before marking applied.

5. **Netlify does not expose build logs over its API.** `netlify logs:deploy` streams *in-progress* builds only. To capture a failure, trigger the build, poll until `state=building`, then attach the stream — otherwise the reason for an `exit code 2` is invisible.

6. **A local VPN/proxy client breaks Netlify CLI calls and can make hifivebot.com look down.** The npm deploy scripts strip `HTTP_PROXY`/`HTTPS_PROXY` for this reason. If `curl https://hifivebot.com` fails while `--resolve`-ing the same host to its edge IP succeeds, the resolver is handing back fake-IP space (`198.18.0.0/15`) — that is the local tunnel, not the site.

## Architecture

**Framework**: Next.js 13 (App Router + Pages Router hybrid)
- `app/` — React Server Components (App Router): layout, page routes, server actions, API routes
- `pages/api/` — Pages Router API: only `auth/[...nextauth].ts` (NextAuth requires Pages Router)
- All other API endpoints live under `app/api/`

**Key directories**:
- `app/actions/` — Server-side data fetchers: `getListings`, `getListingById`, `getReservations`, `getAllReservations` (admin), `getFavoriteListings`, `getCurrentUser`
- `app/api/` — `listings/`, `reservations/`, `favorites/`, `register/`, `checkout/` (Stripe session), `upload/` (image upload → **Supabase Storage** `service-images` public bucket; server-side via service-role key)
- `app/listings/[listingId]/` — Service detail page
- `app/services/` — Browse/filter services catalog
- `app/trips/`, `app/reservations/`, `app/favorites/`, `app/my-listings/` — Authenticated user pages (protected by `middleware.ts`)
- `app/admin/orders/` — Admin-only orders dashboard with filter/cancel
- `app/checkout/success/` — Stripe post-payment landing
- `app/robot-types/` — Static marketing pages for robot models
- `components/models/` — Modal dialogs: Login, Register, RentModal (provider/admin: create service), Search
- `components/navbar/` — Navbar with Categories filter, Search (incl. zip proximity), UserMenu (role-aware)
- `components/listing/` — Service card and detail sub-components
- `components/robot-types/` — Robot type landing components
- `lib/` — Shared utilities:
  - `adminAuth.ts` — admin email allowlist check
  - `prismadb.ts` — Prisma singleton
  - `stripe.ts` — Stripe client
  - `email.ts` — transactional email helpers
  - `serviceCategories.ts` — category constants
  - `serviceLocation.ts`, `zipCentroid.ts` — zip-code proximity search
  - `scenarioPricing.ts`, `agibotScenarioDetails.ts` — scenario-based pricing model
  - `robotModel.ts`, `robotTypeCatalog.ts` — robot taxonomy
  - `writeGuard.ts` — migration read-only lock
- `hook/` — Zustand modal stores and utility hooks
- `scripts/` — one-off data scripts (e.g. `duplicate-ca-to-fl.js`, `expand-fl-listings.js`, migration helpers)

**Database**: Supabase Postgres via Prisma (migrated from MongoDB). Schema in `prisma/schema.prisma`. Models: `User`, `Account`, `Listing`, `Reservation`, `UserFavorite`. Enum `UserType { CUSTOMER, PROVIDER }`.

**Auth**: NextAuth with Google + Facebook providers, Prisma adapter. Two role axes:
- `User.userType` (CUSTOMER | PROVIDER) — product role; determines UserMenu options and MyListings access
- `ADMIN_EMAILS` env allowlist (via `isAdminEmail()` in `lib/adminAuth.ts`) — elevated ops role for admin routes and cross-tenant cancel

**Payments**: Stripe Checkout Sessions. Booking flow: `POST /api/checkout` creates session → redirect to Stripe → `/checkout/success` finalizes `Reservation` with `stripeSessionId`.

**Maps**: MapLibre GL (migrated from Leaflet). Zip-code proximity search powered by `lib/serviceLocation.ts` + `lib/zipCentroid.ts`.

## Mandatory Terminology (User-Facing Copy)

| Use | Avoid |
|-----|-------|
| service | listing |
| booking | reservation |
| customer | guest |
| service package / deployment | home / place / property |
| per day | per night |
| Hifivebot Service Assurance | AirCover |
| service operator | host |

**Banned in new copy**: Airbnb, host, guest, property, per night, AirCover.

Internal variable names and route paths may keep legacy names during MVP for compatibility.

## Service Categories (Canonical — exactly 8, do not add without explicit request)

- `Private Events` (slug: `private-events`)
- `Commercial Events` (slug: `commercial-events`)
- `Schools & Universities` (slug: `schools-universities`)
- `Entertainment` (slug: `entertainment`)
- `Restaurants` (slug: `restaurants`)
- `Hotels` (slug: `hotels`)
- `Shopping Centers` (slug: `shopping-centers`)
- `Warehouses` (slug: `warehouses`)

Source of truth: `lib/serviceCategories.ts` (labels, slugs, icons).
Editorial content per scenario (hero art, overview, modules, flow, gallery) lives in
`lib/serviceScenarios.ts`.

Routes: `/services/<slug>` is a scenario page with its bookable packages.
`/services?category=<label>&zipCode=…` still renders the filtered catalog.
`Listing.category` stores the **label**, never the slug.

## Robot Types (Customer-Facing Browse Taxonomy, 2026-10-01)

The user chose to browse by robot tag instead of by scenario. The home page
"Robot Types" section and the `/services` index (the hero's "Explore Services")
show the `RobotModel.useCase` tags (`lib/useCases.ts` picker vocabulary, e.g.
Guide, Performance, Patrol, Cleaning) carried by **listable** models, read live
from the database by `lib/robotTags.ts`. Each tag links to `/services/tags/<tag-slug>`
(its models plus services built on them, matched by `Listing.robotModelId`).
Tagging a model and marking it listable is all it takes for a tag to appear; do
not hard-code tags. The eight scenarios remain the value of `Listing.category`
and keep their `/services/<slug>` pages; they are no longer the browse entry point.

## Access Control

- Service catalog write access is gated to **providers and admins**. Customers must not create/edit/delete services.
  - Provider check: `session.user.userType === 'PROVIDER'`
  - Admin check: `isAdminEmail()` from `lib/adminAuth.ts` — reads `ADMIN_EMAILS` env var
- Enforce at API layer regardless of UI visibility. `RentModal` (create service) is mounted conditionally in `app/layout.tsx` for eligible roles.
- **Image upload (`/api/upload`)** is part of service creation, so gate it with `canManageServices` (providers + admins) — the same audience as `POST /api/listings`. Do NOT restrict it to admins only (that 403s providers uploading service/SKU photos). The route uploads to the Supabase `service-images` public bucket and resolves the project URL via `SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL` (only the `NEXT_PUBLIC_` one is set in `.env`/Netlify).
- **Admin-only surfaces**: `/admin/orders` (all bookings, filter, cross-tenant cancel). Middleware matcher in `middleware.ts` gates `/admin/*`.
- **Reservation cancellation**: owners can cancel their own; admins can cancel any (DELETE `/api/reservations/[id]`).

## Theme Colors (MVP Constraint)

User-facing UI must use only **white, gray, and black**. Replace any legacy rose/coral/indigo/blue accent colors with neutral grayscale Tailwind classes. Prefer updating centralized Tailwind tokens over scattered hardcoded values.

**Exception: the Hifivebot brand mark.** `public/hifivebot-icon.png`, `public/hifivebot-logo.png`, `app/icon.png`, and `app/apple-icon.png` are the official multi-color logo and must stay in full color — do not grayscale or recolor them. Everything around the mark (wordmark text, chrome) stays neutral. Vector originals live in `brand/`.

## Schema Guardrails

### Approved Robot Registry exception (2026-09-08)

The user explicitly authorized implementation of GitHub issues #5–#10 in
Edenverse-ai/botshare: an independent administrator-managed Robot Registry for
three Hifivebot-owned AGIBOT X2 robots. Additive physical-asset persistence,
private evidence, permanent IDs, public passports, manual operational history
and retirement are in scope. Existing authentication and Robot Model terminology
are reused; service, booking, payment and role-system redesign remain excluded.
This narrow implementation supersedes the earlier MVP schema restriction for
these issues only. Development and destructive test fixtures must use isolated
nonproduction resources; this authorization does not include production migration
or deployment. Registry access requires explicit environment configuration and
must never fall back to the production credentials in the local `.env` file.

- Do not redesign the Prisma schema without explicit request.
- Keep existing route shapes (`/listings/[listingId]`, `/api/listings`, `/api/reservations`, `/api/checkout`, etc.).
- `Listing.category` → one of the 3 service categories.
- `Listing.price` → per-day service price.
- `Listing.locationValue` → service coverage city/region.
- `Listing.zipCode`, `Listing.lat`, `Listing.lng` → nullable; populated for zip proximity search.
- `Listing.videoSrc` → nullable Cloudinary video delivery URL.
- `Reservation.stripeSessionId` → unique; set after successful Stripe checkout.
- `guestCount`, `roomCount`, `bathroomCount` on `Listing` are legacy compatibility fields; do not repurpose.
- `User.userType` is the canonical role flag — don't add parallel role booleans.

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Key vars:
- `DATABASE_URL` — Supabase Postgres connection string (pooled)
- `DIRECT_URL` — direct Supabase connection for migrations
- `ADMIN_EMAILS` — comma-separated admin email allowlist
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — NextAuth config
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` — OAuth providers
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe payments
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` — Cloudinary cloud name (image + video delivery)
- `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — Cloudinary server-side credentials
- `CLOUDINARY_URL` — shorthand `cloudinary://<key>:<secret>@<cloud>` (alternative to key/secret pair)
- `SUPABASE_*` — for Supabase CLI operations
- SMTP credentials (for `lib/email.ts`) as applicable

## Cloudinary Video Management

Cloudinary (cloud name `dmrhtzqyx`) is used for both image uploads and video asset hosting. Video files must **never** be committed to git — `public/videos/*.mp4|.mov|.webm` is gitignored.

**To upload a video programmatically** (credentials are in `.env`):
```bash
curl -X POST \
  -F "file=@public/videos/<file>.mp4" \
  -F "public_id=<asset-name>" \
  -F "resource_type=video" \
  -F "overwrite=true" \
  -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET" \
  "https://api.cloudinary.com/v1_1/$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/video/upload"
```

**Delivery URL pattern:**
```
https://res.cloudinary.com/dmrhtzqyx/video/upload/q_auto,f_auto/<public_id>.mp4
```
- `q_auto` — auto quality per device/network
- `f_auto` — serves WebM to Chrome, mp4 elsewhere

**Current video assets:**
| public_id | Component | Notes |
|---|---|---|
| `showcase-bg` | `components/ServiceShowcase.tsx` | AGIBot demo, 25s loop, 1080p |
| `pepsi-bg` | `components/HeroCarousel.tsx` | Pepsi performance, 22s, hero slot 1 |
| `paris-performance-bg` | `components/HeroCarousel.tsx` | Paris performance, 10s, hero slot 2 |
