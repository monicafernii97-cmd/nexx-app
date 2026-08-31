import type { Page, TestInfo } from "@playwright/test";
import { cleanupSyntheticRun, registerSyntheticRun } from "./convex";
import { signInRobot, uploadE2EEnvironment } from "./environment";

export async function beginSyntheticRun(page: Page, testInfo: TestInfo) {
  // Reserve cleanup headroom before any long-running upload or generation work.
  // Extending the timeout only inside finally is too late once Playwright has
  // already cancelled the test body.
  testInfo.setTimeout(
    Math.max(testInfo.timeout + 2 * 60 * 1000, 8 * 60 * 1000),
  );
  const environment = uploadE2EEnvironment(testInfo);
  await signInRobot(page, environment.ownerEmail);
  await registerSyntheticRun(page, {
    runId: environment.runId,
    lane: environment.lane,
    environment: environment.production
      ? "production"
      : environment.lane === "resilience"
        ? "staging"
        : "preview",
  });
  return environment;
}

export async function finishSyntheticRun(
  page: Page,
  testInfo: TestInfo,
  runId: string,
) {
  try {
    await cleanupSyntheticRun(page, runId);
  } catch (error) {
    await testInfo.attach("cleanup-failure", {
      body: Buffer.from(
        JSON.stringify(
          {
            runId,
            error:
              error instanceof Error ? error.message : "Unknown cleanup error",
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });
    throw error;
  }
}
