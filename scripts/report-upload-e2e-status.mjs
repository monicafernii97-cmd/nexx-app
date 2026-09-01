import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOperationsEnvelope } from "./lib/upload-e2e-operations.mjs";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function gh(args, { allowFailure = false } = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `GitHub command failed (${args.slice(0, 3).join(" ")}): ${String(result.stderr).slice(0, 500)}`,
    );
  }
  return result.status === 0 ? result.stdout.trim() : null;
}

function ghJson(args, options) {
  const output = gh(args, options);
  return output ? JSON.parse(output) : null;
}

export function localDate(iso, timeZone = "America/Chicago") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function localDateTime(iso, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function getRunJobs(repository, runId) {
  return ghJson([
    "run",
    "view",
    String(runId),
    "--repo",
    repository,
    "--json",
    "jobs",
  ]).jobs;
}

function jobForLane(jobs, lane, { includeSkipped = false } = {}) {
  return jobs.find(
    (job) =>
      job.name === `upload-${lane}` &&
      (includeSkipped || job.conclusion !== "skipped"),
  );
}

function downloadOperationsArtifact(repository, runId, lane) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), `nexproof-upload-e2e-${runId}-`),
  );
  try {
    const result = gh(
      [
        "run",
        "download",
        String(runId),
        "--repo",
        repository,
        "--name",
        `chat-upload-${lane}-${runId}`,
        "--dir",
        directory,
      ],
      { allowFailure: true },
    );
    if (result === null) return { operations: null, summary: null };
    const operationsPath = path.join(
      directory,
      "upload-e2e-operations.json",
    );
    const summaryPath = path.join(directory, "upload-e2e-summary.json");
    return {
      operations: fs.existsSync(operationsPath)
        ? JSON.parse(fs.readFileSync(operationsPath, "utf8"))
        : null,
      summary: fs.existsSync(summaryPath)
        ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
        : null,
    };
  } finally {
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
}

function fallbackOperations(run, job, lane) {
  const success = run.conclusion === "success" && job?.conclusion === "success";
  return {
    schemaVersion: 1,
    reportType: lane,
    operatingState: success ? "OPERATING" : "DEGRADED",
    severity: success ? "none" : "high",
    workflowConclusion: run.conclusion || run.status,
    runId: String(run.databaseId),
    runAttempt: run.attempt ?? 1,
    runUrl: run.url,
    commitSha: run.headSha,
    counts: null,
    cleanupStatus: "unknown",
    customerImpact: success ? "none_observed" : "possible",
    confidence: "low",
    lastSuccessfulPhase:
      job?.steps?.filter((step) => step.conclusion === "success").at(-1)?.name ??
      null,
    failureCode: success ? null : "OPERATIONS_ARTIFACT_MISSING",
    webhookConfigured: null,
  };
}

export function incompleteOperations(run, job, lane) {
  const skipped = run.conclusion === "skipped" || job?.conclusion === "skipped";
  const cancelled = ["cancelled", "canceled"].includes(
    String(run.conclusion ?? job?.conclusion ?? "").toLowerCase(),
  );
  const operatingState = skipped
    ? "SKIPPED"
    : cancelled
      ? "CANCELLED"
      : "RUNNING";

  return {
    schemaVersion: 1,
    reportType: lane,
    operatingState,
    severity: operatingState === "RUNNING" ? "none" : "high",
    workflowConclusion: run.conclusion || run.status,
    runId: String(run.databaseId),
    runAttempt: run.attempt ?? 1,
    runUrl: run.url,
    commitSha: run.headSha,
    counts: null,
    cleanupStatus: "unknown",
    customerImpact: "not_established",
    confidence: "high",
    lastSuccessfulPhase:
      job?.steps?.filter((step) => step.conclusion === "success").at(-1)?.name ??
      null,
    failureCode: skipped
      ? "WORKFLOW_SKIPPED"
      : cancelled
        ? "WORKFLOW_CANCELLED"
        : null,
    webhookConfigured: null,
  };
}

function ownerMarkdown(report) {
  const status = report.operations.operatingState;
  const heading =
    status === "OPERATING"
      ? "NEXXPROOF DAILY CHECK — HEALTHY"
      : status === "RUNNING"
        ? "NEXXPROOF DAILY CHECK — RUNNING"
      : status === "NO_RECENT_RUN"
        ? "NEXXPROOF DAILY CHECK — NO RUN FOUND"
        : status === "INACCESSIBLE"
          ? "NEXXPROOF DAILY CHECK — INACCESSIBLE"
        : "NEXXPROOF DAILY CHECK — APPROVAL NEEDED";
  const counts = report.operations.counts;
  const countLine = counts
    ? `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.retried} retried`
    : "Detailed counts unavailable";

  return [
    heading,
    "",
    `Lane: ${report.lane}`,
    `Reported: ${report.reportedAtLocal}`,
    `Run: ${report.run?.url ?? "No expected run found"}`,
    `Commit: ${report.operations.commitSha ?? "unknown"}${report.matchesMain === null ? "" : report.matchesMain ? " (matches main)" : " (does not match main)"}`,
    `Result: ${countLine}`,
    `Cleanup: ${report.operations.cleanupStatus}`,
    `Customer impact: ${report.operations.customerImpact}`,
    `Confidence: ${report.operations.confidence}`,
    `Failure code: ${report.operations.failureCode ?? "none"}`,
    `GitHub alert: ${report.openIssue?.url ?? "none"}`,
    `Approval state: ${["OPERATING", "RUNNING"].includes(status) ? "not required" : "AWAITING_OWNER_APPROVAL"}`,
    "",
    `UPLOAD_E2E_CURSOR run_id=${report.operations.runId ?? "none"} attempt=${report.operations.runAttempt ?? 1} lane=${report.lane} incident=${report.incidentId ?? "none"}`,
  ].join("\n");
}

export function buildMissingRunReport({ repository, lane, expectedDate, timeZone, mainSha }) {
  return {
    schemaVersion: 1,
    repository,
    lane,
    expectedLocalDate: expectedDate,
    timeZone,
    reportedAt: new Date().toISOString(),
    reportedAtLocal: localDateTime(new Date().toISOString(), timeZone),
    run: null,
    matchesMain: null,
    mainSha,
    previousSuccess: null,
    openIssue: null,
    incidentId: `NEXX-UPLOAD-${expectedDate}-01`,
    operations: {
      schemaVersion: 1,
      reportType: lane,
      operatingState: "NO_RECENT_RUN",
      severity: "high",
      workflowConclusion: "missing",
      runId: null,
      runAttempt: 1,
      runUrl: null,
      commitSha: null,
      counts: null,
      cleanupStatus: "unknown",
      customerImpact: "not_established",
      confidence: "high",
      lastSuccessfulPhase: null,
      failureCode: "EXPECTED_SCHEDULED_RUN_MISSING",
      webhookConfigured: null,
    },
  };
}

export function buildInaccessibleReport({ repository, lane, expectedDate, timeZone }) {
  const report = buildMissingRunReport({
    repository,
    lane,
    expectedDate,
    timeZone,
    mainSha: null,
  });
  report.operations.operatingState = "INACCESSIBLE";
  report.operations.workflowConclusion = "inaccessible";
  report.operations.failureCode = "GITHUB_EVIDENCE_INACCESSIBLE";
  report.operations.customerImpact = "not_established";
  return report;
}

async function main() {
  const repository = argument("repo", "monicafernii97-cmd/nexx-app");
  const workflow = argument(
    "workflow",
    "chat-upload-e2e-scheduled.yml",
  );
  const lane = argument("lane", "daily");
  const requestedRunId = argument("run-id", null);
  const timeZone = argument("time-zone", "America/Chicago");
  const expectedDate = argument(
    "expected-date",
    localDate(new Date().toISOString(), timeZone),
  );
  const format = argument("format", "json");
  const runs = requestedRunId
    ? [
        ghJson(
          [
            "run",
            "view",
            requestedRunId,
            "--repo",
            repository,
            "--json",
            "databaseId,attempt,createdAt,updatedAt,status,conclusion,event,headSha,url,jobs",
          ],
          { allowFailure: true },
        ),
      ].filter(Boolean)
    : ghJson(
        [
          "run",
          "list",
          "--repo",
          repository,
          "--workflow",
          workflow,
          "--limit",
          "12",
          "--json",
          "databaseId,attempt,createdAt,updatedAt,status,conclusion,event,headSha,url",
        ],
        { allowFailure: true },
      );
  const mainSha = gh([
    "api",
    `repos/${repository}/commits/main`,
    "--jq",
    ".sha",
  ], { allowFailure: true });
  if (!runs || !mainSha) {
    const report = buildInaccessibleReport({
      repository,
      lane,
      expectedDate,
      timeZone,
    });
    process.stdout.write(
      format === "markdown"
        ? `${ownerMarkdown(report)}\n`
        : `${JSON.stringify(report, null, 2)}\n`,
    );
    return;
  }
  const candidates = [];
  for (const run of runs) {
    if (run.event !== "schedule" && run.event !== "workflow_dispatch") continue;
    const jobs = run.jobs ?? getRunJobs(repository, run.databaseId);
    const job = jobForLane(jobs, lane, { includeSkipped: Boolean(requestedRunId) });
    if (!job) continue;
    candidates.push({ run, job });
  }
  const current = requestedRunId
    ? candidates[0]
    : candidates.find(
        ({ run }) => localDate(run.createdAt, timeZone) === expectedDate,
      );
  let report;
  if (!current) {
    report = buildMissingRunReport({
      repository,
      lane,
      expectedDate,
      timeZone,
      mainSha,
    });
  } else {
    const artifact =
      current.run.status === "completed" &&
      !["cancelled", "canceled", "skipped"].includes(
        String(current.run.conclusion).toLowerCase(),
      )
        ? downloadOperationsArtifact(repository, current.run.databaseId, lane)
        : { operations: null, summary: null };
    const operations = current.run.status !== "completed" ||
      ["cancelled", "canceled", "skipped"].includes(
        String(current.run.conclusion).toLowerCase(),
      ) ||
      current.job.conclusion === "skipped"
      ? incompleteOperations(current.run, current.job, lane)
      : artifact.operations ??
      (artifact.summary
        ? buildOperationsEnvelope({
            summary: artifact.summary,
            env: {
              E2E_LANE: lane,
              E2E_JOB_STATUS: current.job.conclusion ?? current.run.conclusion,
              GITHUB_RUN_ID: String(current.run.databaseId),
              GITHUB_RUN_ATTEMPT: String(current.run.attempt ?? 1),
              GITHUB_SERVER_URL: "https://github.com",
              GITHUB_REPOSITORY: repository,
              GITHUB_SHA: current.run.headSha,
            },
          })
        : fallbackOperations(current.run, current.job, lane));
    const previousSuccess = candidates.find(
      ({ run }) =>
        run.databaseId !== current.run.databaseId &&
        run.conclusion === "success",
    )?.run;
    const issues =
      ghJson(
        [
          "issue",
          "list",
          "--repo",
          repository,
          "--state",
          "open",
          "--search",
          `in:title [Upload E2E] ${lane} browser assurance failure`,
          "--json",
          "number,title,url,updatedAt",
        ],
        { allowFailure: true },
      ) ?? [];
    report = {
      schemaVersion: 1,
      repository,
      lane,
      expectedLocalDate: expectedDate,
      timeZone,
      reportedAt: new Date().toISOString(),
      reportedAtLocal: localDateTime(new Date().toISOString(), timeZone),
      run: current.run,
      matchesMain: current.run.headSha === mainSha,
      mainSha,
      previousSuccess: previousSuccess ?? null,
      openIssue: issues[0] ?? null,
      incidentId:
        operations.operatingState === "OPERATING"
          ? null
          : `NEXX-UPLOAD-${expectedDate}-01`,
      operations,
    };
  }

  process.stdout.write(
    format === "markdown"
      ? `${ownerMarkdown(report)}\n`
      : `${JSON.stringify(report, null, 2)}\n`,
  );
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) {
  main().catch((error) => {
    console.error(String(error?.message ?? error));
    process.exitCode = 1;
  });
}
