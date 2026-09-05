import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationsEnvelope } from "../lib/upload-e2e-operations.mjs";

const baseEnv = {
  E2E_LANE: "daily",
  E2E_BASE_URL: "https://nexproof.io",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "monicafernii97-cmd/nexx-app",
  GITHUB_SHA: "abcdef123",
};

test("builds a healthy owner-facing envelope", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_JOB_STATUS: "success" },
    summary: {
      status: "passed",
      lane: "daily",
      results: [
        {
          title: "daily robot completes upload, processing, chat receipt, and cleanup",
          status: "passed",
          retry: 0,
          attachments: [{ name: "cleanup-result", contentType: "application/json" }],
        },
      ],
    },
  });

  assert.equal(envelope.operatingState, "OPERATING");
  assert.equal(envelope.cleanupStatus, "passed");
  assert.equal(envelope.customerImpact, "none_observed");
  assert.deepEqual(envelope.counts, {
    passed: 1,
    failed: 0,
    skipped: 0,
    retried: 0,
    other: 0,
  });
});

test("uses sanitized cleanup attachment metadata for resilience reports", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_LANE: "resilience", E2E_JOB_STATUS: "success" },
    summary: {
      status: "passed",
      results: [
        {
          title: "one interrupted chunk retries without restarting",
          status: "passed",
          retry: 0,
          attachments: [
            { name: "cleanup-result", contentType: "application/json" },
          ],
        },
      ],
    },
  });

  assert.equal(envelope.cleanupStatus, "passed");
  assert.equal(envelope.syntheticArtifactsRemaining, "none_observed");
});

test("keeps successful cleanup separate from a failed browser assertion", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_LANE: "release", E2E_JOB_STATUS: "failure" },
    summary: {
      status: "failed",
      results: [
        {
          title: "executive chat preserves focus",
          status: "failed",
          retry: 1,
          error: "Assistant response ended in degraded status.",
          attachments: [
            { name: "upload-metrics", contentType: "application/json" },
            { name: "cleanup-result", contentType: "application/json" },
          ],
        },
      ],
    },
  });

  assert.equal(envelope.operatingState, "DEGRADED");
  assert.equal(envelope.failureCode, "BROWSER_ASSERTION_FAILURE");
  assert.equal(envelope.cleanupStatus, "passed");
  assert.equal(envelope.syntheticArtifactsRemaining, "none_observed");
});

test("keeps an explicit cleanup failure authoritative", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_LANE: "release", E2E_JOB_STATUS: "failure" },
    summary: {
      status: "failed",
      results: [
        {
          title: "executive chat preserves focus",
          status: "failed",
          error: "Synthetic upload cleanup failed.",
          attachments: [
            { name: "cleanup-failure", contentType: "application/json" },
          ],
        },
      ],
    },
  });

  assert.equal(envelope.failureCode, "CLEANUP_FAILURE");
  assert.equal(envelope.cleanupStatus, "failed");
  assert.equal(envelope.syntheticArtifactsRemaining, "possible");
});

test("classifies a security failure as critical and redacts identity data", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_JOB_STATUS: "failure" },
    summary: {
      status: "failed",
      results: [
        {
          title: "cross-user isolation rejects outsider@example.com",
          status: "failed",
          retry: 1,
          error: "Bearer abc123 allowed unauthorized access",
        },
      ],
    },
  });

  assert.equal(envelope.operatingState, "DEGRADED");
  assert.equal(envelope.severity, "critical");
  assert.equal(envelope.failureCode, "SECURITY_ASSERTION_FAILURE");
  assert.equal(envelope.counts.retried, 1);
  assert.doesNotMatch(envelope.failingAssertion, /outsider@example\.com/);
  assert.doesNotMatch(envelope.failureSummary, /abc123/);
});

test("produces a useful setup-failure envelope when Playwright never starts", () => {
  const envelope = buildOperationsEnvelope({
    env: { ...baseEnv, E2E_LANE: "resilience", E2E_JOB_STATUS: "failure" },
    summary: null,
  });

  assert.equal(envelope.failureCode, "SETUP_FAILURE_NO_SUMMARY");
  assert.equal(envelope.confidence, "low");
  assert.equal(envelope.cleanupStatus, "unknown");
  assert.equal(envelope.runUrl, "https://github.com/monicafernii97-cmd/nexx-app/actions/runs/123");
});
