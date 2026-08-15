# Chat Upload Resilience Implementation Plan

## Objective

Make chat file uploads reliable enough for production legal-document workflows, including the observed failure where an 18.9 MiB PDF repeatedly transmitted to Convex storage but the browser received HTTP status `0` and no `storageId`.

The implementation must preserve ownership controls, avoid duplicate processing, prevent incomplete large court documents from silently entering chat, give users actionable recovery, and provide production evidence when failures recur.

## Confirmed production failure

- The browser created a valid authenticated upload session.
- Five HTTPS POST attempts reached the production Convex deployment.
- The browser remained online and visible.
- All five attempts ended at XHR ready state 4 with HTTP status `0`.
- One attempt transmitted the complete 19,787,049-byte body but no response was readable.
- No `_storage` object, uploaded-file record, extraction job, or chat turn was created.
- The upload bypassed Vercel, so Vercel runtime logs could not expose the failure.

## Requirements

### R1 — Preserve the existing direct path

Keep generated Convex upload URLs as the primary path because they support files up to the existing 25 MiB product limit and avoid routing large bodies through Vercel.

### R2 — Add a distinct fallback transport

For files up to 19 MiB, a failed direct upload must automatically switch to a one-time authenticated Convex HTTP-action route on the deployment's `.convex.site` host.

The fallback must:

- use a cryptographically random, client-generated bearer token;
- persist only its SHA-256 hash;
- expire quickly;
- be single-use and bound to one user-owned session and one upload attempt;
- validate the exact byte size and content type before attachment;
- attach and schedule processing server-side before returning success;
- delete newly stored data if final attachment fails;
- allow the authenticated client to reconcile success if the HTTP response is lost.

The fallback cap is intentionally below Convex's 20 MiB HTTP-action request limit. Files above the fallback cap continue to use direct upload and receive explicit network guidance if that path is unavailable.

### R3 — Bound retries and bandwidth

- Limit storage transports to four attempts per upload session.
- Use a fresh one-time upload URL or ticket per attempt.
- Apply a short delay before switching transports.
- Refuse additional attempts once the session limit is exhausted.
- Preserve the selected file and typed message after a retryable failure.
- Tell the user to replace/reselect the file after terminal exhaustion.

### R4 — Make storage attachment idempotent

Repeated attachment or recovery calls for the same session and `storageId` must not schedule duplicate processing jobs. A different `storageId` must still be rejected.

### R5 — Improve failure classification

Classify status-zero failures using transmitted bytes:

- `connection_blocked` when no bytes were transmitted;
- `connection_interrupted` when only part of the file was transmitted;
- `response_lost` when the complete body was transmitted without a readable response.

Retain the raw safe diagnostics while showing a recovery message appropriate to the actual phase.

### R6 — Control diagnostic traffic

Persist start, terminal success, and terminal failure events. Throttle progress diagnostics so uploads do not emit a database mutation for every browser progress event. Terminal diagnostics must be flushed before the fallback or retry decision.

### R7 — Do not silently analyze incomplete legal documents

A document whose direct chat context is truncated must not be admitted as a usable `partial` attachment unless at least one complete-document retrieval path is available.

If full indexing and document-memory construction both fail:

- keep the session retryable;
- do not submit the chat turn;
- show that NEXX uploaded the file but could not prepare the complete document;
- reuse the stored original on processing retry rather than re-uploading it.

### R8 — Reconcile and clean up

- Expire abandoned fallback tickets.
- Release or fail stale claimed tickets.
- Delete unattached storage created by a fallback that cannot be finalized.
- Preserve the existing upload-session retention cleanup.
- Never delete a file referenced by an uploaded-file record.

### R9 — Observability

- Record transport (`direct` or `fallback`) per attempt.
- Record refined failure phase and attempt count.
- Emit a structured warning when repeated recent storage failures cross a threshold.
- Include enough safe fields to distinguish blocked, interrupted, and response-loss incidents without logging filenames, document contents, or bearer tokens.

### R10 — Verification and release

Required automated coverage:

- direct upload success;
- direct failure followed by fallback success;
- fallback response loss followed by session reconciliation;
- direct and fallback failure with bounded attempts;
- fresh URL/ticket issuance;
- exact-size and token validation;
- idempotent attachment;
- progress diagnostic throttling;
- large truncated document with no full retrieval path is blocked;
- large truncated document with vector or memory retrieval is admitted;
- composer preserves text/file and presents correct recovery.

Release gates:

1. Focused upload suites pass.
2. TypeScript, lint, and production build pass.
3. Full repository tests pass or any unrelated baseline failure is documented and proven unrelated.
4. Ready-for-review PR is opened against `main`.
5. All actionable review comments and required CI failures are resolved.
6. PR is merged into `main`.
7. Convex production functions/schema are deployed.
8. Vercel production deployment for the merge commit reaches `READY`.
9. Production endpoint, schema, and post-deploy error logs are checked.

## Deployment order

The backend changes are additive and compatible with the old client. Deploy Convex first once the PR is approved, then merge/promote the Vercel frontend. If frontend deployment fails, the existing direct client continues to work against the expanded backend.

## Rollback

- Frontend: roll back the Vercel production alias to the preceding deployment.
- Backend: leave additive schema fields/tables in place and disable fallback issuance through configuration or a follow-up mutation change. Removing schema fields is not required for rollback.
- Stored files: existing ownership and cleanup rules remain authoritative.

## Completion evidence

Completion requires the merged commit, green required checks, production Convex deployment output, Vercel `READY` status for the same merged commit, and a production smoke check showing the fallback route is deployed and rejects requests without a valid ticket.
