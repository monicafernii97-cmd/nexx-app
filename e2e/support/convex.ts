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
    conversationIds: string[];
    semanticTurns: Array<{
      turnId: string;
      message: string;
      status: string;
      speechAct?: string;
      interactionIntent?: string;
      interactionDecision?: string;
      selectedOptionId?: string;
      analysisMode?: string;
      selectedDocumentIds: string[];
      selectedEvidenceGenerationIds: string[];
      evidenceRequirementCount: number;
      sourceDocumentCount: number;
      sourcePacketCount: number;
      sourceCharacterCount: number;
      answerEvidenceDocumentCount: number;
      answerEvidenceChunkCount: number;
      publicationDecision?: string;
      publicationRejectionCodes: string[];
      shadowRejectionCodes: string[];
    }>;
  }>(page, { operation: "inspect", runId });
}

export async function waitForSyntheticFullReviewReady(
  page: Page,
  runId: string,
  timeoutMs = 8 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "not_found";
  while (Date.now() < deadline) {
    const inspected = await inspectSyntheticRunUpload(page, runId);
    const statuses = inspected.files.map((file) => file.fullDocumentReviewStatus ?? "not_started");
    if (statuses.length > 0 && statuses.every((status) => status === "ready")) return inspected;
    lastStatus = statuses.join(",") || "not_found";
    if (statuses.some((status) => status === "failed")) {
      throw new Error(`Synthetic full-document review failed before acceptance: ${lastStatus}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Synthetic full-document review was not ready within ${timeoutMs}ms: ${lastStatus}.`);
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
