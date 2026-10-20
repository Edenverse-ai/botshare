import { APIRequestContext, expect, test } from "@playwright/test";
import { GOOD_PASSWORD, db, freshEmail } from "./localDb";
import { cleanup, freshIp, plantCode } from "./helpers";

const registerBody = (email: string) => ({
  email,
  name: "Auth Test",
  password: GOOD_PASSWORD,
  userType: "CUSTOMER",
  termsVersion: "2026-01-01",
});

/** Signs in with the credentials provider and returns the resulting session. */
async function signIn(
  request: APIRequestContext,
  email: string,
  password: string,
  headers: Record<string, string> = freshIp()
) {
  const csrf = await (await request.get("/api/auth/csrf", { headers })).json();
  await request.post("/api/auth/callback/credentials", {
    headers,
    form: { email, password, csrfToken: csrf.csrfToken, json: "true" },
  });
  return (await (await request.get("/api/auth/session", { headers })).json()) as {
    user?: { email?: string };
  };
}

test.afterAll(async () => {
  await db.$disconnect();
});

test("registers a customer, verifies the code, and signs in with credentials", async ({
  request,
}) => {
  const email = freshEmail("happy");
  try {
    const created = await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(email),
    });
    expect(created.status()).toBe(200);

    const user = await db.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBeNull();

    const code = await plantCode(email);
    const verified = await request.post("/api/verify-email", {
      headers: freshIp(),
      data: { email, code },
    });
    expect(verified.status()).toBe(200);
    expect((await db.user.findUnique({ where: { email } }))?.emailVerified).not.toBeNull();

    const session = await signIn(request, email, GOOD_PASSWORD);
    expect(session?.user?.email).toBe(email);
  } finally {
    await cleanup(email);
  }
});

test("rejects a duplicate email with 409", async ({ request }) => {
  const email = freshEmail("dupe");
  try {
    expect(
      (await request.post("/api/register", { headers: freshIp(), data: registerBody(email) })).status()
    ).toBe(200);
    const again = await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(email),
    });
    expect(again.status()).toBe(409);
  } finally {
    await cleanup(email);
  }
});

test("enforces the password policy server-side", async ({ request }) => {
  const email = freshEmail("weak");
  try {
    const res = await request.post("/api/register", {
      headers: freshIp(),
      data: { ...registerBody(email), password: "robots" },
    });
    expect(res.status()).toBe(400);
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  } finally {
    await cleanup(email);
  }
});

test("login ignores the case of the email address", async ({ request }) => {
  const email = freshEmail("case").toLowerCase();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const session = await signIn(request, email.toUpperCase(), GOOD_PASSWORD);
    expect(session?.user?.email).toBe(email);
  } finally {
    await cleanup(email);
  }
});

test("login finds an account stored with capital letters", async ({ request }) => {
  // Accounts created before normalization existed are still stored as typed.
  const stored = `Legacy-Mixed-${Date.now()}@Example.test`;
  try {
    await db.user.create({
      data: {
        email: stored,
        name: "Legacy",
        hashedPassword: await (await import("bcryptjs")).default.hash(GOOD_PASSWORD, 10),
        emailVerified: new Date(),
      },
    });
    const session = await signIn(request, stored.toLowerCase(), GOOD_PASSWORD);
    expect(session?.user?.email).toBe(stored);
  } finally {
    await cleanup(stored);
  }
});

test("the same mailbox cannot register twice with different casing", async ({ request }) => {
  const lower = freshEmail("twin").toLowerCase();
  const upper = lower.toUpperCase();
  try {
    expect(
      (await request.post("/api/register", { headers: freshIp(), data: registerBody(lower) })).status()
    ).toBe(200);
    const second = await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(upper),
    });
    expect(second.status()).toBe(409);
  } finally {
    await cleanup(lower, upper);
  }
});

test("stores the email address normalized", async ({ request }) => {
  const email = freshEmail("norm").toLowerCase();
  try {
    await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(`  ${email.toUpperCase()} `),
    });
    expect(await db.user.findUnique({ where: { email } })).not.toBeNull();
  } finally {
    await cleanup(email);
  }
});

test("rejects a string that is not an email address", async ({ request }) => {
  const notAnEmail = `not-an-email-${Date.now()}`;
  try {
    const res = await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(notAnEmail),
    });
    expect(res.status()).toBe(400);
    expect(await db.user.findUnique({ where: { email: notAnEmail } })).toBeNull();
  } finally {
    await cleanup(notAnEmail);
  }
});

test("rejects a registration with a missing email or username", async ({ request }) => {
  const noEmail = await request.post("/api/register", {
    headers: freshIp(),
    data: { name: "x", password: GOOD_PASSWORD, userType: "CUSTOMER", termsVersion: "v1" },
  });
  expect(noEmail.status()).toBe(400);

  const noName = await request.post("/api/register", {
    headers: freshIp(),
    data: {
      email: freshEmail("noname"),
      password: GOOD_PASSWORD,
      userType: "CUSTOMER",
      termsVersion: "v1",
    },
  });
  expect(noName.status()).toBe(400);
});

test("an untrimmed email does not create a second account", async ({ request }) => {
  const email = freshEmail("space").toLowerCase();
  try {
    expect(
      (await request.post("/api/register", { headers: freshIp(), data: registerBody(email) })).status()
    ).toBe(200);
    const second = await request.post("/api/register", {
      headers: freshIp(),
      data: registerBody(`  ${email} `),
    });
    expect(second.status()).toBe(409);
  } finally {
    await cleanup(email);
  }
});

test("forgot-password reaches an account stored with capital letters", async ({ request }) => {
  const stored = `Legacy-Reset-${Date.now()}@Example.test`;
  try {
    await db.user.create({
      data: {
        email: stored,
        name: "Legacy",
        hashedPassword: await (await import("bcryptjs")).default.hash(GOOD_PASSWORD, 10),
      },
    });
    const forgot = await request.post("/api/forgot-password", {
      headers: freshIp(),
      data: { email: stored },
    });
    expect(forgot.status()).toBe(200);
    const code = await db.emailVerificationCode.findUnique({
      where: { email: stored.toLowerCase() },
    });
    expect(code, "a reset code should have been issued for this account").not.toBeNull();
  } finally {
    await cleanup(stored);
  }
});

test("forgot-password answers the same whether or not the account exists", async ({ request }) => {
  const email = freshEmail("oracle").toLowerCase();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const known = await request.post("/api/forgot-password", {
      headers: freshIp(),
      data: { email },
    });
    const unknown = await request.post("/api/forgot-password", {
      headers: freshIp(),
      data: { email: `no-such-account-${Date.now()}@example.test` },
    });
    // Email delivery is disabled locally, so this also covers the transport-
    // failure branch that used to answer 500 for known addresses only.
    expect(known.status(), "known address").toBe(unknown.status());
    expect(await known.json()).toEqual(await unknown.json());
  } finally {
    await cleanup(email);
  }
});

test("locks out after six wrong verification codes", async ({ request }) => {
  const email = freshEmail("lockout");
  const headers = freshIp();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    await plantCode(email, "123456");
    for (let i = 0; i < 6; i++) {
      const res = await request.post("/api/verify-email", {
        headers,
        data: { email, code: "000000" },
      });
      expect(res.status()).toBe(400);
    }
    const blocked = await request.post("/api/verify-email", {
      headers,
      data: { email, code: "123456" },
    });
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).error).toContain("Too many attempts");
    expect((await db.user.findUnique({ where: { email } }))?.emailVerified).toBeNull();
  } finally {
    await cleanup(email);
  }
});

test("throttles resend so the attempt lockout cannot be reset at will", async ({ request }) => {
  const email = freshEmail("resend");
  const headers = freshIp();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request.post("/api/verify-email/resend", { headers, data: { email } });
      statuses.push(res.status());
    }
    expect(statuses).toContain(429);
  } finally {
    await cleanup(email);
  }
});

test("throttles a burst of registrations from one caller", async ({ request }) => {
  const emails = Array.from({ length: 12 }, (_, i) => freshEmail(`flood${i}`));
  const headers = freshIp();
  try {
    const statuses: number[] = [];
    for (const email of emails) {
      statuses.push(
        (await request.post("/api/register", { headers, data: registerBody(email) })).status()
      );
    }
    expect(statuses).toContain(429);
  } finally {
    await cleanup(...emails);
  }
});

test("throttles repeated failed logins", async ({ request }) => {
  const email = freshEmail("bruteforce").toLowerCase();
  const headers = freshIp();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    for (let i = 0; i < 8; i++) {
      await signIn(request, email, "WrongPass1", headers);
    }
    // The budget is spent, so even the right password is refused for a while.
    const session = await signIn(request, email, GOOD_PASSWORD, headers);
    expect(session?.user).toBeFalsy();
    // ...but only for this caller: another address still gets in.
    const other = await signIn(request, email, GOOD_PASSWORD);
    expect(other?.user?.email).toBe(email);
  } finally {
    await cleanup(email);
  }
});

test("documents that an unverified account can still sign in (intentional)", async ({
  request,
}) => {
  const email = freshEmail("unverified");
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const session = await signIn(request, email, GOOD_PASSWORD);
    expect(session?.user?.email).toBe(email);
    expect((await db.user.findUnique({ where: { email } }))?.emailVerified).toBeNull();
  } finally {
    await cleanup(email);
  }
});

test("resets a password with an emailed code and signs in with the new one", async ({
  request,
}) => {
  const email = freshEmail("reset").toLowerCase();
  const newPassword = "Reset2026x";
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const code = await plantCode(email, "654321", "reset");
    const reset = await request.post("/api/reset-password", {
      headers: freshIp(),
      data: { email, code, password: newPassword },
    });
    expect(reset.status()).toBe(200);

    const session = await signIn(request, email, newPassword);
    expect(session?.user?.email).toBe(email);
  } finally {
    await cleanup(email);
  }
});

test("the old password stops working after a reset", async ({ request }) => {
  const email = freshEmail("oldpw").toLowerCase();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    await plantCode(email, "111111", "reset");
    await request.post("/api/reset-password", {
      headers: freshIp(),
      data: { email, code: "111111", password: "Another2026" },
    });
    const session = await signIn(request, email, GOOD_PASSWORD);
    expect(session?.user).toBeFalsy();
  } finally {
    await cleanup(email);
  }
});

test("a signup code is not accepted as a password-reset token", async ({ request }) => {
  const email = freshEmail("crosstoken").toLowerCase();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    const code = await plantCode(email, "222222", "signup");
    const reset = await request.post("/api/reset-password", {
      headers: freshIp(),
      data: { email, code, password: "Hijacked2026" },
    });
    expect(reset.status()).toBe(400);
    const session = await signIn(request, email, "Hijacked2026");
    expect(session?.user).toBeFalsy();
  } finally {
    await cleanup(email);
  }
});

test("a reset code is not accepted as a signup verification code", async ({ request }) => {
  const email = freshEmail("crossverify").toLowerCase();
  try {
    await request.post("/api/register", { headers: freshIp(), data: registerBody(email) });
    await plantCode(email, "333333", "reset");
    const verify = await request.post("/api/verify-email", {
      headers: freshIp(),
      data: { email, code: "333333" },
    });
    expect(verify.status()).toBe(400);
    expect((await db.user.findUnique({ where: { email } }))?.emailVerified).toBeNull();
  } finally {
    await cleanup(email);
  }
});

test("an address containing SQL LIKE wildcards cannot match another account", async ({
  request,
}) => {
  const victim = `wildcard-victim-${Date.now()}@example.test`;
  // Same length as the victim's address, with one character replaced by "_" —
  // a legal character in a real mailbox, and a single-character wildcard to
  // ILIKE. The case-insensitive lookup must not treat it as a pattern.
  const lookalike = victim.replace("wildcard-", "wildcar_-");
  try {
    await db.user.create({
      data: {
        email: victim,
        name: "Victim",
        hashedPassword: await (await import("bcryptjs")).default.hash(GOOD_PASSWORD, 10),
        emailVerified: new Date(),
      },
    });

    const session = await signIn(request, lookalike, GOOD_PASSWORD);
    expect(session?.user).toBeFalsy();

    const forgot = await request.post("/api/forgot-password", {
      headers: freshIp(),
      data: { email: lookalike },
    });
    expect(forgot.status()).toBe(200);
    expect(
      await db.emailVerificationCode.findUnique({ where: { email: lookalike } }),
      "no reset code should be issued for a lookalike address"
    ).toBeNull();
  } finally {
    await cleanup(victim, lookalike);
  }
});
