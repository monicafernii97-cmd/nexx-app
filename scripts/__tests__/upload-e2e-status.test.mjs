import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInaccessibleReport,
  buildMissingRunReport,
  incompleteOperations,
  localDate,
} from "../report-upload-e2e-status.mjs";

test("uses the America/Chicago calendar date across a UTC boundary", () => {
  assert.equal(localDate("2026-09-01T04:30:00.000Z"), "2026-08-31");
});

test("builds an approval-gated missing-run report", () => {
  const report = buildMissingRunReport({
    repository: "monicafernii97-cmd/nexx-app",
    lane: "daily",
    expectedDate: "2026-08-31",
    timeZone: "America/Chicago",
    mainSha: "abc123",
  });

  assert.equal(report.operations.operatingState, "NO_RECENT_RUN");
  assert.equal(report.operations.failureCode, "EXPECTED_SCHEDULED_RUN_MISSING");
  assert.equal(report.incidentId, "NEXX-UPLOAD-2026-08-31-01");
  assert.equal(report.matchesMain, null);
});

test("distinguishes running, cancelled, and skipped workflow evidence", () => {
  const baseRun = {
    databaseId: 123,
    attempt: 1,
    status: "in_progress",
    conclusion: "",
    url: "https://github.com/example/actions/runs/123",
    headSha: "abc123",
  };

  assert.equal(incompleteOperations(baseRun, null, "daily").operatingState, "RUNNING");
  assert.equal(
    incompleteOperations(
      { ...baseRun, status: "completed", conclusion: "cancelled" },
      null,
      "daily",
    ).operatingState,
    "CANCELLED",
  );
  assert.equal(
    incompleteOperations(
      { ...baseRun, status: "completed", conclusion: "skipped" },
      null,
      "daily",
    ).operatingState,
    "SKIPPED",
  );
});

test("distinguishes inaccessible GitHub evidence from a missing run", () => {
  const report = buildInaccessibleReport({
    repository: "monicafernii97-cmd/nexx-app",
    lane: "daily",
    expectedDate: "2026-08-31",
    timeZone: "America/Chicago",
  });

  assert.equal(report.operations.operatingState, "INACCESSIBLE");
  assert.equal(report.operations.failureCode, "GITHUB_EVIDENCE_INACCESSIBLE");
});
