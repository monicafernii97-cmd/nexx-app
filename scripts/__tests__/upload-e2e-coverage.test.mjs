import assert from "node:assert/strict";
import test from "node:test";
import {
  coverageCandidates,
  coverageDecision,
  laneAttempt,
  localDate,
} from "../check-upload-e2e-coverage.mjs";

const expectedDate = "2026-09-06";
const commitSha = "abc123";
const timeZone = "America/Chicago";

test("selects only same-date same-commit workflow attempts", () => {
  const matching = {
    id: 10,
    event: "workflow_dispatch",
    head_sha: commitSha,
    created_at: "2026-09-06T11:05:00Z",
  };
  const candidates = coverageCandidates({
    runs: [
      matching,
      { ...matching, id: 11, head_sha: "other" },
      { ...matching, id: 12, created_at: "2026-09-07T05:01:00Z" },
      { ...matching, id: 13, event: "push" },
      { ...matching, id: 14 },
    ],
    expectedDate,
    timeZone,
    commitSha,
    currentRunId: "14",
  });

  assert.deepEqual(candidates.map((run) => run.id), [10]);
});

test("uses the Chicago calendar date across UTC midnight", () => {
  assert.equal(localDate("2026-09-07T04:59:00Z", timeZone), expectedDate);
});

test("recognizes daily and weekly attempts but ignores skipped jobs", () => {
  assert.equal(
    laneAttempt([{ name: "upload-daily", conclusion: "success" }], "daily")
      ?.name,
    "upload-daily",
  );
  assert.equal(
    laneAttempt([{ name: "upload-weekly", conclusion: "failure" }], "weekly")
      ?.name,
    "upload-weekly",
  );
  assert.equal(
    laneAttempt([{ name: "upload-daily", conclusion: "skipped" }], "daily"),
    undefined,
  );
});

test("suppresses any prior lane attempt, including a failed attempt", () => {
  const decision = coverageDecision({
    deduplicate: true,
    priorRun: { id: 42 },
    priorJob: { name: "upload-weekly", conclusion: "failure" },
  });

  assert.deepEqual(decision, {
    shouldRun: false,
    state: "covered",
    coveredRunId: "42",
  });
});

test("ordinary manual dispatches remain intentional overrides", () => {
  assert.deepEqual(
    coverageDecision({
      deduplicate: false,
      priorRun: { id: 42 },
      priorJob: { name: "upload-daily", conclusion: "success" },
    }),
    {
      shouldRun: true,
      state: "manual_override",
      coveredRunId: null,
    },
  );
});
