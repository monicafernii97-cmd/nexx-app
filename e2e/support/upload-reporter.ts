import fs from "node:fs";
import path from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type ReporterOptions = { outputFile?: string };

type SanitizedTestResult = {
  title: string;
  project: string;
  status: string;
  retry: number;
  durationMs: number;
  error?: string;
  attachments: Array<{
    name: string;
    contentType: string;
    runId?: string;
  }>;
};

const SYNTHETIC_RUN_ID_PATTERN =
  /^e2e-(?:pr|release|daily|weekly|resilience)-[a-z0-9-]{8,96}$/;

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~-]+/gi,
  /__clerk_testing_token=[^&\s]+/gi,
  /(?:token|ticket|password|secret|authorization)["'=:\s]+[^\s"'&,}]+/gi,
  /https?:\/\/[^\s]+(?:upload|storage)[^\s]*/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

export function redactE2EText(value: string) {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  ).slice(0, 4_000);
}

function sanitizedAttachment(
  attachment: TestResult["attachments"][number],
): SanitizedTestResult["attachments"][number] {
  const sanitized: SanitizedTestResult["attachments"][number] = {
    name: attachment.name,
    contentType: attachment.contentType,
  };
  if (!/^cleanup-(?:result|failure)$/i.test(attachment.name)) return sanitized;

  try {
    const raw = attachment.body
      ? attachment.body.toString("utf8")
      : attachment.path
        ? fs.readFileSync(attachment.path, "utf8")
        : null;
    if (!raw) return sanitized;
    const runId = String(JSON.parse(raw)?.runId ?? "").toLowerCase();
    if (SYNTHETIC_RUN_ID_PATTERN.test(runId)) sanitized.runId = runId;
  } catch {
    // Cleanup evidence remains useful even when optional run-id metadata is absent.
  }
  return sanitized;
}

export default class UploadE2EReporter implements Reporter {
  private readonly outputFile: string;
  private readonly results: SanitizedTestResult[] = [];

  constructor(options: ReporterOptions = {}) {
    this.outputFile =
      options.outputFile ?? "playwright-report/upload-e2e-summary.json";
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.results.push({
      title: test.titlePath().join(" > "),
      project: test.parent.project()?.name ?? "unknown",
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      error: result.error?.message
        ? redactE2EText(result.error.message)
        : undefined,
      attachments: result.attachments.map(sanitizedAttachment),
    });
  }

  onEnd(result: FullResult) {
    const outputPath = path.resolve(this.outputFile);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          status: result.status,
          generatedAt: new Date().toISOString(),
          commitSha:
            process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
          lane: process.env.E2E_LANE ?? null,
          results: this.results,
        },
        null,
        2,
      ),
    );
  }
}
