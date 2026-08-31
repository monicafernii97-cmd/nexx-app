import fs from "node:fs";

const webhook = process.env.E2E_ALERT_WEBHOOK?.trim();
if (!webhook) {
  console.log(
    JSON.stringify({ event: "upload_e2e_alert_skipped", reason: "no_webhook" }),
  );
  process.exit(0);
}

let summary = { status: "failed", results: [] };
try {
  summary = JSON.parse(
    fs.readFileSync("playwright-report/upload-e2e-summary.json", "utf8"),
  );
} catch {
  // A setup failure may happen before the reporter creates its summary.
}

const failed = Array.isArray(summary.results)
  ? summary.results
      .filter((result) => !["passed", "skipped"].includes(result.status))
      .slice(0, 8)
  : [];
const payload = {
  text: [
    `NEXX upload browser assurance failed (${process.env.E2E_LANE ?? "unknown"}).`,
    `Environment: ${process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).hostname : "unknown"}`,
    `Run: ${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY ?? ""}/actions/runs/${process.env.GITHUB_RUN_ID ?? ""}`,
    ...failed.map((result) => `- ${String(result.title).slice(0, 180)}`),
  ].join("\n"),
};

const response = await fetch(webhook, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
if (!response.ok)
  throw new Error(`Upload E2E alert endpoint returned ${response.status}.`);
console.log(
  JSON.stringify({
    event: "upload_e2e_alert_sent",
    failedCount: failed.length,
  }),
);
