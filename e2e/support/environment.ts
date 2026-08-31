import { expect, type Page, type TestInfo } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

export type UploadE2ELane =
  | "pr"
  | "release"
  | "daily"
  | "weekly"
  | "resilience";

const RUN_ID_PATTERN =
  /^e2e-(?:pr|release|daily|weekly|resilience)-[a-z0-9-]{8,96}$/;
const ROBOT_EMAIL_PATTERN =
  /^upload-robot-(owner|outsider)\+(preview|production)@nexproof\.io$/i;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for authenticated upload E2E tests.`);
  return value;
}

export function uploadE2EEnvironment(testInfo?: TestInfo) {
  const baseURL = required("E2E_BASE_URL");
  const parsed = new URL(baseURL);
  const lane = (process.env.E2E_LANE ??
    laneFromProject(testInfo?.project.name)) as UploadE2ELane;
  if (!["pr", "release", "daily", "weekly", "resilience"].includes(lane)) {
    throw new Error(`Unsupported E2E_LANE: ${lane}`);
  }
  const production =
    parsed.hostname === "nexproof.io" || parsed.hostname === "www.nexproof.io";
  if (production && process.env.E2E_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Production browser tests require E2E_ALLOW_PRODUCTION=true.",
    );
  }
  if (production && lane === "resilience") {
    throw new Error("Resilience fault injection is forbidden on production.");
  }

  const ownerEmail = required("E2E_OWNER_EMAIL");
  const outsiderEmail = process.env.E2E_OUTSIDER_EMAIL?.trim();
  for (const email of [ownerEmail, outsiderEmail].filter(Boolean) as string[]) {
    if (!ROBOT_EMAIL_PATTERN.test(email)) {
      throw new Error(
        "Robot email addresses must match an approved synthetic identity.",
      );
    }
  }

  const suppliedRunId = process.env.E2E_RUN_ID?.trim().toLowerCase();
  const runId =
    suppliedRunId ??
    `e2e-${lane}-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 10)}`;
  if (!RUN_ID_PATTERN.test(runId))
    throw new Error(`Invalid synthetic run identifier: ${runId}`);

  return {
    baseURL,
    production,
    lane,
    runId,
    ownerEmail,
    outsiderEmail,
    filePrefix: `nexx-e2e-${runId}--`,
  };
}

function laneFromProject(projectName?: string): UploadE2ELane {
  if (projectName?.includes("release")) return "release";
  if (projectName?.includes("production")) return "daily";
  if (projectName?.includes("weekly")) return "weekly";
  if (projectName?.includes("resilience")) return "resilience";
  return "pr";
}

export async function signInRobot(page: Page, emailAddress: string) {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto("/chat", { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/NS_BINDING_ABORTED|navigation.*interrupted/i.test(message) ||
        attempt === 3
      )
        throw error;
      await page.waitForTimeout(250 * attempt);
    }
  }
  await expect(page.getByTestId("chat-upload-trigger")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("chat-upload-trigger")).toBeEnabled({
    timeout: 60_000,
  });
}
