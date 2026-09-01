# NEXX Chat Upload Assurance — Codex Operations Runbook

**Owner-facing task:** `Nexproof Daily System Check`

**Repository:** `monicafernii97-cmd/nexx-app`

**Production site:** `https://nexproof.io`

**Time zone:** `America/Chicago`

**Primary specification:** `docs/CHAT_UPLOAD_BROWSER_E2E_PERFORMANCE_FEATURE_SPEC.md`

## 1. Purpose

This runbook operates the production chat-upload browser assurance system after PR #242. It connects GitHub Actions evidence to a permanent Codex task, creates a focused Codex incident task when action is required, and enforces owner approval before any repair begins.

The browser robot and Codex have different jobs:

- GitHub Actions executes the deterministic browser journey and stores sanitized evidence.
- Codex reads that evidence, explains it, notifies the owner, and coordinates approval.
- Codex does not edit code merely because a monitor failed.

## 2. Authoritative sources

Use these sources in this order:

1. GitHub Actions run and job conclusions.
2. `upload-e2e-operations.json` from the run artifact.
3. `upload-e2e-summary.json` from the run artifact.
4. Matching open `[Upload E2E]` GitHub issue.
5. Current `origin/main` commit.
6. Last successful run for the same lane.
7. Vercel deployment state when a release or resilience deployment is involved.

Do not infer health from an old run, an unmerged branch, or the presence of workflow files alone.

## 3. Scheduled lanes

| Lane | Local schedule | Environment | Expected maximum duration |
|---|---|---|---:|
| Daily | 5:30 AM every day | Production | 15 minutes |
| Weekly | 4:00 AM Sunday | Production | 40 minutes |
| Resilience | 3:15 AM on the first day of each month | Isolated Vercel preview | 35 minutes |
| Release | Successful production deployment | Production | 10 minutes |
| Preview | Successful pull-request preview deployment | Preview | 12 minutes |

GitHub schedule entries declare `timezone: "America/Chicago"`. Jitter of up to five minutes occurs after the scheduled trigger.

## 4. Required GitHub configuration

### Production environment

- `E2E_OWNER_EMAIL`
- `E2E_OUTSIDER_EMAIL`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`

### Preview environment

- All production identity/authentication names above, with preview-scoped values.
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` environment variable.
- `VERCEL_PROJECT_ID` environment variable.

### Optional immediate webhook

- `E2E_ALERT_WEBHOOK`

The webhook is a secondary alert route. The Codex daily task and GitHub issue are the durable owner and engineering routes. An absent webhook must be reported as an alerting gap, but it must not prevent GitHub issue creation or Codex reporting.

Never print secret values while validating configuration.

## 5. Operations artifact

Every workflow calls `scripts/build-upload-e2e-operations-envelope.mjs` with `if: always()`. The resulting `playwright-report/upload-e2e-operations.json` exists even when deployment or authentication fails before Playwright starts.

Required fields include:

- `schemaVersion`
- `generatedAt`
- `reportType`
- `operatingState`
- `severity`
- `workflowConclusion`
- `runId` and `runAttempt`
- `runUrl`
- `commitSha`
- `targetHost`
- pass/fail/skip/retry counts
- `cleanupStatus`
- `customerImpact`
- `confidence`
- `lastSuccessfulPhase`
- `failureCode`
- sanitized failing assertion and error summary
- `webhookConfigured`

The artifact must never contain emails, bearer tokens, passwords, secrets, upload tickets, or raw customer documents.

## 6. Codex daily task

Create exactly one persistent Codex task named:

`Nexproof Daily System Check`

Attach the heartbeat automation to this task. Every completed report—including healthy reports—must be posted here. This task is where the owner asks questions, requests evidence, asks for one safe confirmation run, or approves a named incident.

The automation runs daily at 6:00 AM `America/Chicago`, after the normal GitHub completion window. It also checks the weekly and monthly lanes when they are due.

### Required automation behavior

1. Fetch `origin/main` and record its SHA without changing the working tree.
2. Locate the expected GitHub run for the local reporting date.
3. If still running, wait or recheck for no more than 15 minutes.
4. Download only the sanitized operations and summary artifacts.
5. Compare the tested SHA with the expected `main` SHA.
6. Read any matching open GitHub alert issue.
7. Compare with the last successful run in the same lane.
8. Post one owner-readable report.
9. Send the normal Codex notification for the task update.
10. Create or update one incident task when action is required.
11. Stop at `AWAITING_OWNER_APPROVAL` before editing code.

### Idempotency marker

End each report with a machine-readable marker:

```text
UPLOAD_E2E_CURSOR run_id=<id> attempt=<attempt> lane=<lane> incident=<id-or-none>
```

Before posting, search recent task history for the same run ID, attempt, and lane. Do not repost unchanged evidence.

## 7. Daily report format

Use one of these headings:

- `NEXXPROOF DAILY CHECK — HEALTHY`
- `NEXXPROOF DAILY CHECK — DEGRADED`
- `NEXXPROOF DAILY CHECK — APPROVAL NEEDED`
- `NEXXPROOF DAILY CHECK — NO RUN FOUND`
- `NEXXPROOF DAILY CHECK — NOT CONFIGURED`

Include:

- Local date and time.
- Lane.
- Run ID, attempt, and URL.
- Tested commit and whether it matches `main`.
- Target environment and host.
- Counts and retries.
- Last successful phase.
- Cleanup status.
- Customer-impact assessment.
- Confidence and reason.
- Last successful comparison.
- GitHub issue and incident task links.
- One next action.
- Approval state.

## 8. Incident task

Create an incident task for a credible product failure, security failure, cleanup failure, missing run, invalid configuration, or repeated infrastructure failure.

Title format:

`Nexproof Repair Approval — <incident-id> — <short component>`

Incident ID format:

`NEXX-UPLOAD-YYYY-MM-DD-NN`

Deduplicate using:

`environment + lane + first failed phase + failure code + deployment or commit`

The incident task must contain:

- Evidence and links.
- What customers may experience.
- Confidence and uncertainty.
- Read-only diagnosis.
- Proposed repair scope and excluded systems.
- Files or services likely affected.
- Verification plan.
- Risk and rollback plan.
- The exact approval phrase.

## 9. Approval gate

No tracked source file may change until the owner explicitly approves the named incident and scope.

Valid example:

`Approve repair for NEXX-UPLOAD-2026-09-01-01 as proposed.`

Before approval, Codex may read logs and code, inspect diffs, run existing non-mutating tests, verify cleanup, and dispatch at most one safe confirmation run.

Before approval, Codex must not:

- Edit tracked files.
- Create or push a repair branch or commit.
- Open a repair PR.
- Change secrets or production configuration.
- Merge, deploy, promote, or roll back.
- Weaken or skip a failing test.

Ambiguous approval such as “okay” is not sufficient. Ask for an explicit incident-scoped instruction.

## 10. Approved repair workflow

After explicit approval:

1. Revalidate the incident against current `main`.
2. Create an isolated worktree and `codex/` branch.
3. Implement only the approved scope.
4. Add regression coverage.
5. Run focused tests, typecheck, lint, build, and the relevant browser journey.
6. Confirm synthetic cleanup and evidence redaction.
7. Push the branch.
8. Open a ready-for-review PR against the default branch.
9. Allow normal CodeRabbit review to run.
10. Report the PR and evidence in both Codex tasks.

Merge and deployment require separate authorization unless the owner’s approval explicitly includes production rollout.

## 11. Common classifications

| Evidence | Classification | Action |
|---|---|---|
| Job and summary pass, cleanup passes | Healthy | Report; no incident |
| No expected run | Monitoring failure | Incident and notification |
| No summary and job fails during setup | Setup/configuration failure | Incident; low confidence on product health |
| Browser assertion fails after retry | Credible product failure | Incident; request approval |
| Cross-user/security assertion fails | Critical security | Immediate incident and notification |
| Cleanup assertion fails | High cleanup failure | Verify scoped cleanup; request approval for code/config repair |
| Webhook absent but Codex/GitHub paths work | Alerting gap | Show in report; do not mislabel product unhealthy |
| GitHub unavailable | Reporting degraded | Use last known success; do not infer current health |

## 12. Resilience deployment failures

If the isolated resilience deployment fails:

1. Read the `Deploy isolated staging build` step.
2. Confirm whether the failure is credential, Vercel project linkage, build, or deployment readiness.
3. Do not classify it as a production customer outage.
4. Confirm no production fault-injection route was enabled.
5. Rotate an invalid Preview `VERCEL_TOKEN` only through approved secret-management tooling; never commit or print it.
6. Rerun the isolated workflow once.
7. Close the GitHub issue only after the rerun passes and cleanup is confirmed.

## 13. Manual verification commands

These commands are read-only unless the command explicitly dispatches a workflow:

```text
gh run list --repo monicafernii97-cmd/nexx-app --workflow chat-upload-e2e-scheduled.yml
gh run view <run-id> --repo monicafernii97-cmd/nexx-app
gh issue list --repo monicafernii97-cmd/nexx-app --search "in:title [Upload E2E]"
gh secret list --repo monicafernii97-cmd/nexx-app --env Production
gh secret list --repo monicafernii97-cmd/nexx-app --env Preview
```

Manual dispatches:

```text
gh workflow run chat-upload-e2e-scheduled.yml --repo monicafernii97-cmd/nexx-app --ref main -f lane=daily
gh workflow run chat-upload-e2e-resilience.yml --repo monicafernii97-cmd/nexx-app --ref main
```

## 14. Production readiness checklist

- Scheduled workflows are enabled on the default branch.
- Timezone-aware schedules are present.
- Production daily journey passes.
- Weekly lane passes in all configured browsers.
- Isolated resilience lane deploys and passes.
- Operations artifacts are uploaded on success and setup failure.
- Artifact redaction tests pass.
- GitHub issue creation and deduplication work.
- Persistent Codex task exists.
- Heartbeat automation is active and unmuted.
- A healthy report reaches the daily task.
- A controlled failure produces exactly one incident task.
- No tracked-file edit occurs before approval.
- An approved seeded repair can produce a verified ready-for-review PR.
- Production deployment and post-deploy release journey pass.
