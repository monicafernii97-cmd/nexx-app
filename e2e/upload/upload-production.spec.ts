import { expect, test } from "@playwright/test";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import { inspectSyntheticRunUpload } from "../support/convex";
import { uploadAndSend } from "../support/upload-journey";

test("daily production robot completes upload, processing, chat receipt, and cleanup", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "daily").fixtures[
    "daily-250k"
  ];
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt:
        "Acknowledge this synthetic upload canary without giving legal advice.",
    });
    expect(metrics.selectionAcknowledgedMs).toBeLessThan(2_000);
    expect(metrics.attachmentReadyMs).toBeLessThan(4 * 60 * 1000);
    const durable = await inspectSyntheticRunUpload(page, environment.runId);
    expect(
      durable.statuses.some(
        (status) => status === "ready" || status === "partial",
      ),
    ).toBe(true);
    expect(durable.uploadedFileIds).toHaveLength(1);
    expect(durable.files[0]?.safeForChat).toBe(true);
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});
