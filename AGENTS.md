# Hifivebot Agent Playbook

## Product Identity
- Primary brand/domain: `hifivebot.com` (robot service rental bookings).
- Do not present this product as Airbnb, home rental, or property rental.
- If any internal doc conflicts on branding/taxonomy, this file is the source of truth for agent behavior.

## Core Commands
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint check (must pass before PR/merge)

# One-time Supabase migration utilities
npm run db:migrate:sql
npm run db:migrate:data
npm run db:migrate:verify
```

## Architecture Snapshot
- Framework: Next.js 13 hybrid (`app/` + `pages/api/`).
- `app/actions/`: server-side data loaders (`getListings`, `getListingById`, `getReservations`, `getFavoriteListings`, `getCurrentUser`).
- `app/listings/[listingId]/`: service detail page.
- `app/services/`: service catalog browsing/filtering.
- `app/trips/`, `app/reservations/`, `app/favorites/`, `app/my-listings/`: authenticated pages protected by `middleware.ts`.
- `components/modals/`: modal dialogs (Login, Register, RentModal, Search).
- `components/navbar/`: navbar, search, user menu.
- `components/services/`: robot type index/cards/chips (tags from `lib/robotTags.ts`), scenario hero/detail, category chips, results grid.
- `components/listing/`: service card/detail UI.
- `lib/`: shared utilities including `adminAuth.ts`, `serviceCategories.ts`, `writeGuard.ts`, `prismadb.ts`.
- Database: Supabase Postgres via Prisma (`prisma/schema.prisma`).
- Auth: NextAuth with Prisma adapter, customer/provider roles, and admin override by `ADMIN_EMAILS`.

## Canonical Service Taxonomy
- Allowed service categories — exactly eight (exact label / slug):
  - `Private Events` / `private-events`
  - `Commercial Events` / `commercial-events`
  - `Schools & Universities` / `schools-universities`
  - `Entertainment` / `entertainment`
  - `Restaurants` / `restaurants`
  - `Hotels` / `hotels`
  - `Shopping Centers` / `shopping-centers`
  - `Warehouses` / `warehouses`
- Source of truth: `lib/serviceCategories.ts`. `Listing.category` stores the label.
- No additional categories without explicit product request.
- If other docs mention 3, 4, or 6 categories, treat that as stale unless this file is explicitly updated.

## Strict Terminology Map (Mandatory)
Use this map in user-facing copy first, then variable naming when practical and safe.

| Legacy term | Canonical term |
| --- | --- |
| listing | service |
| host | service operator |
| guest | customer |
| home/place/property | service package or deployment |
| reservation | booking |
| per night | per day |
| AirCover | Hifivebot Service Assurance |

Hard rule:
- Reject PRs that introduce new Airbnb wording in user-facing copy.

## MVP Data and Architecture Guardrails
- No Prisma schema redesign in MVP rebrand phase.
- Keep existing route shapes and DB fields for compatibility.
- Reinterpret semantics in-place:
  - `Listing.category` must be one of the 3 service categories.
  - `Listing.price` means per-day service price.
  - `locationValue` means service coverage city/region.
- Existing fields `guestCount`, `roomCount`, and `bathroomCount` are legacy compatibility fields.
- Do not expand legacy count fields into new product concepts in MVP.
- Prefer UI/copy/validation remap over DB migration during MVP.

## Access Control Rules
- Catalog supports provider-owned services in MVP, with admin oversight.
- Providers may view, create, edit, and delete only their own services.
- Providers may view and manage bookings placed on their own services.
- Customers must not create, edit, or delete services they do not own.
- Admin gating default: `ADMIN_EMAILS` environment variable (comma-separated email allowlist).
- Admins retain full cross-catalog visibility and override access.
- Enforce authorization at API layer even if UI hides controls.
- Keep service-management UI mounted only for users allowed to manage services.

## Supabase Control Contract
- Codex can operate Supabase for this repo when the following environment variables are set:
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_DB_PASSWORD`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL` as fallback)
- Preferred environment order:
  1. Staging first.
  2. Production only with explicit user confirmation for destructive steps.
- Allowed without extra confirmation:
  - schema introspection
  - migration planning/verification
  - non-destructive SQL checks
  - auth/storage policy inspection
- Require explicit user confirmation in task thread:
  - destructive SQL (`DROP`, `TRUNCATE`, wide `DELETE`)
  - auth/provider resets
  - storage bucket deletion
  - production changes that can impact live traffic
- Secrets policy:
  - Never print credential values in chat/log summaries.
  - Keep service-role usage server-side only.

## Environment Variables (Operational)
- Core app:
  - `DATABASE_URL`
  - `ADMIN_EMAILS`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
- Cloudinary:
  - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - `CLOUDINARY_URL`
- Supabase/migrations:
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_DB_PASSWORD`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
  - `DB_MIGRATION_READ_ONLY` (`"true"` blocks write API routes via `lib/writeGuard.ts`)
- Legacy one-time migration:
  - `MONGODB_MIGRATION_URI`
  - `MONGODB_MIGRATION_DB`

## Routing and UX Rules
- Keep existing route skeleton in MVP (for example `/`, `/listings/[listingId]`, `/api/listings`, `/api/reservations`).
- Rebrand labels/copy first; defer route renaming.
- Keep location/date filtering flow, but wording must describe service booking.

## Theme Color Policy (MVP)
- User-facing theme colors must be restricted to white, gray, and black.
- Replace legacy accent colors (for example rose/coral/indigo/blue) with neutral grayscale equivalents.
- Prefer centralized Tailwind/CSS tokens for neutral palette updates instead of scattered hardcoded values.
- Do not introduce non-neutral theme colors unless there is an explicit product request in the task thread.
- Exception: the Hifivebot brand mark (`public/hifivebot-icon.png`, `public/hifivebot-logo.png`, `app/icon.png`, `app/apple-icon.png`) is full color by design and must not be grayscaled or recolored. Vector originals live in `brand/`.

## Cloudinary Video Management
- Cloudinary is used for both images and videos.
- Do not commit local video files into git (for example `public/videos/*.mp4|.mov|.webm`).
- Delivery URL pattern:
  - `https://res.cloudinary.com/<cloud>/video/upload/q_auto,f_auto/<public_id>.mp4`

## Definition of Done for Rebrand Tasks
- All visible Airbnb wording removed.
- Category filters show exactly 3 service categories.
- Customers cannot access create/edit/delete service flows.
- Providers can access only their own service-management and incoming-booking flows.
- Admins retain cross-catalog management access.
- Theme colors use only white/gray/black across user-facing UI in MVP scope.
- `npm run lint` passes.
- `npm run build` passes.
- Manual smoke checklist completed (home browse, detail, booking flow, auth flow, favorites/trips/reservations pages).

## Out of Scope (MVP)
- Hourly/time-slot scheduling.
- Marketplace expansion beyond provider self-service ownership and admin oversight.
- DB schema migration for service-specific fields.

## Working Defaults
- Booking model: date range + day rate.
- Catalog model: provider-owned services with admin oversight.
- Service area model: city/region coverage.
- Role model stays limited to customer/provider semantics plus `ADMIN_EMAILS` admin overrides.
