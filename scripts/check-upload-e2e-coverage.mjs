import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_LANES = new Set(["daily", "weekly"]);

export function localDate(iso, timeZone = "America/Chicago") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function runId(run) {
  return String(run.id ?? run.databaseId ?? "");
}

function runSha(run) {
  return run.head_sha ?? run.headSha ?? null;
}

function runCreatedAt(run) {
  return run.created_at ?? run.createdAt ?? null;
}

export function coverageCandidates({
  runs,
  expectedDate,
  timeZone,
  commitSha,
  currentRunId,
}) {
  return runs.filter((run) => {
    const createdAt = runCreatedAt(run);
    return (
      ["schedule", "workflow_dispatch"].includes(run.event) &&
      runId(run) !== String(currentRunId) &&
      runSha(run) === commitSha &&
      createdAt &&
      localDate(createdAt, timeZone) === expectedDate
    );
  });
}

export function laneAttempt(jobs, lane) {
  return jobs.find(
    (job) =>
      job.name === `upload-${lane}` &&
      String(job.conclusion ?? "").toLowerCase() !== "skipped",
  );
}

export function coverageDecision({ deduplicate, priorRun, priorJob }) {
  if (!deduplicate) {
    return {
      shouldRun: true,
      state: "manual_override",
      coveredRunId: null,
    };
  }
  if (priorRun && priorJob) {
    return {
      shouldRun: false,
      state: "covered",
      coveredRunId: runId(priorRun),
    };
  }
  return {
    shouldRun: true,
    state: "uncovered",
    coveredRunId: null,
  };
}

async function githubJson(endpoint, token) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`github_${response.status}`);
  return response.json();
}

function writeOutputs(outputPath, decision, lane, expectedDate, commitSha) {
  const lines = [
    `lane=${lane}`,
    `should-run=${decision.shouldRun}`,
    `coverage-state=${decision.state}`,
    `covered-run-id=${decision.coveredRunId ?? ""}`,
    `coverage-key=${expectedDate}:${lane}:${commitSha}`,
  ];
  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const currentRunId = process.env.GITHUB_RUN_ID?.trim();
  const commitSha = process.env.GITHUB_SHA?.trim();
  const outputPath = process.env.GITHUB_OUTPUT?.trim();
  const workflow =
    process.env.E2E_WORKFLOW?.trim() ?? "chat-upload-e2e-scheduled.yml";
  const lane = process.env.E2E_LANE?.trim() ?? "";
  const timeZone = process.env.E2E_TIME_ZONE?.trim() ?? "America/Chicago";
  const deduplicate = process.env.E2E_DEDUPLICATE === "true";

  if (!token || !repository || !currentRunId || !commitSha || !outputPath) {
    throw new Error("coverage_context_missing");
  }
  if (!ALLOWED_LANES.has(lane)) throw new Error("coverage_lane_invalid");

  const expectedDate = localDate(new Date().toISOString(), timeZone);
  if (!deduplicate) {
    writeOutputs(
      outputPath,
      coverageDecision({ deduplicate: false }),
      lane,
      expectedDate,
      commitSha,
    );
    return;
  }

  try {
    const workflowId = encodeURIComponent(workflow);
    const response = await githubJson(
      `/repos/${repository}/actions/workflows/${workflowId}/runs?per_page=100`,
      token,
    );
    const candidates = coverageCandidates({
      runs: response.workflow_runs ?? [],
      expectedDate,
      timeZone,
      commitSha,
      currentRunId,
    });
    let priorRun = null;
    let priorJob = null;
    for (const run of candidates) {
      const jobs = await githubJson(
        `/repos/${repository}/actions/runs/${runId(run)}/jobs?filter=latest&per_page=100`,
        token,
      );
      const attempt = laneAttempt(jobs.jobs ?? [], lane);
      if (attempt) {
        priorRun = run;
        priorJob = attempt;
        break;
      }
    }
    writeOutputs(
      outputPath,
      coverageDecision({ deduplicate, priorRun, priorJob }),
      lane,
      expectedDate,
      commitSha,
    );
  } catch {
    writeOutputs(
      outputPath,
      {
        shouldRun: true,
        state: "lookup_unavailable",
        coveredRunId: null,
      },
      lane,
      expectedDate,
      commitSha,
    );
    console.warn(
      JSON.stringify({
        event: "upload_e2e_coverage_lookup_unavailable",
        lane,
        failOpen: true,
      }),
    );
  }
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
