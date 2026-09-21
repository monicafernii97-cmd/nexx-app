import { defineConfig, devices } from "@playwright/test";
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI injects environment. */
}
export default defineConfig({
  testDir: "./e2e/exhibits",
  timeout: 180000,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: "output/exhibit-browser",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3012",
    screenshot: "only-on-failure",
  },
});
