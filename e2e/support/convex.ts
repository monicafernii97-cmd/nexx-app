import type { Page } from "@playwright/test";
import type { UploadE2ELane } from "./environment";

async function operation<T>(
  page: Page,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await page.request.post("/api/test-support/chat-upload", {
    data: body,
  });
  if (!response.ok()) {
    throw new Error(
      `Synthetic upload support endpoint returned ${response.status()}.`,
    );
  }
  return (await response.json()) as T;
}

export async function registerSyntheticRun(
  page: Page,
  args: {
    runId: string;
    lane: UploadE2ELane;
    environment: "preview" | "staging" | "production";
  },
) {
  return operation<{ id: string }>(page, {
    operation: "register",
    ...args,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.GITHUB_SHA,
  });
}

export async function inspectSyntheticRunUpload(page: Page, runId: string) {
  return operation<{
    sessionCount: number;
    uploadedFileIds: string[];
    statuses: string[];
    files: Array<{
      status: string;
      contextTruncated: boolean;
      coverageStatus?: string;
      fullDocumentReviewStatus?: string;
      safeForChat: boolean;
    }>;
    transports: string[];
    attemptCount: number;
  }>(page, { operation: "inspect", runId });
}

export async function cleanupSyntheticRun(page: Page, runId: string) {
  await operation(page, { operation: "cleanup", runId });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const status = await operation<{
      status: string;
      cleanupErrorSafe?: string;
    } | null>(page, { operation: "status", runId });
    if (status?.status === "cleaned") return status;
    if (status?.status === "cleanup_failed") {
      throw new Error(
        status.cleanupErrorSafe ?? "Synthetic run cleanup failed.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Synthetic run cleanup did not finish within 120 seconds: ${runId}`,
  );
}
