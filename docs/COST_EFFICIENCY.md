# NEXProof cost-efficiency operating guide

This implementation removes internal waste without reducing AI, evidence, document, or export quality.

## Environment separation

| Runtime | Convex target | Required rule |
| --- | --- | --- |
| Local development | personal/development deployment | Must never use `blessed-rabbit-457` |
| Vercel Preview | shared staging or an intentionally provisioned preview deployment | Must never use production |
| Vercel Production | production deployment | Production only |

`npm run dev`, `npm run build`, and `npm run check:env` run the environment guard. The guard rejects the known production deployment name or hostname outside a Vercel production build. `.env.example` lists names only; secrets remain in ignored `.env.*.local` files and scoped Vercel variables.

Dashboard action still required: verify `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT` separately in Vercel Production, Preview, and Development. Changing those external values is intentionally not automated by this repository.

## Case-scoped workspace reads

Pins, memory, and timeline entries now use compound user/case indexes. The active workspace, reports, narratives, pattern analysis, exhibit builder, and review hub no longer subscribe to every record owned by the user.

Rows created before multi-case support have no `caseId`. They remain visible only in the user's oldest case. `convex/caseScopeMaintenance.ts` contains internal, bounded backfills for each table. They default to dry-run (`apply` omitted or false).

Production migration procedure:

1. Deploy the new indexes and case-scoped readers.
2. Run each internal backfill with `apply: false`, `batchSize: 50`; record `scanned` and `eligible`.
3. Verify the oldest/default case assignment for sampled users.
4. With explicit production approval, run `apply: true` in batches until `scanned` is zero.
5. Keep legacy read compatibility for at least one release after the final zero-result dry-run.

No production backfill is triggered by code or cron.

## Chat reads

The chat loads the newest 50 messages, with an explicit control for older pages. Citations are fetched from `chatAnswerSources.by_message` only for assistant messages in the visible page, capped at 50 per message and 500 per page. Citation text and verification status are unchanged.

## Review autosave

Review changes are debounced for five seconds and checkpointed at least once per minute while dirty. One Convex mutation atomically saves overrides and recovery state. Identical checkpoint hashes are no-ops, and the large assembly shell is rewritten only when it changes. Review items are included explicitly for crash recovery.

## Maintenance and retention

The expired-chat-lease safety sweep now runs every five minutes instead of every minute, reducing its maximum empty invocations from 1,440 to 288 per day. With a two-minute worker lease, worst-case fallback recovery is seven minutes after lease acquisition (five minutes after expiry). User-visible generation still completes immediately during normal worker operation; only the safety-net path uses this SLA. Other recovery schedules remain unchanged. The implementation also reduces work per invocation:

- expired chat leases use a status/expiry index;
- terminal failures are checked once;
- stale uploads query directly by status/cutoff;
- stale export runs query directly by status/creation time;
- structured summaries log when work occurs and sample empty sweeps hourly.

`convex/costObservability.ts` provides internal read-only previews for maintenance and export-retention candidates. It never patches or deletes data. Existing 30-day export maintenance remains unchanged; any new retention category must ship first as a read-only preview and requires explicit approval before deletion is introduced or executed.

## Dashboard verification after deployment

Compare seven-day pre/post values for:

- Convex database bandwidth and documents read/written;
- `messages.list`, the three `listByCase` queries, and maintenance mutation invocation/read counts;
- Vercel function invocations, active CPU, transfer, and build minutes;
- chat completion/degraded-answer rate, export recovery success, and error logs.

The following remain intentionally external: invoice attribution, Vercel usage alerts/budgets, Fluid Compute/project settings, Preview environment variable scoping, Convex dashboard billing data, and any production migration or deletion execution.
