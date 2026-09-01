const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_PATTERN =
  /(?:bearer\s+|token["'=:\s]+|ticket["'=:\s]+|password["'=:\s]+|secret["'=:\s]+)[^\s"'&,}]+/gi;

function cleanText(value) {
  return String(value ?? "")
    .replace(EMAIL_PATTERN, "[REDACTED]")
    .replace(SECRET_PATTERN, "[REDACTED]")
    .slice(0, 1_000);
}

function normalizedStatus(value) {
  return String(value ?? "unknown").toLowerCase();
}

function safeHost(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid_url";
  }
}

export function summarizeResults(summary) {
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const counts = { passed: 0, failed: 0, skipped: 0, retried: 0, other: 0 };

  for (const result of results) {
    const status = normalizedStatus(result?.status);
    if (status === "passed") counts.passed += 1;
    else if (["failed", "timedout", "interrupted"].includes(status))
      counts.failed += 1;
    else if (status === "skipped") counts.skipped += 1;
    else counts.other += 1;
    if (Number(result?.retry ?? 0) > 0) counts.retried += 1;
  }

  const failed = results.filter((result) =>
    ["failed", "timedout", "interrupted"].includes(
      normalizedStatus(result?.status),
    ),
  );
  const passed = results.filter(
    (result) => normalizedStatus(result?.status) === "passed",
  );
  const cleanupResults = results.filter((result) => {
    const attachmentNames = Array.isArray(result?.attachments)
      ? result.attachments.map((attachment) => String(attachment?.name ?? ""))
      : [];
    return (
      /cleanup|synthetic artifacts?|remove all synthetic/i.test(
        String(result?.title ?? ""),
      ) || attachmentNames.some((name) => /^cleanup-(?:result|failure)$/i.test(name))
    );
  });
  const cleanupFailed = cleanupResults.some((result) =>
    ["failed", "timedout", "interrupted"].includes(
      normalizedStatus(result?.status),
    ) ||
    result.attachments?.some((attachment) => attachment?.name === "cleanup-failure"),
  );
  const cleanupPassed =
    cleanupResults.length > 0 &&
    cleanupResults.every(
      (result) => normalizedStatus(result?.status) === "passed",
    );

  return {
    counts,
    failed,
    lastSuccessfulPhase: passed.at(-1)?.title
      ? cleanText(passed.at(-1).title)
      : null,
    cleanupStatus: cleanupFailed
      ? "failed"
      : cleanupPassed
        ? "passed"
        : "unknown",
  };
}

function classifyFailure(failed, cleanupStatus, hasSummary) {
  const combined = failed
    .map((result) => `${result?.title ?? ""} ${result?.error ?? ""}`)
    .join(" ");
  if (!hasSummary) return { failureCode: "SETUP_FAILURE_NO_SUMMARY", severity: "high" };
  if (/cross-user|outsider|unauthorized|security|customer data/i.test(combined))
    return { failureCode: "SECURITY_ASSERTION_FAILURE", severity: "critical" };
  if (cleanupStatus === "failed")
    return { failureCode: "CLEANUP_FAILURE", severity: "high" };
  if (/timeout|timed out/i.test(combined))
    return { failureCode: "JOURNEY_TIMEOUT", severity: "high" };
  return { failureCode: "BROWSER_ASSERTION_FAILURE", severity: "high" };
}

export function buildOperationsEnvelope({ env = {}, summary = null } = {}) {
  const jobStatus = normalizedStatus(env.E2E_JOB_STATUS ?? summary?.status);
  const hasSummary = Boolean(summary && typeof summary === "object");
  const resultSummary = summarizeResults(summary);
  const passed =
    jobStatus === "success" &&
    normalizedStatus(summary?.status) === "passed" &&
    resultSummary.counts.failed === 0;
  const cancelled = ["cancelled", "canceled"].includes(jobStatus);
  const classification = passed
    ? { failureCode: null, severity: "none" }
    : cancelled
      ? { failureCode: "WORKFLOW_CANCELLED", severity: "high" }
      : classifyFailure(
          resultSummary.failed,
          resultSummary.cleanupStatus,
          hasSummary,
        );
  const failedResult = resultSummary.failed[0];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reportType: env.E2E_LANE ?? summary?.lane ?? "unknown",
    operatingState: passed ? "OPERATING" : "DEGRADED",
    severity: classification.severity,
    workflowConclusion: jobStatus,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT ?? 1),
    runUrl:
      env.E2E_RUN_URL ??
      (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : null),
    commitSha: env.GITHUB_SHA ?? summary?.commitSha ?? null,
    deploymentId: summary?.deploymentId ?? null,
    targetHost: safeHost(env.E2E_BASE_URL),
    counts: resultSummary.counts,
    cleanupStatus: resultSummary.cleanupStatus,
    syntheticArtifactsRemaining:
      resultSummary.cleanupStatus === "failed" ? "possible" : "none_observed",
    customerImpact: passed ? "none_observed" : "possible",
    confidence: hasSummary ? "high" : "low",
    lastSuccessfulPhase: resultSummary.lastSuccessfulPhase,
    failureCode: classification.failureCode,
    failingAssertion: failedResult?.title
      ? cleanText(failedResult.title)
      : null,
    failureSummary: failedResult?.error
      ? cleanText(failedResult.error)
      : null,
    webhookConfigured:
      String(env.E2E_ALERT_WEBHOOK_CONFIGURED ?? "false") === "true",
  };
}
