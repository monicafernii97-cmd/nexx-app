import { expect, test } from "@playwright/test";
import { beginSyntheticRun, finishSyntheticRun } from "../support/lifecycle";
import { ensureUploadFixtures } from "../support/files";
import { inspectSyntheticRunUpload } from "../support/convex";
import { uploadAndSend } from "../support/upload-journey";

test("a blocked direct upload automatically recovers through resumable storage", async ({
  page,
}, testInfo) => {
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /cors|access-control|failed to fetch|networkerror/i.test(message.text())
    ) {
      console.log(
        JSON.stringify({
          event: "upload_e2e_browser_error",
          message: message.text().replace(/https?:\/\/\S+/g, "[url]"),
        }),
      );
    }
  });
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "resilience")
    .fixtures["release-1m"];
  let blocked = false;
  await page.route(/\/api\/storage\/upload/i, async (route) => {
    if (!blocked) {
      blocked = true;
      await route.abort("connectionfailed");
      return;
    }
    await route.continue();
  });
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "Acknowledge this synthetic direct-route recovery test.",
      waitForAssistant: false,
    });
    expect(blocked).toBe(true);
    expect(metrics.resumableChunkRequests).toBeGreaterThan(0);
    const durable = await inspectSyntheticRunUpload(page, environment.runId);
    expect(
      durable.statuses.some(
        (status) => status === "ready" || status === "partial",
      ),
    ).toBe(true);
    expect(durable.files[0]?.safeForChat).toBe(true);
    expect(durable.transports).toContain("resumable");
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("one interrupted chunk retries without restarting the entire upload", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "resilience")
    .fixtures["medium-10m"];
  let directBlocked = false;
  let chunkBlocked = false;
  await page.route(/\/api\/storage\/upload/i, async (route) => {
    directBlocked = true;
    await route.abort("connectionfailed");
  });
  await page.route(/chat-upload-resumable-chunk/i, async (route) => {
    if (!chunkBlocked) {
      chunkBlocked = true;
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "Acknowledge this synthetic chunk recovery test.",
      waitForAssistant: false,
    });
    expect(directBlocked && chunkBlocked).toBe(true);
    expect(metrics.resumableChunkRequests).toBeGreaterThan(1);
    expect(metrics.requestBytes).toBeLessThan(fixture.byteSize * 1.6);
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("a lost resumable completion response reconciles without uploading again", async ({
  page,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "resilience")
    .fixtures["release-1m"];
  let completionLost = false;
  await page.route(/\/api\/storage\/upload/i, (route) =>
    route.abort("connectionfailed"),
  );
  await page.route(/chat-upload-resumable-complete/i, async (route) => {
    if (completionLost) {
      await route.continue();
      return;
    }
    const upstream = await route.fetch();
    if (!upstream.ok())
      throw new Error(
        `Synthetic completion upstream returned ${upstream.status()}.`,
      );
    completionLost = true;
    await route.abort("connectionreset");
  });
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "Acknowledge this synthetic response reconciliation test.",
      waitForAssistant: false,
    });
    expect(completionLost).toBe(true);
    expect(metrics.completionRequests).toBe(1);
    const durable = await inspectSyntheticRunUpload(page, environment.runId);
    expect(durable.files[0]?.safeForChat).toBe(true);
  } finally {
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});

test("a constrained connection keeps the composer responsive and reports progress", async ({
  page,
  context,
}, testInfo) => {
  const environment = await beginSyntheticRun(page, testInfo);
  const fixture = ensureUploadFixtures(environment.runId, "resilience")
    .fixtures["release-1m"];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 180,
    downloadThroughput: 2 * 1024 * 1024,
    uploadThroughput: 512 * 1024,
    connectionType: "cellular3g",
  });
  try {
    const metrics = await uploadAndSend({
      page,
      testInfo,
      runId: environment.runId,
      filePath: fixture.path,
      byteSize: fixture.byteSize,
      prompt: "Acknowledge this synthetic constrained-network test.",
      waitForAssistant: false,
    });
    expect(metrics.attachmentReadyMs).toBeLessThan(5 * 60 * 1000);
    await expect(page.getByTestId("chat-composer")).toBeEditable();
  } finally {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "none",
    });
    await finishSyntheticRun(page, testInfo, environment.runId);
  }
});
