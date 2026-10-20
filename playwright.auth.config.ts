import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth",
  outputDir: "./.auth-test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run registry:dev",
    url: "http://localhost:3100/",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
