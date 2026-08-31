import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import {
  expectPlainLanguageValidation,
  observeUploadTransport,
  selectUploadFile,
  uploadAndSend,
} from "../support/upload-journey";

test("signed-in user can select, remove, replace, upload, and send a synthetic file", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const manifest = ensureUploadFixtures(environment.runId, "pr");
  const transport = {
    runId: environment.runId,
    fixture: "selection-only",
    byteSize: 0,
    directRequests: 0,
    resumableChunkRequests: 0,
    completionRequests: 0,
    requestBytes: 0,
  };
  const stopObserving = observeUploadTransport(page, transport);
  try {
    await selectUploadFile(page, manifest.fixtures["small-20k"].path);
    await expect(page.getByTestId("chat-upload-status")).toContainText(
      /selected|ready to upload/i,
    );
    await expect(page.getByTestId("chat-upload-remove")).toBeVisible();
    expect(transport.directRequests + transport.resumableChunkRequests).toBe(0);

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="chat-upload-selected"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByTestId("chat-upload-remove").click();
    await expect(page.getByTestId("chat-upload-selected")).toBeHidden();
    await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: manifest.fixtures["small-20k"].path,
      byteSize: manifest.fixtures["small-20k"].byteSize,
      prompt:
        "Confirm that you received this synthetic test document in one short sentence.",
    });
  } finally {
    stopObserving();
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("unsupported files are rejected before any network upload", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const manifest = ensureUploadFixtures(environment.runId, "pr");
  try {
    await page
      .getByTestId("chat-upload-input")
      .setInputFiles(manifest.fixtures.unsupported.path);
    await expectPlainLanguageValidation(page, /unsupported file type/i);
    await expect(page.getByTestId("chat-upload-selected")).toBeHidden();
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});
