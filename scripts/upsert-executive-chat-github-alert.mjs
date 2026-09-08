import fs from 'node:fs';

const path = 'playwright-report/executive-chat-health.json';
if (!fs.existsSync(path)) process.exit(0);
const health = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!Array.isArray(health.hardStopCodes) || health.hardStopCodes.length === 0) process.exit(0);

const token = process.env.GITHUB_TOKEN?.trim();
const repository = process.env.GITHUB_REPOSITORY?.trim();
if (!token || !repository) throw new Error('GitHub alert credentials are missing.');
const [owner, repo] = repository.split('/');
const environment = health.environment ?? 'production';
const title = `[Executive Chat] ${environment} hard-stop alert`;
const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const body = [
  `The ${environment} conversational-kernel release gate reported a hard stop.`,
  '',
  `Run: ${runUrl}`,
  `Release SHA: ${health.releaseGitSha ?? process.env.GITHUB_SHA ?? 'unknown'}`,
  `Rollout version: ${health.rolloutConfigVersion ?? 'unknown'}`,
  `Cohort start: ${health.releaseCohortStartedAt ? new Date(health.releaseCohortStartedAt).toISOString() : 'unknown'}`,
  `Hard-stop codes: ${health.hardStopCodes.join(', ')}`,
  `Soft-stop codes: ${(health.softStopCodes ?? []).join(', ') || 'none'}`,
  `Release metrics: ${JSON.stringify(health.releaseMetrics ?? {})}`,
  '',
  'Rollback recommendation: disable the narrowest responsible Phase 2 rollout flag, preserve receipts, and rerun the signed-in release sequence.',
  'Runbook: https://github.com/monicafernii97-cmd/nexx-app/blob/main/docs/runbooks/executive-chat-rollout.md',
].join('\n');
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};
const list = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`, { headers });
if (!list.ok) throw new Error(`GitHub issue list returned ${list.status}.`);
const existing = (await list.json()).find((issue) => !issue.pull_request && issue.title === title);
const endpoint = existing
  ? `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`
  : `https://api.github.com/repos/${owner}/${repo}/issues`;
const response = await fetch(endpoint, {
  method: 'POST', headers, body: JSON.stringify(existing ? { body } : { title, body }),
});
if (!response.ok) throw new Error(`GitHub alert update returned ${response.status}.`);
process.stdout.write(`${JSON.stringify({ event: existing ? 'executive_chat_alert_updated' : 'executive_chat_alert_created', environment })}\n`);
