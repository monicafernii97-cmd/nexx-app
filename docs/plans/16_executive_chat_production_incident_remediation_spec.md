# Executive Chat Production Incident Remediation and Reliability Specification

**Status:** Implementation-ready; not yet implemented  
**Priority:** P0 response integrity and production safety  
**Baseline:** `origin/main@0b14fbb0b87c596ab141384087b615a70152880f`  
**Observed incident:** owner-only Stage 1 production test, 2026-09-04  
**Extends:** `15_executive_chat_hardening_full_spec.md`  
**Change ticket:** `EXEC-CHAT-ROLLOUT-2026-09-04`

## 1. Decision and intended outcome

This specification closes five defects exposed by the first live owner-canary turn:

1. quarantined synthetic files remained referenced by a genuine conversation's derived control state;
2. a provider stream that emitted output but ended without `response.completed` was classified as an unknown, non-retryable failure;
3. the failure path committed canned recovery copy outside the normal response-publication envelope;
4. a broad document request produced an unnecessarily large synchronous evidence packet; and
5. a legacy exhaustive-review run remained failed even though all 46 source pages were extracted and accounted for.

The completed system must recover invisibly when possible, explain the exact interruption when it cannot, preserve the user's task and evidence, exclude quarantined records at every state boundary, and never claim that a readable document is unreadable.

This document authorizes design and implementation work. It does not, by itself, authorize an unreviewed production data mutation or cohort expansion.

## 2. Production evidence that the implementation must reproduce

The production turn used the message `Analyze the signed court order file.` and demonstrated the following chain:

- foreground intent and document activation selected `document_analysis` correctly;
- the activation receipt identified an explicit, meaningful document reference;
- one eligible stored document was available to the worker;
- retrieval prepared 17 source packets spanning the stored order;
- the attachment context was 117,703 characters;
- the provider used `gpt-5.4` with structured output;
- output deltas began late in the request and continued for several checkpoints;
- the stream ended after approximately two minutes without `response.completed` or a provider-supplied incomplete reason;
- the synthetic error text `Provider stream ended before completion` did not match the timeout classifier;
- the attempt became `provider_unknown_failure`, `retryable=false`;
- the job allowed three attempts but performed no retry;
- `commitSystemRecoveryNotice` committed the generic degraded response;
- no `responsePublicationAudits` record was produced for that recovery message; and
- the next operational snapshot reported one eligible rollout turn, one unexplained fallback, and a 100% fallback rate.

The same audit found that the turn plan and conversation control state contained six document IDs: four genuine duplicate signed-order uploads and two quarantined synthetic documents originating in other conversations in the same case. Runtime retrieval filtered the quarantined records and supplied only one eligible document to the provider. That prevented content leakage in this turn, but the derived state remained invalid.

The active signed-order version has:

- 46 expected pages;
- 46 succeeded pages and no omitted, failed, or low-confidence pages;
- a complete source-unit coverage manifest;
- 33 canonical chunks;
- one preserved legacy map node covering chunks 0–5/pages 1–7; and
- a legacy exhaustive-review run failed at chunk 6 because the provider returned unterminated JSON.

## 3. Scope

### In scope

- reverse-reference discovery and conflict-safe repair for quarantined documents;
- canonical selection of duplicate uploads without deleting genuine uploads;
- pending interaction cleanup;
- typed provider-stream lifecycle and persisted attempt history;
- strict time and retry budgets;
- compact evidence fallback and provider continuation;
- publication validation for recovery messages;
- question-kind-aware document prompt budgets;
- durable exhaustive-review restart and verification;
- rollout health, release gates, tests, and operator runbooks.

### Out of scope

- deleting any genuine signed-order upload;
- rewriting user or assistant message history;
- treating filenames alone as proof of duplicate identity;
- silently importing unverified legacy review output as a completed exhaustive review;
- enabling self-correction or broad production traffic as part of this remediation;
- changing legal conclusions in historical messages.

## 4. New invariants

| Code | Requirement |
|---|---|
| `INV-REPAIR-001` | Repair discovery must follow every inbound reference in the authorized user/case scope, not only the quarantined file's original conversation. |
| `INV-REPAIR-002` | Every changed record has an immutable before/after snapshot and conflict-safe restore receipt. |
| `INV-REPAIR-003` | Quarantine and derived-state repair may not delete, alter, or reclassify a genuine upload. |
| `INV-DOC-001` | A planned or active document set may contain only currently authorized, chat-eligible documents. |
| `INV-DOC-002` | Duplicate uploads of one instrument resolve to one canonical active document unless the user explicitly requests comparison. |
| `INV-DOC-003` | Filename equality alone cannot establish document identity. |
| `INV-STREAM-001` | A stream that starts but lacks a terminal event is a typed interruption, never an unknown failure. |
| `INV-STREAM-002` | A retryable provider interruption cannot publish a terminal failure while an automatic attempt remains. |
| `INV-BUDGET-001` | A single provider attempt cannot consume the worker's commit/requeue reserve. |
| `INV-IDEM-002` | Multiple provider attempts still create at most one committed assistant response. |
| `INV-PUB-003` | Every user-visible recovery or limitation message has a publication envelope and audit record. |
| `INV-PUB-004` | Recovery copy may claim that a retry is occurring only after a durable retry has been scheduled. |
| `INV-LOAD-001` | Synchronous evidence is bounded by operation and estimated tokens before the provider request begins. |
| `INV-REV-001` | Exhaustive review is `ready` only when every canonical chunk is represented in a verified reduction root tied to the complete 46-page manifest. |
| `INV-REV-002` | A legacy failed run remains preserved; remediation creates or resumes a compatible current-version run without falsifying its history. |

Any violation of `INV-REPAIR-003`, `INV-DOC-001`, `INV-PUB-003`, or `INV-REV-001` is a rollout hard stop.

## 5. Workstream A — rebuild the conversation's derived document state

### 5.1 Root cause

`productionStateRepair.snapshotAuthorizedRepair` seeds `affectedConversationIds` from each quarantined file's own `conversationId`. It repairs those conversations, but it does not discover another conversation in the same case whose control state, tasks, plans, pending options, or remembered-document arrays contain the quarantined ID.

The repair therefore quarantined the source rows correctly while leaving cross-conversation, case-derived references behind.

### 5.2 Required reverse-reference audit

Add a cursor-based `auditDocumentReferenceGraph` operation that receives:

```ts
type DocumentReferenceGraphAuditInput = {
  repairRunId: string;
  targetUploadedFileIds: Id<'uploadedFiles'>[];
  scopeUserId: Id<'users'>;
  scopeCaseId?: Id<'cases'>;
  cursor?: string;
  batchSize: number;
};
```

The server derives the user and case from the approved repair run and target records. Client-provided scope is never authoritative.

The audit must inspect all authorized conversations for that user/case and report references from:

- `conversationDocumentState.activeUploadedFileId`;
- `lastReferencedUploadedFileIds` and `pinnedUploadedFileIds`;
- `conversationControlStates.activeDocumentIds`;
- pending options, last assistant offers, and resolved-referent JSON;
- active and inactive `conversationTasks.documentIds`;
- `turnExecutionPlans.selectedDocumentIds`;
- `conversationLegalIssueState.sourceAnchors`;
- `documentRetrievalAudit` candidates and selections;
- `documentAnswerEvidence` sources;
- `chatAnswerSources.uploadedFileId`;
- `documentAliases.uploadedFileId`;
- case-memory structures containing document IDs; and
- any future table registered in a single `DOCUMENT_REFERENCE_REGISTRY`.

The audit result must distinguish mutable derived state from immutable history. Historical retrieval/citation receipts remain preserved and are marked ineligible/superseded; active selectors, pending interactions, and future-facing memory are repaired.

The audit must fail closed if:

- a referenced document belongs to another user;
- the case boundary is inconsistent;
- an expected table cannot be scanned completely;
- a JSON reference payload cannot be parsed safely; or
- any candidate was classified from filename alone.

### 5.3 Canonical genuine document selection

The four genuine uploads remain genuine and must remain retrievable from upload history. Only the derived active set is collapsed.

Canonical selection uses this precedence:

1. a document explicitly attached on the current turn;
2. an eligible `activeUploadedFileId` selected by the user;
3. the eligible version with a complete source-unit manifest and the largest verified page coverage;
4. the most recently explicitly referenced eligible version; and
5. a user clarification if two different instruments or versions remain plausible.

An upload may be automatically marked with existing `duplicateOfUploadedFileId` only when an exact storage or full-text hash matches within the same owner scope. Filename, similar length, or semantic resemblance may suppress ranking only after operator adjudication; it may not mutate duplicate lineage automatically.

For the reported conversation, the repair preview must show one canonical active signed-order ID, three preserved genuine duplicate IDs removed only from active/plan arrays, and the two quarantined synthetic IDs removed from every future-facing reference.

### 5.4 Exact derived-state patch rules

`conversationDocumentState`:

- set `activeUploadedFileId` to the canonical eligible order;
- reduce `lastReferencedUploadedFileIds` to eligible, stable-order IDs and place the canonical ID first;
- preserve genuinely pinned documents; remove only quarantined IDs and adjudicated duplicate active references;
- retain valid successful history timestamps; never point `lastDocumentAnalysisTurnId` at a synthetic turn.

`conversationControlStates`:

- retain the current user goal and task only if it remains valid;
- replace `activeDocumentIds` with the canonical eligible set;
- remove quarantined evidence generations;
- clear `pendingAct`, `pendingOptionsJson`, and `pendingSourceTurnId` when the pending interaction is stale, expired, references a quarantined document, or originated from a degraded/socially inappropriate answer;
- clear or rebuild `lastAssistantOfferJson` under the same rule;
- remove quarantined IDs from resolved referents;
- set provenance to `recovered` and increment focus revision when the active focus materially changes.

`conversationTasks` and `turnExecutionPlans`:

- patch future-facing active/planned records to the canonical eligible set;
- mark a plan `failed_recoverable` if its required document set becomes empty;
- do not convert a failed/degraded result into a successful result;
- preserve completed historical meaning while attaching a repair/supersession receipt.

### 5.5 Repair lifecycle

Extend the existing production repair lifecycle:

```text
audit source records
→ audit reverse reference graph
→ adjudicate canonical document
→ generate exact dry-run diff
→ obtain/verify approval
→ snapshot every target
→ apply in bounded batches
→ verify reference graph
→ rerun idempotently
```

The second apply must produce zero mutations. Restore must compare the current projected field hash with the intended-after hash and refuse any record changed legitimately after repair.

The existing quarantine snapshots remain immutable. This remediation creates a linked repair run rather than rewriting the completed run.

## 6. Workstream B — harden interrupted-stream handling

### 6.1 Typed stream lifecycle

Create `src/lib/nexx/provider/streamLifecycle.ts` with explicit terminal results:

```ts
type ProviderStreamTerminal =
  | { kind: 'completed'; responseId: string; text: string }
  | { kind: 'incomplete'; responseId?: string; reason: string; text: string }
  | { kind: 'interrupted'; responseId?: string; lastEventType?: string; text: string; elapsedMs: number }
  | { kind: 'timed_out'; responseId?: string; text: string; elapsedMs: number }
  | { kind: 'failed'; responseId?: string; providerCode?: string; messageSafe: string };
```

Capture the response ID from `response.created`, `response.in_progress`, `response.completed`, and `response.incomplete`, rather than waiting for the terminal event. Record the last event type and last-event timestamp.

An exhausted async iterator without a terminal event becomes `provider_stream_interrupted`, category `temporary`, `retryable=true`. It must not be converted into a generic `Error` whose message is later treated as unknown.

### 6.2 Deadlines and reserved time

Use both an inactivity timer and an absolute attempt deadline because an SDK request timeout may not reliably bound asynchronous stream iteration.

Initial production budgets:

| Budget | Limit |
|---|---:|
| worker invocation | 110 seconds |
| commit/requeue reserve | 15 seconds |
| first provider attempt | 65 seconds absolute |
| no-event inactivity | 20 seconds after streaming begins |
| compact retry attempt | 25 seconds |
| local parse/validation recovery | 5 seconds |

At 95 seconds of worker elapsed time, no new provider request may begin. The worker must commit a validated answer, durably requeue the job, or commit a validated exhausted-recovery response before the reserve begins.

Long retries run as new leased job invocations. They are not stacked inside one action until the lease expires.

### 6.3 Attempt ledger

Add `chatGenerationAttempts`:

```ts
{
  jobId, turnId, attemptNumber,
  strategy: 'full' | 'continue' | 'compact' | 'deterministic_scoped',
  status: 'started' | 'completed' | 'retry_scheduled' | 'failed',
  model, providerResponseId?,
  inputTokenEstimate, maxOutputTokens,
  sourceDocumentCount, sourcePacketCount,
  sourceCharacterCount,
  firstEventAt?, lastEventAt?, lastEventType?,
  partialOutputCharacters,
  failureCode?, failureStage?, incompleteReason?,
  startedAt, completedAt?
}
```

Do not store partial legal text in routine telemetry. The partial output remains only in the existing protected draft/message mechanism and is never committed without verification.

### 6.4 Retry strategy

The maximum remains three provider attempts, but each has a distinct strategy:

1. **Full targeted attempt:** normal evidence packet within the prompt budget.
2. **Continuation or compact retry:** use provider-supported continuation when a response ID and safe partial output exist; otherwise retry with a smaller ranked evidence packet and the same immutable plan/evidence lineage.
3. **Deterministic scoped recovery:** render a narrowly supported answer, ask one material clarification, or publish a precise limitation. High-stakes legal analysis must not fall back to a smaller general-purpose model merely to obtain fluent text.

Retry only when the plan, focus revision, document authorization, and active memory generation still match. If they changed, discard the attempt and replan once.

Retry classification matrix:

| Failure | Classification | Next action |
|---|---|---|
| iterator ended without terminal event | `provider_stream_interrupted` | retry/continue |
| local absolute deadline | `provider_stream_timeout` | compact retry |
| `response.incomplete` / output tokens | `provider_output_incomplete` | continuation |
| malformed structured JSON | `provider_schema_error` | local recovery, then strict retry |
| rate limit or 5xx | existing temporary class | delayed requeue |
| prompt too large | `provider_prompt_budget_exceeded` | compact once |
| authentication/configuration | non-retryable | validated limitation and alert |
| policy boundary | non-retryable | validated policy response |

## 7. Workstream C — make fallback publication non-bypassable

### 7.1 Remove direct recovery commits

`commitSystemRecoveryNotice` must no longer call `completeAssistantCore` with fixed copy. Replace it with:

```text
prepareRecoveryCandidate
→ validateRecoveryEnvelope
→ commitValidatedRecovery
```

When attempts remain, do not publish an assistant failure message. Keep the turn active and expose a transient UI status such as `Reconnecting to finish the analysis…` from structured turn state.

When attempts are exhausted, build the recovery candidate from verified facts:

- whether the requested document was located;
- whether readable evidence was retrieved;
- whether any analysis was verified;
- whether a retry was actually scheduled;
- what operation remains incomplete; and
- the single safest next action.

### 7.2 Publication envelope v2

Extend the publication envelope with:

```ts
responseClass: 'answer' | 'clarification' | 'limitation' | 'recovery';
checks: {
  responsiveness: true;
  conversationalAppropriateness: true;
  evidence: true;
  capabilityClaims: true;
  continuity: true;
  genericity: true;
  retryTruth: true;
  safety: true;
  internalPayload: true;
};
```

Add `publish_recovery` to the persisted publication decision. Every committed recovery records its envelope ID, plan/focus/capability/evidence hashes, failure code, attempts consumed, repair history, rollout version, and validator version.

Recovery validation must reject:

- `I cannot read the order` when readable chunks were retrieved;
- `I am retrying` without a durable retry record;
- requests to re-upload a document that remains available;
- a generic sentence followed by a second generic sentence;
- references to a document absent from the current turn's activation receipt;
- unrelated document-analysis language for a social or future-upload turn; and
- any arbitrary provider-produced fallback payload.

### 7.3 Contextual recovery examples

If a retry has been scheduled:

> I found the signed order and retrieved its text, but the analysis stream was interrupted. I’m retrying from the saved evidence now.

If all automatic attempts are exhausted:

> I found the signed order and retrieved its text, but the analysis did not finish. The order remains available here; retry this response and I’ll reuse the saved evidence.

The product may vary natural phrasing, but every factual clause must be licensed by the recovery receipt. Canned copy is a last renderer, not a publication bypass.

## 8. Workstream D — reduce document-analysis overload

### 8.1 Operation-specific prompt budgets

Add a server-owned prompt budget calculated in estimated tokens, not characters.

| Operation | Documents | Source packets | Estimated evidence-token ceiling |
|---|---:|---:|---:|
| identify/capability | 1–3 metadata records | 0–2 | 4,000 |
| focused question | 1 canonical document | 4–8 | 24,000 |
| requested page/quote | 1 canonical document | requested page plus neighbors | 16,000 |
| scoped summary | 1 canonical document | 6–10 | 32,000 |
| compare documents | 2 canonical documents | 4–6 each | 36,000 |
| exhaustive review | durable workflow | not synchronous | node-bounded |

Budgets include system, conversation, evidence, schema, and output allowance. The worker must log only counts and estimates, never raw document text.

### 8.2 Behavior for broad requests

`Analyze the signed court order file.` is an open analysis request, not automatic permission to perform an unbounded exhaustive review.

The accepted behavior is either:

- a concise evidence-grounded overview followed by focused choices; or
- one concise question offering focused terms, deadlines, custody/possession, comparison, or exhaustive review.

If the user selects exhaustive review, create/resume a durable review job and report status. Do not stuff the entire order into a single synchronous structured response.

### 8.3 Deduplication before retrieval

Before scoring chunks:

1. filter unauthorized, deleted, quarantined, and QA-ineligible documents;
2. collapse exact duplicate hashes to the canonical active document;
3. apply explicit current-turn and active-document priority;
4. detect material same-name ambiguity after deduplication;
5. retrieve within the operation budget; and
6. persist candidates-before-filter, rejection reasons, canonical group, and final selection.

The execution plan itself must contain only the post-authorization canonical selection. It may not carry quarantined IDs merely because a later retrieval layer will filter them.

## 9. Workstream E — repair and verify the 46-page exhaustive review

### 9.1 Root cause and compatibility decision

The failed run is a legacy `dur_v1` run. It stopped after one verified node because a later provider response contained unterminated JSON. The current worker deliberately routes non-current run versions through the legacy processor. Resuming that run would therefore reuse the failure-prone legacy path.

The production remediation must preserve the legacy run and start a new current-version durable review for the same active memory generation and complete coverage manifest. Do not mark the legacy run successful and do not import its result as a final root.

### 9.2 Preconditions

Before restart, verify atomically:

- the document is ready, owned, non-quarantined, and still the canonical active order;
- its active memory generation has not changed;
- the coverage manifest is complete;
- all 46 expected page units succeeded;
- all 33 canonical chunks belong to that memory generation;
- no newer current-version review is already running or ready; and
- the owner-only rollout remains frozen from expansion.

### 9.3 Current-version restart

Use `restartOwnedDocumentVersion` semantics to create a new immutable run with a new stable job ID and `UNDERSTANDING_VERSION`. Snapshot the file's review pointers before changing them. The old run and its verified legacy node remain historical evidence.

Each new map/reduce node must:

- have deterministic identity from run, phase, level, source range, and input hash;
- persist provider request and attempt metadata;
- validate schema and source lineage before becoming verified;
- retry malformed JSON with strict prompting;
- split an exhausted node into smaller source ranges;
- preserve every verified sibling node; and
- dead-letter only the isolated node after its stored budget is exhausted.

### 9.4 Completion proof

`fullDocumentReviewStatus='ready'` may be written only when a completion receipt proves:

```text
coverage manifest: 46/46 succeeded
canonical chunks: 33/33 represented
map nodes: all source ranges contiguous, non-overlapping, verified
reduce root: verified and bound to the same generation/manifest
source chunk indexes: complete set
active understanding record: verified
rendered review: generated from the verified root
```

The receipt and active record must be queryable by support tooling. Any missing range leaves the state `partial` or `failed`, never `ready`.

## 10. Data and API changes

### Additive schema

- Add `chatGenerationAttempts` and indexes by job, turn, status, and creation time.
- Extend `responsePublicationAudits.decision` with `publish_recovery`.
- Add optional `responseClass`, `failureCode`, `attemptCount`, and `recoveryReceiptJson` fields.
- Add `retry_scheduled`/`retry_waiting` lifecycle states where needed, without removing legacy literals.
- Extend repair snapshots to cover every mutable future-facing reference table registered for document repair.
- Add a linked-parent repair-run field so the derived-state run points to the original quarantine audit.
- Add optional supersession/eligibility metadata to historical retrieval and evidence receipts instead of deleting them.

### Internal operations

```text
productionStateRepair.auditDocumentReferenceGraph
productionStateRepair.previewDerivedStateRepair
productionStateRepair.snapshotDerivedStateRepair
productionStateRepair.applyDerivedStateRepairBatch
productionStateRepair.verifyDocumentReferenceGraph

chatTurns.recordGenerationAttempt
chatTurns.scheduleGenerationRetry
chatTurns.prepareRecoveryCandidate
chatTurns.commitValidatedRecovery

documentUnderstanding.previewRestart
documentUnderstanding.restartOwnedDocumentVersion
documentUnderstanding.getCompletionReceipt
```

All production mutations require server-derived scope, operator identity, reason, change ticket, idempotency key, and the existing approval/confirmation mechanism.

## 11. File-level implementation map

| File | Required change |
|---|---|
| `convex/schema.ts` | Add attempt ledger, recovery publication fields, repair linkage/snapshot targets, and additive statuses/indexes. |
| `convex/productionStateRepair.ts` | Traverse all authorized case conversations, snapshot reverse references, canonicalize active state, and verify idempotency. |
| `src/lib/nexx/qaStateRepair.ts` | Add typed reference registry, canonical patch construction, and pure repair validators. |
| `convex/conversationControl.ts` | Filter active/pending document IDs through current eligibility before persisting plans and tasks. |
| `src/lib/nexx/orchestration/executionPlan.ts` | Accept only post-authorization canonical document IDs. |
| `convex/chatTurns.ts` | Persist attempts/retries; replace direct recovery commit with validated recovery. |
| `convex/chatWorker.ts` | Use typed stream terminal states, absolute deadlines, compact retries, and reserved commit time. |
| `src/lib/nexx/agenticOutcome.ts` | Classify interrupted streams/timeouts explicitly and derive receipt-backed recovery outcomes. |
| `src/lib/nexx/provider/streamLifecycle.ts` | New stream event collector, deadlines, terminal classification, and redacted metrics. |
| `src/lib/nexx/provider/promptBudget.ts` | New operation-aware token budget and packet compaction policy. |
| `src/lib/nexx/response/publicationContract.ts` | Add recovery envelope v2 and conversational-appropriateness/retry-truth checks. |
| `src/lib/nexx/legal-engine/genericAnswerPolicy.ts` | Keep whole-response genericity detection authoritative for repeated generic clauses and padding. |
| `src/lib/nexx/response/claimVerifier.ts` | Apply the genericity and conversational-appropriateness results to answers, limitations, and recovery candidates. |
| `convex/documentUnderstanding.ts` | Add restart preflight/completion receipt and reject legacy-version resume for this migration. |
| `convex/executiveChatOperations.ts` | Report stream interruptions, retry recovery, unaudited recovery, prompt budgets, and stale document references. |
| `scripts/report-executive-chat-health.mjs` | Surface the new hard/soft stop metrics and per-cohort counts. |
| `docs/runbooks/executive-chat-state-repair.md` | Add reverse-reference/canonicalization procedure. |
| `docs/runbooks/executive-chat-incident-response.md` | Add stream interruption and recovery-publication triage. |
| `docs/runbooks/executive-chat-rollout.md` | Reset observation after a canary failure and require a clean owner sequence. |

## 12. Required tests

### State repair

1. A synthetic file in conversation A is referenced by genuine conversation B in the same case; repair finds B.
2. A same-case conversation owned by another user is rejected rather than scanned or modified.
3. Two quarantined IDs embedded in pending-option JSON are removed and the pending act is cleared.
4. Four genuine duplicates remain in upload history while only one canonical ID remains active.
5. Same filename with different hash is not auto-deduplicated.
6. Exact hash duplicate resolves to the active canonical document.
7. A record changed after snapshot produces a conflict and is not overwritten.
8. The second repair run produces zero mutations.
9. Restore refuses a post-repair legitimate change.
10. Quarantined IDs are absent from every future-facing table in the registry.

### Stream and retry

11. Stream completes normally.
12. Iterator ends after deltas without a terminal event.
13. Iterator ends before any delta.
14. Absolute deadline fires while deltas continue.
15. Inactivity deadline fires after streaming starts.
16. `response.incomplete` reports output-token exhaustion.
17. `response.failed` supplies a retryable provider code.
18. Response ID is captured from a non-terminal event.
19. Compact retry succeeds and creates one assistant message.
20. Continuation succeeds and preserves plan/evidence hashes.
21. Stale focus between attempts forces one replan.
22. Lease expiration and scheduled retry cannot both commit.
23. Three exhausted attempts create one audited recovery message.
24. Authentication failure does not loop.

### Publication and appropriateness

25. Recovery cannot commit without an envelope.
26. Recovery claiming `I’m retrying` is rejected without a retry receipt.
27. Recovery claiming the order is unavailable is rejected when evidence was retrieved.
28. Two generic sentences cannot bypass the generic-answer detector.
29. Social `hey` receives a greeting while document focus remains silent.
30. `I will reupload` waits for a new upload and does not retrieve historical documents.
31. `Analyze file → which → please do so` retains the canonical order and completes.
32. No publication audit is a hard-stop test failure.

### Prompt and durable review

33. Focused question stays within token and packet budgets.
34. Duplicate uploads do not multiply source packets.
35. Broad `Analyze` does not silently become exhaustive synchronous analysis.
36. Explicit exhaustive review creates/resumes durable work.
37. Legacy failed run remains immutable when the current-version restart begins.
38. Malformed node JSON retries strictly, then splits if needed.
39. Verified sibling nodes survive one node's failure.
40. Completion is rejected with one missing page or chunk.
41. The reported 46-page/33-chunk fixture produces a verified root and `ready` receipt.

### Production-safe browser sequence

Run first in isolated synthetic scope, then—only with explicit owner authorization—one message at a time in the genuine conversation:

```text
Analyze the signed court order file.
which
please do so
hey
I will reupload the court order for a fresh extraction.
```

Stop at the first broken boundary. Do not send later messages merely to collect more failures.

## 13. Observability and rollout stops

Add cohort-segmented metrics:

- stream terminal-event rate;
- interrupted-stream rate;
- first-attempt and retry recovery rates;
- retry scheduling latency;
- attempt duration and reserved-time violations;
- evidence token estimate and source-packet count;
- pre-filter and post-filter document counts;
- quarantined/stale document IDs found in plans;
- committed recoveries with and without publication audits;
- generic recovery rejection rate;
- durable-review verified/retrying/exhausted node counts; and
- coverage-to-root completion consistency.

Hard stops:

- any quarantined or unauthorized document reaches provider input;
- any future-facing plan/control state is persisted with an ineligible document under enforcement;
- any assistant recovery commits without a publication audit;
- any retry produces duplicate assistant messages;
- any exhaustive review is marked ready without a complete receipt;
- any source snapshot or genuine upload is modified outside its approved patch.

Soft stops:

- unexplained fallback rate above 1%;
- interrupted-stream rate above 0.5%;
- retry exhaustion above 1%;
- prompt-budget compaction above 10% of focused turns;
- owner-canary sequence failure; or
- p95 response latency regression above 20%.

## 14. Delivery sequence

### PR 1 — characterization, typed failures, and schema

- Add the live failure reproduction with an iterator that ends without a terminal event.
- Add the cross-conversation repair reproduction.
- Add attempt-ledger and publication-audit schema changes.
- Add new invariant and metric codes.

Exit: the current behavior fails deterministically and all schema changes are additive.

### PR 2 — reverse-reference repair and canonical document selection

- Implement the reference registry and user/case traversal.
- Implement canonical active-set construction and pending-state cleanup.
- Add preview, snapshot, apply, verify, restore, and idempotency tests.
- Filter plan creation before IDs are persisted.

Exit: a dry run for the reported case proposes only the approved derived-state changes and no genuine upload mutation.

### PR 3 — stream lifecycle and retry budgets

- Implement typed stream terminals, response-ID capture, absolute/inactivity deadlines, and attempt ledger.
- Move long retries to fresh job invocations.
- Implement continuation and compact evidence retry.

Exit: interruption fault injection recovers without a user-visible fallback and without duplicate responses.

### PR 4 — validated recovery publication

- Implement envelope v2, whole-response genericity, retry-truth, and conversational-appropriateness checks.
- Remove all direct calls that commit recovery copy outside the validator.
- Add hard-stop telemetry for missing recovery audits.

Exit: mutation-level tests prove that no recovery path can bypass publication.

### PR 5 — prompt budgets and durable-review routing

- Implement canonical deduplication before retrieval.
- Add question-kind packet/token budgets.
- Route exhaustive requests to durable work.
- Add current-version restart preflight and completion receipt.

Exit: the 46-page fixture completes through bounded durable nodes and focused chat never receives an exhaustive packet.

### PR 6 — production operations and remediation

- Deploy compatible web and Convex artifacts with new behavior disabled or shadowed.
- Run preview and isolated production canaries.
- Produce the reported-case read-only repair diff.
- Obtain/verify production repair approval, snapshot, apply, verify, and rerun idempotently.
- Start the current-version exhaustive review and observe it through verified completion.
- Run the owner-authorized live sequence one message at a time.

Exit: no hard/soft stop remains and the owner sequence passes.

## 15. Production rollout

1. Freeze Stage 1 expansion and keep general traffic at 0%.
2. Ship additive schema and read-compatible code.
3. Enable stream telemetry in shadow for all eligible internal traffic.
4. Enable reverse-reference validation in shadow; any stale/quarantined ID is a hard stop for promotion.
5. Run the isolated synthetic browser matrix.
6. Apply the separately approved derived-state repair and verify zero residual future-facing references.
7. Complete the new 46-page durable review and verify its receipt.
8. Enable stream recovery and validated recovery publication for the owner account only.
9. Run the owner-authorized sequence and capture turn, attempt, evidence, and publication receipts.
10. Restart the 24-hour owner observation window from the first clean post-fix turn.
11. Promote publication enforcement only after 24 uninterrupted healthy hours.
12. Expand beyond the owner only through a separately proposed and approved rollout version.

The previous activation timestamp does not satisfy this hold because the first eligible live turn triggered the fallback-rate soft stop.

## 16. Acceptance criteria

Implementation is accepted only when:

1. the reported conversation has one eligible canonical active order and no quarantined IDs in future-facing state;
2. all four genuine upload records and their source content are unchanged;
3. the linked repair has immutable snapshots, zero conflicts, complete verification, and a zero-change second run;
4. a stream without a terminal event is classified retryable and recorded as an attempt;
5. automatic recovery succeeds without publishing a fallback in the fault-injection test;
6. exhausted recovery produces a contextual, audited publication rather than canned unaudited copy;
7. every user-visible assistant message, including recovery, has a valid publication audit;
8. focused document turns remain within operation-specific prompt budgets;
9. exact duplicates do not multiply retrieval evidence;
10. the new exhaustive-review run proves 46/46 pages and 33/33 chunks through a verified root;
11. `Analyze file → which → please do so` passes in deterministic, integration, browser, and owner-canary lanes;
12. `hey` and future-upload intent behave conversationally without losing silent task focus;
13. the rollout dashboard has no hard stops or soft stops for the full new 24-hour owner observation window; and
14. no broader production cohort is activated without a new approved configuration.

## 17. Definition of done

This remediation is not complete when the fallback wording merely improves. It is complete when the system can prove that it selected only eligible evidence, bounded the work, recovered an interrupted stream under a durable attempt budget, published only validated content, preserved the user's task, and completed the exhaustive review from a verified 46-page evidence chain.
