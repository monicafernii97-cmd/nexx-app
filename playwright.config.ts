import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const rootDir = process.cwd();
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const captureTrace = process.env.E2E_CAPTURE_TRACE === "true";
const startLocalServer = process.env.E2E_START_LOCAL_SERVER === "true";

export default defineConfig({
  testDir: path.join(rootDir, "e2e"),
  outputDir: path.join(rootDir, "test-results"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 4 * 60 * 1000,
  expect: { timeout: 30_000 },
  reporter: [
    ["line"],
    [
      "./e2e/support/upload-reporter.ts",
      { outputFile: "playwright-report/upload-e2e-summary.json" },
    ],
    ["html", { outputFolder: "playwright-report/html", open: "never" }],
  ],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    screenshot: "off",
    video: "off",
    trace: captureTrace ? "retain-on-failure" : "off",
    serviceWorkers: "block",
  },
  webServer: startLocalServer
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "clerk-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "upload-pr",
      testMatch: /upload-pr\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-release",
      testMatch: /upload-release\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "executive-chat-release",
      testMatch: /executive-chat-continuity\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-production",
      testMatch: /upload-production\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-weekly-chromium",
      testMatch: /upload-(weekly|security|performance)\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-weekly-firefox",
      testMatch: /upload-weekly\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "upload-weekly-webkit",
      testMatch: /upload-weekly\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "upload-weekly-mobile",
      testMatch: /upload-weekly\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "upload-resilience",
      testMatch: /upload-resilience\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "upload-cleanup",
      testMatch: /upload-cleanup\.spec\.ts/,
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
