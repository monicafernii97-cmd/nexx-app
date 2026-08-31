import { expect, test } from "@playwright/test";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import { inspectSyntheticRunUpload } from "../support/convex";
import { uploadAndSend } from "../support/upload-journey";

test("release candidate completes a real 1 MiB PDF journey", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "release").fixtures[
    "release-1m"
  ];
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "State the title shown in this synthetic test PDF.",
    });
    expect(metrics.attachmentReadyMs).toBeLessThan(4 * 60 * 1000);
    const durable = await inspectSyntheticRunUpload(page, environment.runId);
    expect(durable.sessionCount).toBe(1);
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
