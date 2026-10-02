import { test, expect, APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
  "base64",
);
async function authenticate(request: APIRequestContext, email: string) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  const result = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email,
      password: "Registry-local-demo-2026!",
      json: "true",
    },
  });
  expect(result.ok()).toBeTruthy();
  expect(
    (await (await request.get("/api/auth/session")).json()).user.email,
  ).toBe(email);
}

test("admin can register, scan, log, correct and retire through the website", async ({
  page,
  context,
}) => {
  await page.goto("/admin/robots");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("admin@registry.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Registry-local-demo-2026!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New draft", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New draft", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Robot model", exact: true })
    .selectOption({ label: "AGIBOT X2" });
  const serial = `TEST-BROWSER-${randomUUID()}`;
  await page.getByLabel("Manufacturer serial number").fill(serial);
  await page.getByLabel("Private location").fill("Browser test workshop");
  const creation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/registry/robots") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const robot = await (await creation).json();
  const upload = page.locator("form").filter({
    has: page.getByRole("button", { name: "Upload evidence", exact: true }),
  });
  await upload.getByLabel("Photo or PDF", { exact: false }).setInputFiles({
    name: "test-nameplate.png",
    mimeType: "image/png",
    buffer: png,
  });
  await upload
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "test-nameplate.png", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Private nameplate image", exact: true })
    .selectOption({ label: "test-nameplate.png" });
  await page
    .getByLabel("I confirm the recorded owner", { exact: false })
    .check();
  // A checkbox checked against the previous owner/version must not carry over
  // when the internal passport is refreshed after an identity edit.
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page
    .getByLabel("Owner", { exact: true })
    .fill("Corrected local test owner");
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Review changed draft owner");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByLabel("I confirm the recorded owner", { exact: false }),
  ).not.toBeChecked();
  await page
    .getByRole("combobox", { name: "Private nameplate image", exact: true })
    .selectOption({ label: "test-nameplate.png" });
  await page
    .getByLabel("I confirm the recorded owner", { exact: false })
    .check();
  const registration = page.waitForResponse(
    (r) => r.url().endsWith("/register") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Register permanent Robot ID" })
    .click();
  const registered = await (await registration).json();
  expect(registered.publicId).toMatch(/^HFB-RB-\d{6}$/);
  await page.getByRole("button", { name: "Preview printable label" }).click();
  await expect(
    page.getByAltText(`QR code for ${registered.publicId}`),
  ).toBeVisible();
  const anonymous = await context
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await anonymous.newPage();
  await mobile.goto(`/robot-passports/${registered.publicId}`);
  await expect(
    mobile.getByRole("heading", { name: registered.publicId, exact: true }),
  ).toBeVisible();
  expect(
    await mobile.evaluate(() => document.documentElement.scrollWidth),
  ).toBe(390);
  await expect(
    mobile.getByText("Browser test workshop", { exact: true }),
  ).toHaveCount(0);
  await mobile.screenshot({
    path: ".registry-test-results/registry-mobile-passport.png",
    fullPage: true,
  });
  await anonymous.close();
  await page
    .getByRole("link", {
      name: `http://localhost:3100/robot-passports/${registered.publicId}`,
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Administrator access" }).click();
  await expect(page.getByText(`S/N ${serial}`, { exact: false })).toBeVisible();

  await page.getByLabel("Start time", { exact: true }).fill("2026-09-01T09:00");
  await page.getByLabel("End time", { exact: true }).fill("2026-09-01T10:00");
  await page.getByLabel("Purpose", { exact: true }).fill("Browser rehearsal");
  await page
    .getByLabel("Actual operator", { exact: true })
    .fill("Demo operator");
  await page.getByLabel("Outcome", { exact: true }).fill("Completed");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("Browser rehearsal", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Correct record", exact: true })
    .click();
  await page
    .getByLabel("Outcome", { exact: true })
    .fill("Completed with correction");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("Add outcome detail");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("Completed with correction", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Record type", exact: true })
    .selectOption("DAMAGE");
  await page.getByLabel("Event time", { exact: true }).fill("2026-09-02T09:00");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Simulated joint fault");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("Simulated joint fault", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Record type", exact: true })
    .selectOption("MAINTENANCE");
  await page.getByLabel("Event time", { exact: true }).fill("2026-09-02T10:00");
  await page.getByLabel("Work performed", { exact: true }).fill("Simulated repair");
  await page.getByLabel("Technician", { exact: true }).fill("Demo technician");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(
    page.getByText("Simulated repair", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Inspector", { exact: true }).fill("Demo inspector");
  await page
    .getByLabel("Inspection time (your local timezone)", { exact: true })
    .fill("2026-09-02T11:00");
  await page
    .getByRole("combobox", { name: "Result", exact: true })
    .selectOption("true");
  await page
    .getByLabel("Inspection notes", { exact: true })
    .fill("Simulated check passed");
  await page
    .getByRole("button", { name: "Save inspection", exact: true })
    .click();
  await expect(page.getByText("Ready for use", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Private location", { exact: true }),
  ).toHaveCount(1);
  await page.getByText("Retire this robot", { exact: true }).click();
  await page
    .getByLabel("Retirement reason", { exact: true })
    .fill("End of browser demonstration");
  await page
    .getByLabel(`Confirm retirement of ${registered.publicId}`, { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Retire robot and retain history" })
    .click();
  await expect(
    page.getByText("Retired — not in active use.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: ".registry-test-results/registry-admin-history.png",
    fullPage: true,
  });
  const response = await page.request.get(`/api/registry/robots/${robot.id}`);
  expect((await response.json()).lifecycle).toBe("RETIRED");
});

test("real sessions keep customers and providers out of private registry operations", async ({
  playwright,
}) => {
  for (const role of ["customer", "provider"]) {
    const request = await playwright.request.newContext({
      baseURL: "http://localhost:3100",
    });
    await authenticate(request, `${role}@registry.test`);
    expect((await request.get("/api/registry/robots")).status()).toBe(403);
    expect(
      (
        await request.post("/api/registry/robots", {
          data: {},
          headers: { "Idempotency-Key": randomUUID() },
        })
      ).status(),
    ).toBe(403);
    await request.dispose();
  }
});
