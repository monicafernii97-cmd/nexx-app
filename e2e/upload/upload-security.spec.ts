import { expect, test } from "@playwright/test";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import { inspectSyntheticRunUpload } from "../support/convex";
import { signInRobot } from "../support/environment";
import { uploadAndSend } from "../support/upload-journey";

test("another signed-in user cannot retrieve the owner robot upload", async ({
  page,
  browser,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "Cross-account isolation runs once in Chromium.",
  );
  test.skip(
    !process.env.E2E_OUTSIDER_EMAIL,
    "E2E_OUTSIDER_EMAIL is required for isolation coverage.",
  );
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "weekly").fixtures[
    "small-20k"
  ];
  let outsiderPage: import("@playwright/test").Page | undefined;
  try {
    await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "Acknowledge this synthetic isolation test file.",
      waitForAssistant: false,
    });
    const durable = await inspectSyntheticRunUpload(page, environment.runId);
    expect(durable.uploadedFileIds).toHaveLength(1);

    outsiderPage = await browser.newPage();
    await signInRobot(outsiderPage, environment.outsiderEmail!);
    const response = await outsiderPage.request.get(
      `/api/documents/source/${durable.uploadedFileIds[0]}`,
    );
    expect([401, 404]).toContain(response.status());

    const ownerResponse = await page.request.get(
      `/api/documents/source/${durable.uploadedFileIds[0]}`,
    );
    expect(ownerResponse.status()).toBe(200);
  } finally {
    await outsiderPage?.close();
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});
