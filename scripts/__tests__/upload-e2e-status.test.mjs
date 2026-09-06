import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInaccessibleReport,
  buildMissingRunReport,
  buildRecoveryDecision,
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
  assert.deepEqual(report.recovery, {
    eligible: true,
    reason: "missing_run",
    key: "2026-08-31:daily:abc123",
    dispatch: { ref: "main", lane: "daily", recovery: true },
  });
});

test("allows one lane-aware weekly recovery when evidence is missing", () => {
  const report = buildMissingRunReport({
    repository: "monicafernii97-cmd/nexx-app",
    lane: "weekly",
    expectedDate: "2026-09-06",
    timeZone: "America/Chicago",
    mainSha: "def456",
  });

  assert.equal(report.recovery.eligible, true);
  assert.equal(report.recovery.key, "2026-09-06:weekly:def456");
  assert.equal(report.recovery.dispatch.recovery, true);
});

test("preserves an existing scheduler incident across reporting dates", () => {
  const report = buildMissingRunReport({
    repository: "monicafernii97-cmd/nexx-app",
    lane: "daily",
    expectedDate: "2026-09-06",
    timeZone: "America/Chicago",
    mainSha: "def456",
    incidentId: "NEXX-UPLOAD-2026-09-02-01",
  });

  assert.equal(report.incidentId, "NEXX-UPLOAD-2026-09-02-01");
  assert.equal(report.recovery.key, "2026-09-06:daily:def456");
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
  assert.deepEqual(report.recovery, {
    eligible: false,
    reason: "evidence_inaccessible",
    key: null,
    dispatch: null,
  });
});

test("does not recover when any lane attempt is already present", () => {
  const decision = buildRecoveryDecision({
    lane: "daily",
    expectedLocalDate: "2026-09-06",
    mainSha: "abc123",
    operations: { failureCode: null },
  });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "attempt_present");
});

test("recovers a healthy same-day lane when current main is not covered", () => {
  const decision = buildRecoveryDecision({
    lane: "daily",
    expectedLocalDate: "2026-09-06",
    mainSha: "new-main",
    matchesMain: false,
    operations: { failureCode: null, operatingState: "OPERATING" },
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "main_not_covered");
  assert.equal(decision.key, "2026-09-06:daily:new-main");
});

test("does not automatically retry a failed attempt on an older main", () => {
  const decision = buildRecoveryDecision({
    lane: "weekly",
    expectedLocalDate: "2026-09-06",
    mainSha: "new-main",
    matchesMain: false,
    operations: {
      failureCode: "JOURNEY_FAILED",
      operatingState: "DEGRADED",
    },
  });

  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "attempt_present");
});
