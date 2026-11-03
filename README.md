# Hifivebot

**Robot service rental marketplace.** Customers browse robots by metro, use case, and
service category, book them for a date range, pay through Stripe, and track the unit
through a shipped → delivered → returned lifecycle. A service is built on a robot
registered in the Robot Registry, and its model sets the price.

| | |
|---|---|
| Brand / product domain | `hifivebot.com` |
| Deployed at | `hifivebot.com` (Netlify project `hifivebot-com`) |
| Repository | `robotx-ai/botshare` |
| Stack | Next.js 13 (App Router) · TypeScript · Prisma · Supabase Postgres · Stripe · Tailwind |

> The repo started life as an Airbnb-clone template. The product is **not** a home rental
> app, and Airbnb vocabulary is banned from user-facing copy — see
> [Terminology](#terminology-enforced). Some internal identifiers (`Listing`,
> `Reservation`, `guestCount`, the `airbnb-clone` package name) are deliberate legacy
> compatibility and are not being renamed during MVP.

---

## Table of contents

- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Architecture](#architecture)
- [Domain model](#domain-model)
- [Core flows](#core-flows)
- [Roles and access control](#roles-and-access-control)
- [Product constraints](#product-constraints)
- [Terminology (enforced)](#terminology-enforced)
- [Deployment](#deployment)
- [Testing and quality gates](#testing-and-quality-gates)
- [Data and one-off scripts](#data-and-one-off-scripts)
- [Further docs](#further-docs)

---

## Quick start

```bash
git clone https://github.com/robotx-ai/botshare.git
cd botshare
npm install
cp .env.example .env      # then fill in real values
npx prisma generate
npm run dev               # http://localhost:3000
```

> [!WARNING]
> **There is no separate dev database.** `.env` points `DATABASE_URL` at the **production**
> Supabase project. `npm run dev`, every script in `scripts/`, and any local Prisma or
> Supabase call read and **write live production data**. Be deliberate, and delete any test
> rows or uploaded files you create.

If `npm run dev` crashes with a Prisma client/schema mismatch right after a `git pull`,
the generated client is stale — re-run `npx prisma generate`.

## Environment variables

Copy `.env.example` and fill in. On the deployed site these live in the Netlify site
dashboard (scoped to all contexts); `.env` is a strict subset used for local dev only.

**Database**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres, pooled connection |
| `DIRECT_URL` | Direct connection, used by migrations |
| `DB_MIGRATION_READ_ONLY` | `"true"` makes `lib/writeGuard.ts` reject every mutating API route — cutover kill-switch |

**Auth**

| Variable | Purpose |
|---|---|
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth config |
| `ADMIN_EMAILS` | Comma-separated admin allowlist, read by `lib/adminAuth.ts` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `FACEBOOK_ID` / `FACEBOOK_SECRET` | OAuth providers — wired but **currently commented out** in `pages/api/auth/[...nextauth].ts`; sign-in today is credentials-only |

**Payments and email**

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Checkout |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Transactional email via Resend (`lib/email.ts`) |

**Media and maps**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (or `CLOUDINARY_URL`) | Image + video delivery |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage uploads (`service-images` bucket) and CLI ops |
| `NEXT_PUBLIC_MAPTILER_KEY` | MapLibre GL basemap tiles |

`MONGODB_MIGRATION_URI` / `MONGODB_MIGRATION_DB` are only read by the one-time
Mongo → Postgres migration scripts and can stay unset.

## Commands

```bash
npm run dev             # dev server on :3000
npm run build           # production build
npm run lint            # ESLint — must pass before any PR or merge
npm test                # vitest, single run
npm run test:watch      # vitest, watch mode
npm run db:seed         # prisma/seed.js
```

Deploy commands are listed under [Deployment](#deployment); data scripts under
[Data and one-off scripts](#data-and-one-off-scripts).

## Architecture

Next.js 13 **hybrid router**: everything lives in `app/` except NextAuth, which requires
the Pages Router.

```
app/
├── actions/                 server-side data loaders (RSC-only, no client imports)
│   getListings, getListingById, getReservations, getAllReservations,
│   getAvailableRobots, getMyRobots, getOrderById, getFavoriteListings, getCurrentUser
├── api/                     App Router API routes
│   listings/  reservations/  reservations/[id]/status/
│   checkout/  favorites/  register/  profile/  upload/  robot-models/
│   verify-email/  forgot-password/  reset-password/  zip-check/
├── services/                browse + filter the catalog
├── listings/[listingId]/    service detail + booking widget
├── my-listings/             provider's own services
├── orders/[reservationId]/  order timeline + status transitions
├── trips/  reservations/  favorites/  profile/
├── admin/orders/            admin-only: all bookings, filter, cross-tenant cancel
├── robot-types/[model]/     static marketing pages per robot model
└── checkout/success/        Stripe post-payment landing

pages/api/auth/[...nextauth].ts   the only Pages Router file

components/
├── models/       Login, Register, RentModal (create service), Search
├── navbar/       navbar, category filter, zip search, role-aware user menu
├── listing/      service card + detail sub-components
├── orders/       order timeline / status controls
├── auth/  inputs/  robot-types/

lib/
├── prismadb.ts             Prisma singleton
├── adminAuth.ts            isAdminEmail(), canManageServices()
├── writeGuard.ts           read-only lock for migration cutovers
├── orderStatus.ts          order lifecycle: statuses, labels, transition table
├── serviceCategories.ts    the 3 canonical categories
├── useCases.ts             the 6 canonical use cases
├── robotModel.ts, robotTypeCatalog.ts    robot taxonomy
├── metro.ts, zipMetro.ts   zip → metro resolution, bboxes, centroids
├── scenarioPricing.ts, agibotScenarioDetails.ts    scenario pricing model
├── email.ts, emailVerification.ts, passwordPolicy.ts
└── providerProfile.ts, stripe.ts, termsContent.tsx

hook/     Zustand modal stores and small utility hooks
data/     zip-to-metro.json, metro-bbox.json, robot-catalog/, agibot-scenarios.json
scripts/  seeding, catalog builds, migration helpers, deploy promotion
```

- **Auth**: NextAuth + Prisma adapter. Credentials provider with bcrypt hashes and a
  6-digit emailed verification code (`EmailVerificationCode`); Google/Facebook are
  scaffolded but disabled.
- **Maps**: MapLibre GL via `react-map-gl` (migrated off Leaflet). Zip proximity search
  resolves a zip to a metro through `lib/zipMetro.ts` and `data/zip-to-metro.json`.
- **Media**: service and SKU images go to the Supabase Storage `service-images` public
  bucket through `POST /api/upload` (server-side, service-role key). Hero and showcase
  **videos** are hosted on Cloudinary — never commit video files; `public/videos/*.mp4|.mov|.webm`
  is gitignored.
- **Route protection**: `middleware.ts` gates `/trips`, `/reservations`, `/my-listings`,
  `/favorites`, `/profile`, `/orders/*`, `/admin/orders`.
  The middleware only checks *authentication* — authorization is enforced per-route in the
  API layer.

## Domain model

Postgres via Prisma (`prisma/schema.prisma`).

| Model | Notes |
|---|---|
| `User` | `userType: CUSTOMER \| PROVIDER` is the canonical role flag. Also `businessName`, `phone`, `verified`, terms-acceptance stamps. |
| `Listing` | A bookable service. `price` = **per day**. `metro`, `zipCode`, `lat`, `lng` drive proximity search. `robotModelId` links the catalog entry; `robotAssetId` links the registered physical robot; `sku` + `skuImageSrc` capture the physical unit. |
| `Reservation` | A booking. `status: OrderStatus`, unique `stripeSessionId` set after checkout. |
| `ReservationEvent` | Append-only audit row per status transition (actor + optional note). |
| `RobotModel` | Curated catalog seeded from `data/robot-catalog/`. Carries brand/model, `useCase[]`, `serviceCategory`, `capabilityTag`, hourly/daily/monthly prices, and `listable` (controls whether it appears in the create-service picker). `msrp` is reference-only and must never be used as a rental price. |
| `UserFavorite` | Unique on `(userId, listingId)`. |
| `EmailVerificationCode` | One active hashed code per email, with expiry and attempt counter. |

Enums: `UserType`, `Metro` (`SF`, `LA`, `VEGAS`, `DALLAS`, `NYC`, `MIAMI`),
`OrderStatus` (below).

`guestCount`, `roomCount`, and `bathroomCount` on `Listing` are legacy compatibility
fields. Do not repurpose them.

## Core flows

### Booking and payment

1. Customer picks a date range on `/listings/[listingId]`.
2. `POST /api/checkout` validates the listing and creates a Stripe Checkout Session.
3. Stripe redirects to `/checkout/success`, which finalizes the `Reservation` and stores
   `stripeSessionId`.
4. Resend sends the customer confirmation and the admin notification (`lib/email.ts`).

### Order lifecycle

`lib/orderStatus.ts` is the single source of truth and mirrors the Prisma enum exactly.
Seven happy-path steps, with `CANCELLED` as a side exit:

```
PLACED → CONFIRMED → SHIPPED → DELIVERED → RETURN_INITIATED → RETURN_RECEIVED → COMPLETED
```

Every transition is declared in an explicit table with the roles allowed to perform it —
anything not listed is illegal. Providers confirm, ship, receive the return, and settle;
customers acknowledge delivery and initiate the return; admins can do any non-terminal
transition. Cancellation is open to customer/provider only *before* the robot ships.
Transitions run through `PATCH /api/reservations/[reservationId]/status` and each one
writes a `ReservationEvent`.

### Who may list a service

Creating a service requires a provider or admin account with a complete provider
profile, and a robot already registered in the Robot Registry. The robot's model
supplies the price; the client cannot set it. The individual-owner pool that once let
any account offer a robot for an operator to claim was withdrawn.

## Roles and access control

Two independent axes:

- **`User.userType`** — `CUSTOMER` or `PROVIDER`. Product role; drives the user menu and
  service-management surfaces. Do not add parallel role booleans.
- **`ADMIN_EMAILS`** — an ops allowlist checked by `isAdminEmail()`. Orthogonal to
  `userType`.

Rules:

- Catalog writes (create/edit/delete a service) are gated to **providers and admins**
  via `canManageServices()`. Customers never write to the catalog.
- Providers see and manage only their own services and the bookings placed on them.
  Admins get full cross-tenant visibility and override.
- `POST /api/upload` is part of service creation, so it is gated with `canManageServices`
  — the same audience as `POST /api/listings`. **Do not** narrow it to admins only; that
  403s providers uploading service and SKU photos.
- **Enforce authorization at the API layer regardless of what the UI shows.** Hidden
  buttons are not access control.

## Product constraints

**Service categories** — exactly eight, source of truth `lib/serviceCategories.ts`.
Do not add more without an explicit product request. `Listing.category` stores the label.

| Label | Slug |
|---|---|
| `Private Events` | `private-events` |
| `Commercial Events` | `commercial-events` |
| `Schools & Universities` | `schools-universities` |
| `Entertainment` | `entertainment` |
| `Restaurants` | `restaurants` |
| `Hotels` | `hotels` |
| `Shopping Centers` | `shopping-centers` |
| `Warehouses` | `warehouses` |

`/services` renders the scenario index; `/services/<slug>` renders one scenario with its
bookable packages. Per-scenario editorial content is in `lib/serviceScenarios.ts`.

**Robot capabilities** — exactly six, source of truth `lib/useCases.ts`: Cleaning,
Delivery, Performance, Guide, Live streaming, Patrol. These tag `RobotModel.useCase` and
filter the internal robot catalog; they are **not** service categories.

**Theme** — user-facing UI uses **white, gray, and black only**. Any legacy
rose/coral/indigo/blue accent gets replaced with neutral grayscale. Prefer changing the
centralized Tailwind tokens over scattering hardcoded classes.

**Schema** — no Prisma redesigns during MVP. Keep existing route shapes
(`/listings/[listingId]`, `/api/listings`, `/api/reservations`, `/api/checkout`, …).
Prefer reinterpreting a field's meaning in copy and validation over migrating it.

## Terminology (enforced)

`AGENTS.md` is the authoritative source for product copy. User-facing text must use:

| Use | Never |
|---|---|
| service | listing |
| booking | reservation |
| customer | guest |
| service operator | host |
| service package / deployment | home, place, property |
| per day | per night |
| Hifivebot Service Assurance | AirCover |

**Banned in new copy**: Airbnb, host, guest, property, per night, AirCover. PRs that
introduce Airbnb wording into user-facing copy should be rejected. Internal variable
names and route paths may keep legacy names for compatibility.

## Deployment

Deploys to **hifivebot.com** (Netlify project `hifivebot-com`, Supabase project
`jylxrvwxsjehthsqswib`).

**Netlify CI builds; nothing is built or uploaded locally.** Pushing to `main` triggers a
CI build — and that build does **not** go live. Auto-publishing is deliberately off and
the published deploy is kept *locked*, so every CI build finishes as a `ready` but
unpublished deploy at `https://<deploy_id>--hifivebot-com.netlify.app`. Every push is
effectively a preview; going live is a separate, explicit act.

```bash
git push origin main      # → CI build; preview only, never goes live
npm run deploy:status     # recent deploys (add --silent to pipe JSON)
npm run deploy:logs       # stream the log of an in-progress build
npm run deploy:build      # trigger a CI build without pushing a commit
npm run deploy:promote    # publish the newest ready deploy to hifivebot.com
npm run deploy:rollback   # republish the previously published deploy
```

`deploy:promote` runs `scripts/promote-deploy.mjs`, which preflights the target deploy on
its own URL (home returns 200, `/services` returns 200 rendering real DB rows) and refuses
to publish if the database is not answering. Publishing is a single API call — instant, no
rebuild, no build minutes, nothing uploaded. Rollback is the same operation in reverse and
equally instant. Prefer the `/prod-deploy` skill, which wraps this with a confirmation step.

`npm run deploy:local` is the escape hatch for when Netlify CI is unavailable: it builds
locally and publishes directly, bypassing the lock. It uploads ~32 MB and is unreliable on
a flaky connection. Do not reach for it by default.

### Deployment gotchas (learned the hard way)

1. **The Prisma rhel query engine must be forced into the build.** `prisma generate` only
   materializes a schema `binaryTarget` that is already in `~/.cache/prisma` or was fetched
   by the `@prisma/engines` postinstall. On Netlify's cold CI cache that silently produces a
   client with `rhel-openssl-1.0.x` but **not** the `rhel-openssl-3.0.x` the nodejs20.x
   Lambda loads. It builds and serves HTML fine, then throws
   `Query engine library ... could not be found` on **every DB query** — login and all data
   break. `scripts/bundle-prisma-engines.mjs` (run by `build:netlify`) downloads any missing
   rhel engine from `binaries.prisma.sh`, pinned to the commit in `@prisma/engines-version`,
   then stages both engines into `node_modules/@prisma/client/runtime` where the Lambda looks
   first. `netlify.toml` `included_files` bundles those staged copies; `next.config.js`
   `outputFileTracingIncludes` bundles `node_modules/.prisma/client`. The script hard-fails the build if the engine is still missing — that guard
   is why a broken function cannot reach production. Never weaken it.
   Do **not** set `PRISMA_CLI_BINARY_TARGETS`: Prisma 4.12 rejects `native` in that list and
   the build dies with `Unknown binaryTarget native`.
2. **`next/font/google` fetches from `fonts.gstatic.com` at build time and intermittently
   times out** (`NextFontError: Failed to fetch 'Barlow Condensed'`), failing the whole
   build. It is transient — retry with `npm run deploy:build`. The durable fix is
   self-hosting via `next/font/local`.
3. **Prisma migration drift is common on prod.** The live schema is often ahead of
   `_prisma_migrations`. `prisma migrate deploy` then fails with `relation already exists`
   and leaves a FAILED record that blocks every future deploy. Recover with
   `prisma migrate resolve --applied <migration_name>` per already-applied migration, then
   re-run `migrate deploy`. Verify the objects exist (read-only) before marking anything applied.
4. **Netlify does not expose build logs over its API.** `netlify logs:deploy` streams
   *in-progress* builds only. To capture a failure: trigger the build, poll until
   `state=building`, then attach the stream — otherwise the reason behind an `exit code 2`
   is invisible.
5. **A local VPN/proxy client breaks Netlify CLI calls** and can make hifivebot.com look
   down. The npm deploy scripts strip `HTTP_PROXY`/`HTTPS_PROXY` for exactly this reason.
   If `curl https://hifivebot.com` fails while `--resolve`-ing the same host to its edge IP
   succeeds, the resolver is handing back fake-IP space (`198.18.0.0/15`) — that is the local
   tunnel, not the site.

## Testing and quality gates

```bash
npm run lint    # required before any PR or merge
npm test        # vitest
```

Unit tests cover the pure decision logic — `lib/orderStatus.test.ts` (transition table).
New business rules
belong in a pure, DB-free module in `lib/` with tests, not inline in a route handler.

## Data and one-off scripts

Reference data lives in `data/`: `zip-to-metro.json` and `metro-bbox.json` (proximity
search), `robot-catalog/` and `robot-catalog.json` (the `RobotModel` catalog),
`agibot-scenarios.json` (scenario pricing).

| Script | Purpose |
|---|---|
| `scripts/seed-robot-catalog.mjs` | Upsert `RobotModel` rows from `data/robot-catalog/`, keyed on `slug` |
| `scripts/curate-listable-models.mjs` | Flip `listable` on catalog entries |
| `scripts/build-robot-catalog.py` | Rebuild the catalog JSON from the source spreadsheet |
| `scripts/build-zip-metro-map.js` | Regenerate `zip-to-metro.json` / `metro-bbox.json` |
| `scripts/seed-agibot-scenarios.js`, `scripts/sync-scenario-thumbnails.js` | Scenario pricing data + imagery |
| `scripts/migrate-listing-use-cases.mjs` | Backfill `useCase[]` on existing listings |
| `scripts/bundle-prisma-engines.mjs` | Netlify build step — see gotcha 1 |
| `scripts/promote-deploy.mjs` | Preflight + publish/rollback a Netlify deploy |

**Mongo → Postgres migration** (historical; the cutover is complete):

```bash
npm run db:migrate:sql      # generate the init migration from the Prisma schema
npm run db:migrate:data     # copy Mongo documents into Postgres
npm run db:migrate:verify   # row-count and integrity checks
```

Set `DB_MIGRATION_READ_ONLY="true"` during a cutover to make `lib/writeGuard.ts` reject
every mutating API route.

Every script in `scripts/` runs against the **production** database. Re-read the warning
in [Quick start](#quick-start) before running one.

### Uploading a video to Cloudinary

Cloud name `dmrhtzqyx`. Credentials are in `.env`.

```bash
curl -X POST \
  -F "file=@public/videos/<file>.mp4" \
  -F "public_id=<asset-name>" \
  -F "resource_type=video" \
  -F "overwrite=true" \
  -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET" \
  "https://api.cloudinary.com/v1_1/$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME/video/upload"
```

Delivery URL: `https://res.cloudinary.com/dmrhtzqyx/video/upload/q_auto,f_auto/<public_id>.mp4`
(`q_auto` = per-device quality, `f_auto` = WebM to Chrome, mp4 elsewhere).

Current assets: `showcase-bg` (`components/ServiceShowcase.tsx`), `pepsi-bg` and
`paris-performance-bg` (`components/HeroCarousel.tsx`).

## Further docs

| File | Contents |
|---|---|
| `AGENTS.md` | Authoritative product, terminology, and taxonomy rules |
| `CLAUDE.md` | Working instructions for Claude Code in this repo |
| `docs/supabase-cutover-runbook.md` | Mongo → Supabase cutover procedure |
| `docs/migration-verification-template.md` | Post-migration verification checklist |
| `docs/helper.html` | Internal operator helper reference |
