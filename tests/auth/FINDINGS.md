# Auth flow audit — signup / login / verification / password reset

Tested against the isolated local stack (`compose.registry.yml` Postgres on
`127.0.0.1:55439`, Next.js on `:3100`). Production data was never written to.

```bash
npm run test:auth:browser   # 27 tests: API-level + the real modals in Chromium
```

The suite started as 12 failing tests, one per defect. All of them are fixed and
the suite is green; the tests stay as regressions.

## What the audit found, and how it was fixed

### 1. HIGH — The email address was never normalized

`/api/register` stored the address exactly as typed and the credentials provider
looked it up exactly as typed, while `/api/forgot-password` and
`/api/reset-password` already did `trim().toLowerCase()`. Four symptoms from one
root cause: signing up as `foo@x.com` and logging in as `Foo@x.com` failed; the
same mailbox could register twice with different casing; a padded address made a
third unreachable account; and an account stored with any capital letter could
never use "Forgot password" (the route lowercased, found nobody, and returned
`ok` without sending).

Fixed with `lib/emailAddress.ts`: `normalizeEmail` on every write,
`findUserByEmail` on every read. The production table was audited first —
21 users, no case collisions, one legacy address with capitals — so no data
migration was needed; the lookup handles that row.

`findUserByEmail` deliberately falls back to raw SQL (`lower("email") = $1`).
Prisma's `mode: "insensitive"` compiles to `ILIKE`, which treats `%` and `_` in
the *submitted* address as wildcards. Since `_` is legal in a real mailbox, a
lookalike address could otherwise be matched to someone else's account — and
`/api/forgot-password` mails the code to the submitted string while resetting
the matched user, which would have been an account takeover. Covered by a test.

### 2. HIGH — No email-format validation anywhere

`ui-no-at-1792518137092` (no `@`) passed the sign-up form and created an
account that can never be verified or recovered. The `<input type="email">`
never fires native validation because the button submits through
`handleSubmit(onSubmit)` rather than a form submit, and react-hook-form only
checked `required`.

Fixed with a Zod schema in `/api/register` and `lib/emailFormat.ts` wired into
the sign-up, login and forgot-password fields.

### 3. MEDIUM — A missing field returned 500

`POST /api/register` without `email` (or `name`) reached Prisma and threw; the
client showed "Something went wrong." The Zod schema now returns 400 with the
offending field's message.

### 4. MEDIUM — `forgot-password` and `resend` leaked which emails have accounts

Both routes returned `ok` for unknown addresses but **500** when the address
existed and the mail transport failed, so any Resend outage or quota exhaustion
turned them into account-enumeration oracles. They now log the failure and
return `ok` on both branches, as `/api/register` already did.

### 5. MEDIUM — No rate limiting on any auth endpoint

12 back-to-back registrations all succeeded, and so did 12 back-to-back
resends — and the 30-second resend cooldown was client state only, so the
six-attempt code lockout could be reset indefinitely and a 6-digit code
brute-forced.

`lib/rateLimit.ts` adds fixed-window budgets to register, verify-email, resend,
forgot-password, reset-password and the credentials login. Login is throttled
per caller **and** per caller+address rather than per address alone, so an
attacker cannot lock a victim out of their own account from elsewhere. The
counters are per serverless instance — enough to stop scripted abuse, not a
substitute for a shared-store or edge limiter if abuse becomes real.

### 6. LOW — One code row served two purposes

`EmailVerificationCode` is keyed by email, so a signup code and a reset code
shared a row and a signup code was accepted by `/api/reset-password`. The
purpose is now folded into the hashed payload (`signup:123456`), which separates
the two without a schema migration. Codes issued before this change stop
validating — users mid-flow need to hit "Resend" once.

## Known, intentional behaviour

An unverified account can still sign in. The guard is deliberately off: every
account created before email verification shipped has `emailVerified = null`
and would be locked out. A test documents this so it is not "fixed" by accident.
