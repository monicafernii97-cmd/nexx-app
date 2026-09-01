import fs from "node:fs";

const token = process.env.GITHUB_TOKEN?.trim();
const repository = process.env.GITHUB_REPOSITORY?.trim();
if (!token || !repository)
  throw new Error("GitHub alert credentials are missing.");

const [owner, repo] = repository.split("/");
const lane = process.env.E2E_LANE ?? "unknown";
const title = `[Upload E2E] ${lane} browser assurance failure`;
const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
let operations = null;
try {
  operations = JSON.parse(
    fs.readFileSync("playwright-report/upload-e2e-operations.json", "utf8"),
  );
} catch {
  // A legacy run may fail before an operations envelope can be created.
}
const body = [
  `The ${lane} chat-upload browser assurance workflow failed.`,
  "",
  `Run: ${runUrl}`,
  `Commit: ${process.env.GITHUB_SHA ?? "unknown"}`,
  `Failure code: ${operations?.failureCode ?? "unknown"}`,
  `Last successful phase: ${operations?.lastSuccessfulPhase ?? "unknown"}`,
  `Cleanup: ${operations?.cleanupStatus ?? "unknown"}`,
  `Customer impact: ${operations?.customerImpact ?? "not yet classified"}`,
  "",
  "Runbook: https://github.com/monicafernii97-cmd/nexx-app/blob/main/docs/CHAT_UPLOAD_E2E_CODEX_OPERATIONS_RUNBOOK.md",
  "Confirm cleanup before closing this alert.",
].join("\n");
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

const list = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
  { headers },
);
if (!list.ok) throw new Error(`GitHub issue list returned ${list.status}.`);
const existing = (await list.json()).find(
  (issue) => !issue.pull_request && issue.title === title,
);
const endpoint = existing
  ? `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`
  : `https://api.github.com/repos/${owner}/${repo}/issues`;
const response = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify(existing ? { body } : { title, body }),
});
if (!response.ok)
  throw new Error(`GitHub alert update returned ${response.status}.`);
console.log(
  JSON.stringify({
    event: existing ? "upload_e2e_alert_updated" : "upload_e2e_alert_created",
    lane,
  }),
);
