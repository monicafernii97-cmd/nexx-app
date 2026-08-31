import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import {
  expectPlainLanguageValidation,
  selectUploadFile,
  uploadAndSend,
} from "../support/upload-journey";

test("core upload controls work across desktop engines and mobile viewport", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "weekly").fixtures[
    "small-20k"
  ];
  try {
    await selectUploadFile(page, fixture.path);
    await expect(page.getByTestId("chat-upload-file-name")).toBeVisible();
    await expect(page.getByTestId("chat-upload-send-file")).toBeEnabled();
    const result = await new AxeBuilder({ page })
      .include('[data-testid="chat-upload-selected"]')
      .analyze();
    expect(result.violations).toEqual([]);
    await page.getByTestId("chat-upload-remove").click();
    await expect(page.getByTestId("chat-upload-selected")).toBeHidden();
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("maximum-size, corrupt, and oversized documents fail or succeed honestly", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "upload-weekly-chromium",
    "Heavy boundary coverage runs once in desktop Chromium.",
  );
  const environment = await beginSyntheticRun(page, testInfo);
  const fixtures = ensureUploadFixtures(environment.runId, "weekly").fixtures;
  try {
    await page
      .getByTestId("chat-upload-input")
      .setInputFiles(fixtures["oversize-25m"].path);
    await expectPlainLanguageValidation(page, /maximum size is 25mb/i);

    await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixtures["maximum-24m"].path,
      byteSize: fixtures["maximum-24m"].byteSize,
      prompt: "Acknowledge this synthetic maximum-size upload.",
      waitForAssistant: false,
    });
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("a corrupt PDF is rejected without being labeled usable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "upload-weekly-chromium",
    "Processing failure coverage runs once in desktop Chromium.",
  );
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "weekly").fixtures[
    "corrupt-pdf"
  ];
  try {
    await selectUploadFile(page, fixture.path);
    await page.getByTestId("chat-upload-send-file").click();
    await expect(page.getByTestId("chat-upload-error")).toBeVisible({
      timeout: 4 * 60 * 1000,
    });
    await expect(page.getByTestId("chat-upload-selected")).toHaveAttribute(
      "data-upload-status",
      /failed|blocked|quarantined|empty/,
    );
    await expect(page.getByTestId("chat-message-attachment")).toHaveCount(0);
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("full-document retrieval covers beginning, middle, and end of a long legal-style PDF", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "upload-weekly-chromium",
    "Full-document coverage runs once in desktop Chromium.",
  );
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "weekly").fixtures[
    "legal-coverage"
  ];
  try {
    await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt:
        "What exact verification token is written on pages 1, 50, and 100 of the document? Quote each token with its page number.",
    });
    const response = page.getByTestId("chat-message-assistant").last();
    for (const token of fixture.tokens ?? [])
      await expect(response).toContainText(token, { timeout: 30_000 });
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});
