import { test } from "@playwright/test";
import { cleanupSyntheticRun } from "../support/convex";
import { signInRobot, uploadE2EEnvironment } from "../support/environment";

test("manually clean a durable synthetic upload run", async ({
  page,
}, testInfo) => {
  const environment = uploadE2EEnvironment(testInfo);
  if (!process.env.E2E_RUN_ID)
    throw new Error("E2E_RUN_ID is required for manual cleanup.");
  await signInRobot(page, environment.ownerEmail);
  await cleanupSyntheticRun(page, environment.runId);
});
