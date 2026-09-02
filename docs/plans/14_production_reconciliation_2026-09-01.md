# Production Reconciliation Record — 2026-09-01

**Repository:** `monicafernii97-cmd/nexx-app`  
**Reconciled baseline:** `be483e0ef1659e3169d1679337e7a87f9bddc47b`  
**Production Convex deployment:** `blessed-rabbit-457`  
**Result:** Application source, production web release, and production Convex definitions are reconciled at the current `origin/main` baseline.

## Scope

This reconciliation verifies the code and data-contract foundation that must precede executive chat hardening. It does not deploy the proposed hardening and does not change production data.

The following three states were compared:

1. Current remote default branch (`origin/main`).
2. GitHub/Vercel production deployment records.
3. Live Convex production function, table, index, and schema definitions.

The original feature checkout was deliberately excluded as an implementation baseline because it is on `bd432bf2d722678c923321cda3272f6eec5d8f50` and contains unrelated local modifications.

## Evidence

### Repository

- Default branch: `main`.
- Current remote main SHA: `be483e0ef1659e3169d1679337e7a87f9bddc47b`.
- Reconciliation worktree was created directly from that SHA.
- Worktree branch: `codex/executive-chat-hardening-spec`.

### Production web deployment

GitHub deployment records show successful production releases for SHA `be483e0ef1659e3169d1679337e7a87f9bddc47b`. The latest successful production release examined completed on 2026-09-01 and its Vercel deployment record reports success.

The local Vercel CLI credential is expired, so direct account inspection was not used as evidence. The repository-scoped GitHub deployment records were available and identify the production commit and successful deployment state.

### Production Convex deployment

The authenticated Convex project identifies its production deployment as `blessed-rabbit-457`.

Live production inspection returned:

- 286 deployed Convex functions.
- Current chat, document-understanding, correction, upload-resilience, canary, E2E, retrieval, and document-memory function families.
- Current production tables including `conversationLegalIssueState`, `documentUnderstandingRuns`, `documentUnderstandingRecords`, `documentCoverageManifests`, `chatCorrections`, `documentRetrievalAudit`, `chatUploadCanaryRuns`, and resumable-upload state.

A Convex `deploy --dry-run` was built from the clean `origin/main` worktree. It reported:

- no function definition differences;
- no component definition differences;
- no index additions or removals;
- successful schema validation;
- no application definition changes to deploy.

The tool reported only a potential Node action runtime-version change produced by the local Convex toolchain. That was not deployed because it is outside the requested reconciliation/specification scope and is not required to align the application definitions.

## Reconciliation conclusion

The previously observed fields and error codes that were absent from the original checkout are present on current `origin/main`. The mismatch was caused by diagnosing production from a stale feature branch, not by untracked production application code.

The safe implementation baseline is therefore:

```text
origin/main @ be483e0ef1659e3169d1679337e7a87f9bddc47b
```

No production deployment is required merely to reconcile current application source with production.

## Known operational gaps retained for the hardening specification

Reconciliation does not mean the chat architecture is correct. The aligned baseline still contains these confirmed gaps:

- `conversations.routeMode` can be overwritten by each accepted turn and is still used as active conversational context.
- Minimal utterances do not have a durable pending-question/offer referent model.
- Active legal issue state is generally persisted after a successful legal interpretation instead of provisionally at task acceptance.
- Full-document review readiness and scoped document readability are not represented as a unified operation-aware capability contract.
- Runtime capability data and response verification traces are stored as metadata but are not mandatory inputs to `completeAssistant`.
- `completeAssistant` can commit raw generated content without a validated publication envelope.
- Existing reassessment behavior emphasizes explicit challenges and does not prevent all implicit capability contradictions before publication.
- Production release identity is inferable through separate systems but is not exposed as a single compatibility manifest checked by both runtimes.

These items are addressed in `15_executive_chat_hardening_full_spec.md`.

## Safety and change record

- No production functions, indexes, schema, environment variables, or data were changed.
- No Vercel deployment was created.
- No Convex deployment was created.
- The original dirty feature checkout and its pre-existing modifications were preserved.
- A generated production function-spec snapshot was used transiently for comparison and removed afterward.
