import { expect, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";

type UploadMetrics = {
  runId: string;
  fixture: string;
  byteSize: number;
  selectionAcknowledgedMs?: number;
  uploadActiveMs?: number;
  attachmentReadyMs?: number;
  assistantCompleteMs?: number;
  directRequests: number;
  resumableChunkRequests: number;
  completionRequests: number;
  requestBytes: number;
  transportFailures?: string[];
};

export function observeUploadTransport(page: Page, metrics: UploadMetrics) {
  const listener = async (request: import("@playwright/test").Request) => {
    const url = request.url();
    if (request.method() !== "POST") return;
    if (/\/api\/storage\/upload/i.test(url)) metrics.directRequests += 1;
    if (/chat-upload-resumable-chunk/i.test(url))
      metrics.resumableChunkRequests += 1;
    if (/chat-upload-resumable-complete/i.test(url))
      metrics.completionRequests += 1;
    if (!/storage|chat-upload-resumable/i.test(url)) return;
    try {
      const sizes = await request.sizes();
      metrics.requestBytes += sizes.requestBodySize;
    } catch {
      // A deliberately interrupted request may not expose final byte counts.
    }
  };
  const failedListener = (request: import("@playwright/test").Request) => {
    const url = request.url();
    if (!/\/api\/storage\/upload|chat-upload-resumable/i.test(url)) return;
    const route = /chat-upload-resumable-chunk/i.test(url)
      ? "resumable_chunk"
      : /chat-upload-resumable-complete/i.test(url)
        ? "resumable_complete"
        : "direct";
    (metrics.transportFailures ??= []).push(
      `${route}:${request.failure()?.errorText ?? "request_failed"}`,
    );
  };
  const responseListener = (response: import("@playwright/test").Response) => {
    const url = response.url();
    if (
      response.status() < 400 ||
      !/\/api\/storage\/upload|chat-upload-resumable/i.test(url)
    )
      return;
    const route = /chat-upload-resumable-chunk/i.test(url)
      ? "resumable_chunk"
      : /chat-upload-resumable-complete/i.test(url)
        ? "resumable_complete"
        : "direct";
    (metrics.transportFailures ??= []).push(
      `${route}:http_${response.status()}`,
    );
  };
  page.on("requestfinished", listener);
  page.on("requestfailed", listener);
  page.on("requestfailed", failedListener);
  page.on("response", responseListener);
  return () => {
    page.off("requestfinished", listener);
    page.off("requestfailed", listener);
    page.off("requestfailed", failedListener);
    page.off("response", responseListener);
  };
}

export async function selectUploadFile(page: Page, filePath: string) {
  const startedAt = performance.now();
  await page.getByTestId("chat-upload-input").setInputFiles(filePath);
  await expect(page.getByTestId("chat-upload-selected")).toBeVisible();
  await expect(page.getByTestId("chat-upload-file-name")).toHaveText(
    path.basename(filePath),
  );
  return performance.now() - startedAt;
}

export async function uploadAndSend(args: {
  page: Page;
  testInfo: TestInfo;
  runId: string;
  filePath: string;
  byteSize: number;
  prompt?: string;
  waitForAssistant?: boolean;
}) {
  const metrics: UploadMetrics = {
    runId: args.runId,
    fixture: path.basename(args.filePath),
    byteSize: args.byteSize,
    directRequests: 0,
    resumableChunkRequests: 0,
    completionRequests: 0,
    requestBytes: 0,
    transportFailures: [],
  };
  const stopObserving = observeUploadTransport(args.page, metrics);
  try {
    const selectedAt = performance.now();
    metrics.selectionAcknowledgedMs = await selectUploadFile(
      args.page,
      args.filePath,
    );
    if (args.prompt)
      await args.page.getByTestId("chat-composer").fill(args.prompt);

    const uploadStartedAt = performance.now();
    await args.page.getByTestId("chat-upload-send-file").click();
    await Promise.race([
      args.page
        .getByTestId("chat-upload-progress")
        .waitFor({ state: "visible", timeout: 30_000 }),
      args.page.waitForURL(/\/chat\/[^/?#]+/, { timeout: 30_000 }),
      failOnVisibleUploadError(args.page),
    ]);
    metrics.uploadActiveMs = performance.now() - uploadStartedAt;

    await Promise.race([
      args.page.waitForURL(/\/chat\/[^/?#]+/, { timeout: 4 * 60 * 1000 }),
      failOnVisibleUploadError(args.page),
    ]);
    const receipt = args.page
      .getByTestId("chat-message-attachment")
      .filter({ hasText: path.basename(args.filePath) });
    await expect(receipt).toBeVisible({ timeout: 4 * 60 * 1000 });
    metrics.attachmentReadyMs = performance.now() - selectedAt;

    if (args.waitForAssistant !== false) {
      const assistant = args.page.getByTestId("chat-message-assistant").last();
      await expect(assistant).toBeVisible({ timeout: 4 * 60 * 1000 });
      await expect(assistant).toHaveAttribute(
        "data-message-streaming",
        "false",
        { timeout: 4 * 60 * 1000 },
      );
      const messageStatus = await assistant.getAttribute("data-message-status");
      if (messageStatus === "degraded" || messageStatus === "failed") {
        throw new Error(
          `Assistant response ended in ${messageStatus} status instead of a usable answer.`,
        );
      }
      await expect(assistant).not.toBeEmpty({ timeout: 4 * 60 * 1000 });
      metrics.assistantCompleteMs = performance.now() - selectedAt;
    }

    return metrics;
  } finally {
    stopObserving();
    if (metrics.transportFailures?.length) {
      console.log(
        JSON.stringify({
          event: "upload_e2e_transport_failures",
          failures: metrics.transportFailures,
          directRequests: metrics.directRequests,
          resumableChunkRequests: metrics.resumableChunkRequests,
          completionRequests: metrics.completionRequests,
        }),
      );
    }
    await args.testInfo.attach("upload-metrics", {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: "application/json",
    });
  }
}

async function failOnVisibleUploadError(page: Page): Promise<never> {
  const error = page.getByTestId("chat-upload-error");
  await error.waitFor({ state: "visible", timeout: 4 * 60 * 1000 });
  throw new Error(
    `Upload UI reported failure: ${(await error.textContent())?.trim() || "unknown upload error"}`,
  );
}

export async function expectPlainLanguageValidation(
  page: Page,
  pattern: RegExp,
) {
  const error = page.getByTestId("chat-upload-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(pattern);
  await expect(page.getByTestId("chat-send")).toBeDisabled();
}
