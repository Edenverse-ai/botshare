# Robot Registry — issues #5–#10

The first delivery adds independent physical robot passports for Hifivebot's
three AGIBOT X2 machines. A Robot Model describes a model; each RobotAsset is
one physical machine. The initial fleet size is not a system limit.

Implemented flows: incomplete drafts, evidence-backed permanent registration,
printable QR labels, a public identity allowlist, private manual usage / damage /
maintenance / inspection records, append-preserving corrections, and retirement.
Services, bookings, payment, external operational roles and RWA are not connected.

## Run the isolated local demonstration

Prerequisites: Docker, Node.js 20.9 or later and installed npm dependencies.

```sh
npm ci
npm run registry:dev
```

Open `http://localhost:3100/admin/robots`. The development-only accounts are
`admin@registry.test`, `customer@registry.test`, and `provider@registry.test`;
their development-only password is `Registry-local-demo-2026!`.
Only the admin account manages the registry.

The command starts a loopback-only Postgres 16 container, applies migrations,
and seeds a model, test accounts and three incomplete draft placeholders. It
does not invent the real machines' serial numbers or nameplate evidence. The
seed can be rerun without duplicating these drafts. Browser tests create extra
clearly marked synthetic machines; none represents a production registration.

Database data persists in the registry Docker volume. `docker compose -f
compose.registry.yml stop` stops the database without deleting it. The local
launcher overrides database/auth settings and disables configured external
credentials before Next.js can load the production values from `.env`.

## Configuration and deployment boundary

Normal application startup leaves the registry disabled unless explicitly
configured. Set `REGISTRY_DATABASE_URL`, `REGISTRY_ENVIRONMENT` and
`REGISTRY_PUBLIC_ORIGIN` for the intended environment. There is no fallback
from the registry database setting to `DATABASE_URL`.

For this integrated deployment, point registry and application database settings
at the same intended database so they share authentication and the Robot Model
catalog. Development and test access is restricted to local databases named
`botshare_registry_*` or `registry_test_*`. The provided launcher uses only the
dedicated local database. Production activation and migration remain separate
operations requiring the project's normal approval and migration checks.
Hosted staging uses `REGISTRY_ENVIRONMENT=staging` and requires an explicit
`schema=registry_preview_*` in its registry database URL. Its Robot Model catalog
and registry tables are isolated from production; test labels remain marked.

The QR origin must be the stable address people will actually reach. A local
`localhost` label demonstrates the flow on this computer; a physical phone needs
an approved reachable preview/deployment origin before printing real labels.

The additive migration creates only registry tables, constraints, a permanent
number sequence, and history/identity guards. Historical repository migrations
omit the already-existing User terms-acceptance fields. The launcher applies
`registry-local-baseline.sql` only in its isolated local database so actual login
can be tested. That compatibility script is not a production migration.

## Invariants and storage

- Existing `ADMIN_EMAILS` authorization protects every internal request, file
  read and mutation. A provider account does not grant registry access. Mutations
  observe `DB_MIGRATION_READ_ONLY`.
- Mutation callers send a stable `Idempotency-Key`. The browser retains a key on
  failed requests. Transactions serialize this small fleet's mutations and store
  successful outcomes; conflicting reuse is rejected. Stale identity edits are
  rejected by version rather than silently overwriting newer information.
- Formal registration requires a model, normalized unique manufacturer serial,
  private nameplate evidence and owner confirmation. Permanent numbers are
  database-unique, immutable, nonzero and never recycled. Gaps are permitted.
  Registration also binds the confirmation to the reviewed draft version;
  another administrator's edit requires reloading and reconfirming.
- Files are stored durably in Postgres, limited to 5 MB each. This deliberately
  avoids another storage service for the three-machine pilot. Nameplates and
  operational attachments are private; presentation images have a distinct
  purpose and are published only when explicitly selected. Backups of the
  registry database must include file bytes. No public service image bucket is
  used. Images are decoded to verify their contents, with a 25-megapixel limit;
  a header-only or truncated image cannot satisfy registration evidence.
  Registry tables have RLS enabled without public policies.
- Public passports expose only Robot ID, brand, model and the selected
  presentation image. Knowing a private file ID is not sufficient to read it.
- Records retain event time, actual operator/technician, recorder and recording
  time separately. A correction appends a successor with a reason; it cannot
  change the original record, move it to another machine or create branching
  revisions. The UI retains both versions.
- Registration does not imply readiness. Damage that affects use and maintenance
  mark the robot as requiring maintenance. A separate inspection can restore
  readiness only if it is not older than the latest condition event. Corrections
  never restore readiness; correcting an inspection requires a fresh check.
  Future operational events are rejected with a five-minute clock tolerance.
  Retired machines cannot be reactivated by inspection.
- History has no cascading dependency on login accounts or services. Model
  removal is restricted while referenced. Actor attribution is retained as a
  snapshot. Application operations cannot delete robot identities or original
  evidence/history.

## Validation

```sh
npm run typecheck
npm run lint
npm run test:registry
# Full existing suite plus isolated registry integration tests:
node scripts/registry-test.mjs lib
npx playwright install chromium
npm run test:registry:browser
```

The integration runner creates a fresh disposable database in the local Docker
service, applies the actual migration chain, runs request-boundary tests against
real Postgres, and removes only that disposable database. The normal `npm test`
does not implicitly provision infrastructure; registry integration tests skip
unless invoked with the isolated test environment.

Browser coverage uses actual NextAuth login and the site's HTTP endpoints. It
checks the full administration flow, mobile passport width and data visibility,
return from a passport to its matching internal record, and customer/provider
denial. Browser artifacts use `.registry-test-results`, separate from existing
repository test artifacts.

For a local production build, pass `localRegistryEnvironment()` from the provided
launcher helper to `npm run build`; do not build against the production `.env`.
The final implementation passed 42 tests, two browser scenarios, typecheck,
lint and the production build. Review regressions cover stale confirmations,
image integrity, future events and condition corrections. The browser scenario
also verifies that changing a draft clears the previous owner confirmation.
Prisma 4 emits an existing Node 22 signal-handler
error when build workers stop; the build still exits successfully. No production
database migration, production registration, push or deployment was performed.

## Review record

Standards review found no documented-rule violations. It suggested consolidating
the duplicated inspection input validation (done) and improving the primitive
transport/lifecycle types (a nonblocking maintainability recommendation).

Spec review found five correctness issues: stale registration confirmation at
the API boundary, a checked owner confirmation surviving a changed draft in the
UI, truncated image evidence, future inspections and an inspection correction
that invalidated readiness. All were reproduced with request-boundary or browser
regressions and fixed. Follow-up review found no remaining blocking issue.
