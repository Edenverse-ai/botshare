import { Page, expect, test } from "@playwright/test";
import { GOOD_PASSWORD, db, freshEmail } from "./localDb";
import { cleanup, plantCode } from "./helpers";

async function openUserMenu(page: Page) {
  await page.goto("/");
  await page.locator('img[alt="Avatar"]').first().click();
}

async function openSignUp(page: Page) {
  await openUserMenu(page);
  await page.getByText("Sign up", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "How will you use Hifivebot?" })).toBeVisible();
}

async function fillCode(page: Page, code: string) {
  for (let i = 0; i < code.length; i++) {
    await page.getByLabel(`Digit ${i + 1}`).fill(code[i]);
  }
}

test.afterAll(async () => {
  await db.$disconnect();
});

test("signs up, verifies the email and logs in through the modals", async ({ page }) => {
  const email = freshEmail("ui").toLowerCase();
  try {
    await openSignUp(page);
    await page.getByRole("button", { name: /Rent robots/ }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.locator("#email").fill(email);
    await page.locator("#name").fill("UI Test");
    await page.locator("#password").fill(GOOD_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    const code = await plantCode(email, "135790");
    await fillCode(page, code);
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();

    await page.getByRole("button", { name: "Continue to Hifivebot" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Logged in successfully.")).toBeVisible();
    // The browser now holds a real session cookie for this account.
    const session = await (await page.request.get("/api/auth/session")).json();
    expect(session?.user?.email).toBe(email);
  } finally {
    await cleanup(email);
  }
});

test("shows an error for a wrong password", async ({ page }) => {
  const email = freshEmail("badpw").toLowerCase();
  try {
    await db.user.create({ data: { email, name: "x" } });
    await openUserMenu(page);
    await page.getByText("Login", { exact: true }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("WrongPass1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  } finally {
    await cleanup(email);
  }
});

test("the sign-up form rejects an email address with no @", async ({ page }) => {
  const notAnEmail = `ui-no-at-${Date.now()}`;
  try {
    await openSignUp(page);
    await page.getByRole("button", { name: /Rent robots/ }).click();
    await page.locator("#email").fill(notAnEmail);
    await page.locator("#name").fill("UI Test");
    await page.locator("#password").fill(GOOD_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    // The form stays on step 2 with an inline message and creates no account.
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    expect(await db.user.findUnique({ where: { email: notAnEmail } })).toBeNull();
  } finally {
    await cleanup(notAnEmail);
  }
});

test("a user who types their email in a different case can still log in", async ({ page }) => {
  const email = freshEmail("uicase").toLowerCase();
  try {
    await db.user.create({
      data: {
        email,
        name: "x",
        hashedPassword: (await import("bcryptjs")).default.hashSync(GOOD_PASSWORD, 10),
        emailVerified: new Date(),
      },
    });
    await openUserMenu(page);
    await page.getByText("Login", { exact: true }).click();
    await page.locator("#email").fill(email.toUpperCase());
    await page.locator("#password").fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Logged in successfully.")).toBeVisible();
  } finally {
    await cleanup(email);
  }
});

test("tells the user when they have made too many login attempts", async ({ page }) => {
  const email = freshEmail("uithrottle").toLowerCase();
  try {
    await db.user.create({
      data: {
        email,
        name: "x",
        hashedPassword: (await import("bcryptjs")).default.hashSync(GOOD_PASSWORD, 10),
        emailVerified: new Date(),
      },
    });
    await openUserMenu(page);
    await page.getByText("Login", { exact: true }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("WrongPass1");
    for (let i = 0; i < 9; i++) {
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
    }
    await expect(
      page.getByText("Too many attempts. Please wait a few minutes and try again.")
    ).toBeVisible();
  } finally {
    await cleanup(email);
  }
});
