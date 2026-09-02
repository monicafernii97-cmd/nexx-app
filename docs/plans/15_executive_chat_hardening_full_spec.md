# Nexx Executive Chat Hardening — Full Implementation Specification

**Status:** Implementation-ready  
**Priority:** P0 response integrity  
**Production baseline:** `origin/main@be483e0ef1659e3169d1679337e7a87f9bddc47b`  
**Reconciliation evidence:** `docs/plans/14_production_reconciliation_2026-09-01.md`  
**Supersedes for this work:** the proposed portions of Plans 12 and 13 where this specification defines a stronger contract

## 1. Product requirement

Nexx must behave like a high-executive-functioning conversational system. It must retain the user's goal, understand how a short message relates to prior turns, resolve references to documents and prior assistant offers, select the strongest capability that is actually available, detect contradictions in its own proposed answer, and recover without forcing the user to reconstruct the conversation.

The product must be robust to normal human communication rather than requiring perfect prompts. This includes fragments, typos, corrections, delayed confirmations, abrupt topic changes, unusual word choices, and references such as “which,” “that,” “the other one,” and “please do so.”

The design is deterministic at safety and state boundaries while allowing the model to reason within an explicit plan. “Agentic” does not authorize the model to mutate conversation state or declare capabilities without verification.

## 2. Scope

### In scope

- Turn understanding and conversational speech acts.
- Continuity, referent resolution, pending questions, and pending offers.
- Durable task/focus state independent of route selection.
- Document and tool capability reasoning.
- Evidence planning and retrieval continuity.
- Canonical answer planning for substantive legal/document responses.
- Draft verification, repair, reassessment, and safe fallback.
- A non-bypassable response publication boundary.
- Correction and supersession lineage.
- Idempotency and concurrent-turn protection.
- Internal diagnostics, quality metrics, synthetic canaries, and release compatibility.
- Migration from the current route-centric conversation state.
- Unit, integration, property, adversarial sequence, browser, and production-safe tests.

### Out of scope

- Replacing the current model provider.
- Rewriting document extraction or OCR engines that already satisfy their contracts.
- Autonomous filing, messaging, or external legal action.
- Presenting internal confidence scores or orchestration jargon to users.
- Using conversation data outside its existing authorization scope.

## 3. Baseline findings this design must correct

1. `src/app/api/chat/route.ts` and `convex/chatTurns.ts` resolve each turn using `conversation.routeMode` as active context.
2. `acceptChatTurn` writes the newly resolved route back to `conversations.routeMode`, allowing a fragment to replace the apparent active context.
3. `src/lib/nexx/router.ts` contains useful heuristics but does not model pending assistant questions/offers or general referents.
4. `conversationLegalIssueState` is narrow and is normally persisted only after a successful, non-degraded legal interpretation.
5. `fullDocumentReviewStatus`, coverage, extracted chunks, requested pages, and hosted search availability exist but are not normalized into an operation-aware capability ledger.
6. `runtimeCapabilitySnapshot` and `responseCompositionTrace` are metadata. `completeAssistant` does not require their validity before marking a message committed.
7. Explicit reassessment exists, but implicit contradictions can still reach the user.
8. Existing tests validate many individual classifiers and response paths but not the complete state transition chain for sufficiently odd multi-turn sequences.

## 4. Required user-visible behavior

### 4.1 Continuation

When the user sends a short or ambiguous message, Nexx first attempts to relate it to:

1. the assistant's last unanswered question;
2. the assistant's last actionable offer;
3. the user's last unresolved request;
4. the current active task;
5. the current active document set;
6. a recent option list or correction target.

If one interpretation is materially more likely, Nexx proceeds and makes the inferred object clear in natural language. If two materially different actions remain plausible, Nexx asks one concise clarification while preserving the current task and evidence.

### 4.2 Capability truth

Nexx describes the exact unavailable operation, not a broader inability. For example:

- Good: “The exhaustive page-by-page review did not finish, but the order text is extracted. I can answer a focused question or review a specified section now.”
- Invalid: “I cannot read the order,” when extracted text or relevant chunks are available.
- Good: “I can read pages 10–14, but I cannot verify that this is the only controlling language elsewhere in the order yet.”
- Invalid: “The order definitely contains no other exception,” without verified exhaustive coverage.

### 4.3 Recovery

The user is not required to re-upload, restate, or paste content that remains available and authorized. Nexx retries, narrows, uses an alternate retrieval path, or asks for only the missing decision.

### 4.4 Unknown words and malformed input

An unknown single word is treated as information to interpret, not as permission to discard context. The resolver tests whether it is:

- an answer to a pending question;
- a filename/name/acronym;
- a typo or phonetic transcription;
- a selection label;
- a new topic;
- or truly uninterpretable.

If no confident interpretation exists, the assistant asks what the word refers to and retains the current task.

## 5. System invariants

Each invariant receives a stable code used by tests and telemetry.

| Code | Invariant |
|---|---|
| `INV-FOCUS-001` | An uncertain turn cannot clear or replace active task state. |
| `INV-FOCUS-002` | A per-turn route cannot mutate focus without an accepted focus transition. |
| `INV-REF-001` | An unresolved referent cannot be silently bound when alternatives imply materially different actions. |
| `INV-CAP-001` | A higher-level capability failure cannot negate a proven lower-level capability. |
| `INV-CAP-002` | Every user-facing capability/limitation claim must be licensed by the current capability ledger. |
| `INV-EVID-001` | Every substantive document proposition must reference authorized evidence or be labeled as an inference/general guidance. |
| `INV-PUB-001` | No substantive assistant message can be committed without a valid publication envelope. |
| `INV-PUB-002` | The publication envelope must match the current plan, focus revision, evidence hash, and capability hash. |
| `INV-REC-001` | A generation failure must leave the accepted task and evidence selection recoverable. |
| `INV-CORR-001` | A correction must identify and supersede its target without rewriting message history. |
| `INV-IDEM-001` | Retried request IDs create at most one logical turn and response. |
| `INV-ISO-001` | All task, document, evidence, and correction references must pass user/conversation/case authorization. |
| `INV-REL-001` | Web and backend release manifests must be compatible before full promotion. |

## 6. Conversational control model

The current single route field is replaced as the conceptual authority by four layers:

```text
Conversation focus: what goal remains active
Turn understanding: what this message is doing
Execution plan: how this turn will be answered
Route mode: which existing response policy assists execution
```

Route mode remains during migration but becomes derived, per-turn data.

### 6.1 `ConversationControlState`

Add `conversationControlStates` to `convex/schema.ts`:

```ts
conversationControlStates: defineTable({
  conversationId: v.id('conversations'),
  userId: v.id('users'),
  caseId: v.optional(v.id('cases')),
  schemaVersion: v.literal(1),
  focusRevision: v.number(),
  activeTaskId: v.optional(v.string()),
  activeTaskKind: v.optional(v.union(
    v.literal('document_review'),
    v.literal('document_question'),
    v.literal('legal_question'),
    v.literal('draft'),
    v.literal('strategy'),
    v.literal('procedure'),
    v.literal('relational'),
    v.literal('general'),
  )),
  activeIssueKey: v.optional(v.string()),
  activeDocumentIds: v.array(v.id('uploadedFiles')),
  activeEvidenceGenerationIds: v.array(v.id('documentMemoryGenerations')),
  parentTaskId: v.optional(v.string()),
  pendingAct: v.optional(v.union(
    v.literal('select'),
    v.literal('confirm'),
    v.literal('continue'),
    v.literal('clarify'),
    v.literal('supply_detail'),
  )),
  pendingOptionsJson: v.optional(v.string()),
  pendingSourceTurnId: v.optional(v.id('chatTurns')),
  lastAssistantOfferJson: v.optional(v.string()),
  lastResolvedReferentsJson: v.optional(v.string()),
  confidence: v.number(),
  provenance: v.union(
    v.literal('native_v1'),
    v.literal('migrated_route'),
    v.literal('migrated_issue'),
    v.literal('recovered'),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_conversation', ['conversationId'])
  .index('by_user_updated', ['userId', 'updatedAt'])
  .index('by_active_task', ['conversationId', 'activeTaskId']);
```

Only server-internal transition mutations may modify this table. Public clients cannot submit a focus revision, task ID, evidence generation ID, pending option, or confidence value.

### 6.2 `conversationTasks`

Add append-oriented task records so returning to a prior task does not depend on a mutable snapshot:

```ts
conversationTasks: defineTable({
  conversationId: v.id('conversations'),
  userId: v.id('users'),
  caseId: v.optional(v.id('cases')),
  taskId: v.string(),
  parentTaskId: v.optional(v.string()),
  kind: v.string(),
  status: v.union(
    v.literal('provisional'),
    v.literal('active'),
    v.literal('waiting_user'),
    v.literal('waiting_system'),
    v.literal('completed'),
    v.literal('superseded'),
    v.literal('abandoned'),
  ),
  goal: v.string(),
  normalizedGoal: v.string(),
  issueKey: v.optional(v.string()),
  documentIds: v.array(v.id('uploadedFiles')),
  evidenceGenerationIds: v.array(v.id('documentMemoryGenerations')),
  originatingTurnId: v.id('chatTurns'),
  latestTurnId: v.id('chatTurns'),
  resultMessageId: v.optional(v.id('messages')),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_conversation_status', ['conversationId', 'status'])
  .index('by_conversation_task', ['conversationId', 'taskId'])
  .index('by_user_updated', ['userId', 'updatedAt']);
```

### 6.3 `turnUnderstandings`

Persist the interpretation used for each accepted turn:

```ts
turnUnderstandings: defineTable({
  turnId: v.id('chatTurns'),
  conversationId: v.id('conversations'),
  userId: v.id('users'),
  schemaVersion: v.literal(1),
  speechAct: v.union(
    v.literal('ask'), v.literal('answer'), v.literal('select'),
    v.literal('confirm'), v.literal('continue'), v.literal('clarify'),
    v.literal('correct'), v.literal('challenge'), v.literal('reassess'),
    v.literal('cancel'), v.literal('switch_topic'), v.literal('social'),
    v.literal('unknown')
  ),
  continuity: v.union(
    v.literal('same_task'), v.literal('related_task'),
    v.literal('new_task'), v.literal('uncertain')
  ),
  requestedOperation: v.optional(v.string()),
  referentsJson: v.string(),
  candidateTasksJson: v.string(),
  confidence: v.number(),
  ambiguityMaterial: v.boolean(),
  reasonCodes: v.array(v.string()),
  resolverVersion: v.string(),
  createdAt: v.number(),
})
  .index('by_turn', ['turnId'])
  .index('by_conversation', ['conversationId']);
```

Confidence is diagnostic, not the only decision criterion. Deterministic hard rules override a model score.

### 6.4 Pending options contract

`pendingOptionsJson` validates after parsing against:

```ts
type PendingOption = {
  optionId: string;
  label: string;
  aliases: string[];
  action: 'select_document' | 'select_scope' | 'confirm_action' | 'supply_fact';
  targetTaskId: string;
  documentIds: string[];
  sourceMessageId?: string;
  expiresAfterFocusRevision: number;
};
```

The assistant renderer records offers/questions only after the final response is verified. A streamed draft cannot create durable pending options.

## 7. Turn-understanding algorithm

Implement in `src/lib/nexx/orchestration/turnUnderstanding.ts` and `referentResolver.ts`.

### 7.1 Input

```ts
type TurnUnderstandingInput = {
  message: string;
  currentAttachments: AttachmentDescriptor[];
  controlState?: ConversationControlState;
  activeTasks: ConversationTask[];
  recentUserTurns: MinimalMessage[];
  recentAssistantTurns: MinimalMessage[];
  conversationSummary?: string;
  activeDocumentDescriptors: DocumentDescriptor[];
};
```

Recent assistant turns include structured question/offer metadata; they are not parsed from prose when structured metadata exists.

### 7.2 Deterministic pass

Normalize Unicode, whitespace, case, punctuation, common speech-to-text artifacts, and reply quoting without removing filenames or legal identifiers.

Evaluate in this order:

1. Safety emergency or disallowed action.
2. Explicit cancel/stop.
3. Explicit new topic markers.
4. Current attachment or explicit document name/ordinal.
5. Explicit correction/challenge/reassessment.
6. Answer/selection matching a live pending option.
7. Confirmation/continuation matching a single pending act or offer.
8. Pronoun/demonstrative reference to the last compatible object.
9. Elliptical question continuing the active task.
10. Social/filler message.
11. Unknown/uncertain.

### 7.3 Candidate scoring

Candidate task/referent scores use bounded, explainable factors:

```text
+0.35 exact pending-option alias
+0.30 direct document ID/name/ordinal match
+0.25 required speech act matches pending act
+0.20 immediately preceding unanswered assistant question
+0.15 same requested operation
+0.15 active task
+0.10 active document
+0.05 recent related task
-0.35 explicit incompatible topic
-0.25 expired option/focus revision
-1.00 authorization failure
```

Scores are clamped to `[0,1]`. The constants are initial values and must be calibrated against the sequence corpus before full rollout.

### 7.4 Decision thresholds

- Resolve automatically when top candidate is at least `0.72`, exceeds the second candidate by `0.18`, and the action is reversible/non-destructive.
- Clarify when top candidates imply materially different documents, tasks, drafts, or legal conclusions and the margin is below `0.18`.
- Retain focus without action for pure filler/social turns.
- Never automatically cross user/case/conversation authorization boundaries regardless of score.
- Never use a summary alone to reselect a document that is no longer active/authorized.

Thresholds live in one versioned policy module, not scattered regex conditions.

### 7.5 Semantic arbitration

Call a small structured classifier only when deterministic resolution returns `uncertain` and ambiguity is material. The classifier receives redacted task labels, option labels, speech-act candidates, and recent conversational acts—not full document text unless necessary.

Required response schema:

```ts
{
  speechAct: SpeechAct;
  candidateId: string | null;
  confidence: number;
  explanationCode: string;
}
```

The result is advisory. It cannot select an unauthorized target, bypass threshold/margin rules, or mutate state.

## 8. Focus transition engine

Implement `decideFocusTransition()` as a pure function returning one of:

```ts
type FocusTransition =
  | { kind: 'retain'; reasonCodes: string[] }
  | { kind: 'refine'; taskId: string; patch: TaskRefinement; reasonCodes: string[] }
  | { kind: 'branch'; parentTaskId: string; newTask: ProvisionalTask; reasonCodes: string[] }
  | { kind: 'replace'; previousTaskId?: string; newTask: ProvisionalTask; reasonCodes: string[] }
  | { kind: 'clarify'; candidateIds: string[]; reasonCodes: string[] };
```

Rules:

- `uncertain` continuity always yields `retain` or `clarify`.
- `confirm`, `continue`, `select`, and `answer` refine the task associated with the pending act.
- A correction refines or branches from the target task; it does not discard the target before correction succeeds.
- An explicit unrelated request replaces focus but leaves the old task retrievable.
- A related request with a new deliverable branches.
- Social turns retain focus but may clear an expired purely-social pending act.
- Failed/degraded generation never applies a proposed `replace` after acceptance unless the new user task itself was unambiguous; even then the old task remains in task history.

Apply transitions through a compare-and-swap mutation using `expectedFocusRevision`. A mismatch causes re-resolution with the latest state; it never applies a stale decision.

## 9. Execution plan

Add `turnExecutionPlans`:

```ts
turnExecutionPlans: defineTable({
  planId: v.string(),
  turnId: v.id('chatTurns'),
  conversationId: v.id('conversations'),
  userId: v.id('users'),
  schemaVersion: v.literal(1),
  focusRevision: v.number(),
  taskId: v.string(),
  responseAct: v.union(
    v.literal('answer'), v.literal('clarify'), v.literal('confirm'),
    v.literal('correct'), v.literal('status'), v.literal('safe_limit')
  ),
  routeMode: routeModeValidator,
  selectedDocumentIds: v.array(v.id('uploadedFiles')),
  evidenceRequirements: v.array(v.string()),
  retrievalQueries: v.array(v.string()),
  capabilityRequirements: v.array(v.string()),
  fallbackOrder: v.array(v.string()),
  questionContractJson: v.string(),
  status: v.union(
    v.literal('planned'), v.literal('executing'), v.literal('superseded'),
    v.literal('completed'), v.literal('failed_recoverable')
  ),
  plannerVersion: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_turn', ['turnId'])
  .index('by_conversation_status', ['conversationId', 'status']);
```

The route is selected after understanding/focus resolution. `src/lib/nexx/router.ts` becomes `resolveExecutionRoute(understanding, task, requirements)` while retaining the old export behind a migration adapter until all callers move.

## 10. Capability ledger

Implement `src/lib/nexx/capabilities/documentCapabilityLedger.ts`.

### 10.1 Capability snapshot

```ts
type DocumentCapabilitySnapshot = {
  schemaVersion: 1;
  turnId: string;
  computedAt: number;
  documents: Array<{
    uploadedFileId: string;
    filename: string;
    status: 'uploaded' | 'processing' | 'ready' | 'partial' | 'failed' | 'quarantined' | 'deleted';
    authorized: boolean;
    binaryStored: boolean;
    metadataAvailable: boolean;
    textExtracted: boolean;
    extractedCharacterCount: number;
    pageCountKnown: boolean;
    pagesTotal?: number;
    availablePageRanges: Array<[number, number]>;
    requestedPagesAvailable: boolean;
    chunksAvailable: boolean;
    activeMemoryAvailable: boolean;
    keywordSearchAvailable: boolean;
    semanticSearchAvailable: boolean;
    hostedFileSearchAvailable: boolean;
    citationAnchorsAvailable: boolean;
    coverageStatus: 'complete' | 'partial' | 'failed' | 'unverified';
    fullDocumentReviewStatus: 'not_started' | 'building' | 'ready' | 'partial' | 'failed';
    limitations: CapabilityLimitation[];
  }>;
  tools: {
    webSearch: boolean;
    fileSearch: boolean;
    outputContinuation: boolean;
    deterministicTextSearch: boolean;
  };
  snapshotHash: string;
};
```

### 10.2 Operation requirements

Create a registry:

| Operation | Minimum capability | Stronger claim requirement |
|---|---|---|
| Identify file | authorized metadata | none |
| Quote requested page | requested page text + anchor | OCR confidence disclosure when applicable |
| Answer focused clause question | relevant chunks/text + evidence anchor | interacting-clause caveat if coverage incomplete |
| Scoped summary | selected scope accounted for | scope named in response |
| Search order | chunks/text search | disclose search scope if incomplete |
| Exhaustive whole-document review | complete coverage + ready understanding record | source-unit accounting |
| Compare documents | minimum scoped capability for every compared file | distinguish unavailable portions |
| Draft from order | supported controlling proposition + anchors | prohibit unsupported obligations/deadlines |

The planner asks `canPerform(operation, snapshot)` and receives:

```ts
type CapabilityDecision = {
  allowed: boolean;
  supportLevel: 'complete' | 'scoped' | 'partial' | 'none';
  usableDocumentIds: string[];
  missingRequirements: string[];
  prohibitedClaims: string[];
  userSafeLimitations: Array<{ code: string; text: string }>;
  alternateOperations: string[];
};
```

### 10.3 Snapshot timing

Compute once after plan creation and again immediately before publication. If the hash changes:

- upgrade silently when new capabilities only expand support and claims remain valid;
- reverify when evidence or coverage changed;
- reject publication when authorization, document status, or required capability weakened.

## 11. Evidence acquisition

Evidence selection is task- and operation-driven, not route-driven.

### Required changes

- `shouldForceStoredDocumentGrounding` consumes the execution plan and active task, not only route/current-turn wording.
- An active document follow-up retains selected document IDs even when the literal follow-up contains no file words.
- Every retrieval run records plan ID, task ID, focus revision, selected documents, query terms, source chunk IDs, generation IDs, and capability snapshot hash.
- Zero retrieval from an active readable document triggers deterministic fallback search and then reassessment before any limitation is drafted.
- Full-document understanding failure does not prevent direct chunk/page retrieval.
- Evidence from inactive/superseded generations is rejected unless a specific historical comparison requests it.

## 12. Question and answer contracts

Extend `questionContract.ts` kinds:

```ts
type QuestionKind =
  | 'yes_no' | 'either_or' | 'selection' | 'meaning' | 'schedule'
  | 'communication' | 'scope' | 'capability' | 'confirmation'
  | 'correction' | 'status' | 'open_analysis' | 'other';
```

Each contract defines:

- requested deliverable;
- direct-answer shape;
- required terms/concepts;
- required evidence roles;
- whether clarification is permitted before answering;
- what would count as generic/nonresponsive;
- valid next actions;
- forbidden answer substitutions.

Example: a capability question cannot be answered with a generic request to paste pages when the capability ledger shows usable extracted text.

## 13. Canonical answer plan

For document/legal routes, `canonicalAnswerPlan.ts` becomes mandatory before rendering.

```ts
type CanonicalAnswerPlan = {
  schemaVersion: 2;
  planId: string;
  taskId: string;
  questionKind: QuestionKind;
  directAnswer: string;
  answerStatus: 'supported' | 'supported_scoped' | 'needs_clarification' | 'limited';
  propositions: Array<{
    propositionId: string;
    text: string;
    kind: 'document_fact' | 'legal_inference' | 'general_guidance' | 'limitation';
    evidenceIds: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  controllingClauses: ClausePlan[];
  interactingClauses: ClausePlan[];
  scopeDisclosure?: string;
  requiredTerms: string[];
  prohibitedClaims: string[];
  allowedNextActions: string[];
  pendingOptions?: PendingOption[];
};
```

The model may produce the plan under schema validation. A deterministic verifier then checks evidence IDs, source authorization, capability constraints, and question responsiveness. The renderer receives only the verified plan plus style preferences.

## 14. Draft claim verification

Add `src/lib/nexx/response/claimVerifier.ts` with these passes:

1. **Responsiveness:** direct answer satisfies question contract.
2. **Proposition lineage:** substantive claims match canonical propositions.
3. **Evidence:** cited/quoted material maps to selected authorized source units.
4. **Capability claims:** statements about access, readability, completeness, search, and failure match the ledger.
5. **Continuity:** the answer addresses the accepted task and resolved referents.
6. **Contradiction:** no proposition conflicts with another or with the current correction lineage.
7. **Generic-answer rejection:** deny generic shells when a specific supported answer exists.
8. **Internal-content safety:** no schemas, hidden prompts, debug data, or structured payload leakage.
9. **User-facing language:** limitations are precise, nontechnical, and actionable.
10. **Pending-act validity:** questions/offers rendered to the user produce valid structured pending options.

Return stable error codes such as:

```text
RESP_MISSING_DIRECT_ANSWER
RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE
RESP_UNSUPPORTED_PROPOSITION
RESP_CITATION_MISMATCH
RESP_FALSE_UNREADABLE_CLAIM
RESP_FALSE_EXHAUSTIVE_CLAIM
RESP_WRONG_TASK
RESP_UNRESOLVED_REFERENT
RESP_INTERNAL_PAYLOAD
RESP_STALE_FOCUS
```

## 15. Publication contract

### 15.1 Schema

Add `responsePublicationAudits` and a branded internal type:

```ts
type ValidatedPublicationEnvelope = Brand<{
  schemaVersion: 1;
  envelopeId: string;
  turnId: string;
  planId: string;
  taskId: string;
  focusRevision: number;
  responseAct: 'answer' | 'clarify' | 'confirm' | 'correct' | 'status' | 'safe_limit';
  content: string;
  artifactsJson?: string;
  pendingOptionsJson?: string;
  decision: 'publish' | 'publish_scoped' | 'ask_clarification' | 'publish_limitation';
  checks: {
    responsiveness: true;
    evidence: true;
    capabilityClaims: true;
    continuity: true;
    contradictions: true;
    safety: true;
    internalPayload: true;
  };
  capabilitySnapshotHash: string;
  evidenceSetHash: string;
  canonicalPlanHash: string;
  validatorVersion: string;
  mintedAt: number;
}, 'ValidatedPublicationEnvelope'>;
```

The branded value exists only inside the worker process. The persisted audit contains hashes, decisions, check codes, and repair history, not a client-supplied assertion that checks passed.

### 15.2 Commit boundary

Replace `completeAssistant` with two explicit internal mutations:

```ts
commitValidatedAssistant({
  jobId,
  leaseOwner,
  envelope,
  providerResponseId,
  metadataJson,
})

commitSystemRecoveryNotice({
  jobId,
  leaseOwner,
  recoveryCode,
  retryable,
})
```

`commitValidatedAssistant` rechecks:

- job lease and turn ownership;
- envelope/turn/plan/task linkage;
- current focus revision;
- current authorization;
- recomputed capability/evidence hashes;
- all literal `true` validation fields;
- validator version compatibility;
- single-use envelope ID;
- content hash and internal-payload guard.

If any check fails, it writes no committed user-visible content. It marks the job `repair_pending` or `failed_recoverable` and records the rejection audit.

`commitSystemRecoveryNotice` selects text from a fixed server-owned map. It does not accept arbitrary content.

### 15.3 Lifecycle changes

Extend turn/job status validators:

```text
accepted
understanding_saved
plan_saved
evidence_ready
generating
draft_saved
verification_failed
repair_pending
validated
assistant_saved
clarification_saved
degraded_saved
failed_recoverable
failed_final
```

## 16. Repair and reassessment

Implement `repairPolicy.ts` with a strict maximum effort budget.

### Repair ladder

1. Deterministic removal of duplicated headings/internal debris.
2. Deterministic injection of a missing verified direct answer or scope statement.
3. Re-render from the unchanged canonical plan.
4. One provider regeneration supplied with exact failed codes and prohibited claims.
5. Build a scoped/partial answer from supported propositions.
6. Ask one material clarification.
7. Emit a fixed precise limitation/recovery notice.

The ladder stops immediately when verification passes. It never converts unsupported content into certainty.

### Automatic reassessment triggers

- User explicitly challenges or corrects the answer.
- Draft claims unavailable access while ledger says allowed.
- Draft claims full coverage while ledger says incomplete.
- Retrieval selects no evidence despite readable active documents.
- Draft task/focus differs from the accepted plan.
- Canonical proposition conflicts with a non-superseded prior conclusion without acknowledging change.
- Provider returns a generic answer when a specific answer plan exists.

Correction records link target message, finding, corrected propositions, evidence changes, and affected downstream artifacts. Existing messages remain immutable except for supersession metadata.

## 17. Exact reported sequence

Given an uploaded signed order whose text/chunks are available but full review failed:

```text
U1: Analyze this file.
A1: Which review would help: focused terms, deadlines, custody/possession, or exhaustive review?
U2: which
A2: Explains the choices, still referring to the signed order.
U3: please do so
```

Required internal transitions:

1. U1 creates provisional `document_review` task T1 and active document D1.
2. A1 publishes pending options O1–O4 tied to T1/D1 and the current focus revision.
3. U2 resolves as `clarify` against A1's pending options. Transition is `retain`; D1 remains active.
4. A2 may restate/recommend an option and publishes a single confirmable offer O5.
5. U3 resolves as `confirm`/`continue` for O5. Transition is `refine` T1.
6. The plan selects D1 even though U2/U3 contain no file words.
7. Capability decision is `scoped` if full review is unavailable but chunks/text support O5.
8. Retrieval records D1 and selected chunks/pages.
9. Any “cannot read” claim fails `RESP_FALSE_UNREADABLE_CLAIM`.
10. Only the verified scoped answer or a precise operation-level limitation may commit.

If A2 leaves two live actionable offers, U3 is materially ambiguous and Nexx asks which of the two—without dropping D1 or T1.

## 18. API and worker integration

### `src/app/api/chat/route.ts`

- Continue validating authentication, request shape, attachments, and rate limits.
- Load a compact control snapshot through a Convex query.
- Run only safe preliminary understanding needed for model/tier selection.
- Do not treat `conversation.routeMode` as active focus.
- Pass `clientObservedFocusRevision` only for diagnostics; the server remains authoritative.
- Return accepted turn ID, provisional task ID, and user-safe state (`accepted`, `clarification_pending`, etc.).

### `convex/chatTurns.ts`

- Acceptance transaction creates the user message, turn, provisional understanding/task, and compare-and-swap focus transition.
- Add `loadTurnOrchestrationContext` to return authorized state to the worker.
- Persist final understanding and plan before generation.
- Replace raw completion mutation with validated commit and fixed recovery commit.
- Apply pending options only during validated commit.
- Never update conversation focus merely because `routeMode` changed.

### `convex/chatWorker.ts`

- Execute: understand → transition check → plan → capability → evidence → canonical plan → render → verify → repair → mint envelope → commit.
- Use one correlation ID across every stage.
- Re-load focus/capability immediately before minting.
- On stale revision, re-resolve once; otherwise produce recoverable conflict status.
- Preserve output continuation under the same plan and evidence hashes.

### Existing legal/document modules

- Keep extraction, coverage, understanding, retrieval, legal interpretation, citation, and rendering modules.
- Adapt them to consume the plan/capability contracts.
- `fullDocumentReviewGate.ts` gates only operations requiring exhaustive coverage.
- `agenticOutcome.ts` reports verified outcomes derived from the lifecycle; the provider cannot self-certify completion.
- `responseCompositionTrace.finalPassed` becomes a verifier input/audit detail, not commit authorization by itself.

## 19. Migration and compatibility

### 19.1 Additive deployment

1. Add new tables/status literals and indexes without removing old fields.
2. Deploy read paths that tolerate absent control state.
3. Backfill lazily when a conversation is opened or receives a turn.
4. Enable shadow understanding/planning.
5. Move write authority to control state.
6. Stop reading `conversations.routeMode` as focus.
7. Retain route field for analytics for at least one release cycle.
8. Remove adapters only after metrics show no legacy callers.

### 19.2 Backfill algorithm

For each active conversation:

1. Prefer focused/active `conversationLegalIssueState` and its verified anchors.
2. Otherwise use `conversationDocumentState` and active uploaded file.
3. Otherwise infer a provisional task from the last non-degraded user/assistant pair.
4. Use `conversations.routeMode` only as weak provenance.
5. Set confidence no higher than `0.60` for inferred state.
6. Set provenance `migrated_issue` or `migrated_route`.
7. Do not synthesize pending options from old assistant prose.

Backfill is idempotent and scoped by user/conversation. It emits counts but no message content.

### 19.3 Rollback

Feature flags:

```text
EXEC_CHAT_SHADOW_UNDERSTANDING
EXEC_CHAT_CONTROL_STATE
EXEC_CHAT_CAPABILITY_LEDGER
EXEC_CHAT_PUBLICATION_GATE
EXEC_CHAT_REPAIR_POLICY
EXEC_CHAT_SEMANTIC_ARBITER
```

Flags are independently reversible except schema additions, which remain harmless. Turning off new behavior restores legacy execution but must not delete control/task/audit state.

## 20. Release manifest

Add `releaseManifests` with one active record per runtime/deployment:

```ts
{
  runtime: 'web' | 'convex';
  environment: 'preview' | 'production';
  gitSha: string;
  deploymentId: string;
  schemaVersion: string;
  controlVersion: string;
  capabilityVersion: string;
  validatorVersion: string;
  promptPolicyVersion: string;
  compatibleMinPeerVersion: string;
  deployedAt: number;
}
```

The release workflow writes manifests from trusted deployment metadata. A production smoke check compares web and Convex compatibility. Mismatch blocks promotion or triggers an alert; ordinary users never see internal release data.

## 21. Telemetry and diagnostics

### Stage trace

For each turn record:

- correlation ID, turn ID, task ID, plan ID;
- focus revision before/after;
- speech act, continuity kind, reason codes, resolver version;
- transition kind;
- selected document IDs and generation IDs;
- capability decision and limitation codes;
- retrieval counts and evidence hash;
- question/canonical plan hashes;
- verification failures and repair stages;
- publication decision/rejection code;
- durations and provider usage.

Do not log raw privileged/sealed document text, prompts containing full evidence, credentials, or full user messages in routine telemetry.

### Alerts

- `ambiguous_focus_changed > 0` — page immediately.
- `false_unreadable_draft_committed > 0` — page immediately; should be structurally impossible.
- `publication_without_envelope > 0` — page immediately.
- `cross_scope_reference_attempt > 0` — security alert.
- `active_document_zero_retrieval` rate above 1% for 15 minutes — investigate.
- `repair_exhausted` rate above 2% for 15 minutes — investigate.
- `semantic_arbiter_rate` above 15% — investigate resolver regressions/cost.
- release manifest incompatibility — block promotion/page release owner.

### Internal support view

Show authorized staff a redacted response-decision timeline:

```text
understood as confirmation → retained document-review task → selected Signed Final Order
→ scoped text/chunk access available → 19 chunks retrieved → first draft rejected (false limitation)
→ repaired → verified → committed
```

## 22. Test architecture

### 22.1 Conversation sequence DSL

Add `src/lib/nexx/testing/conversationSequenceDsl.ts` and an in-memory/Convex test adapter.

```ts
scenario('reported signed-order continuation')
  .givenDocument('signed-order', {
    textExtracted: true,
    chunksAvailable: true,
    coverageStatus: 'complete',
    fullDocumentReviewStatus: 'failed',
  })
  .user('Analyze this file', { attach: 'signed-order' })
  .assistantOffers(['focused review', 'exhaustive review'])
  .user('which')
  .expectFocus({ taskKind: 'document_review', documents: ['signed-order'] })
  .assistantOffers(['focused review'])
  .user('please do so')
  .expectRetrieval({ document: 'signed-order', minimumChunks: 1 })
  .expectNoCapabilityClaim('file_unreadable')
  .expectPublicationPassed();
```

The DSL must exercise real pure orchestration functions and a transaction-faithful persistence adapter. A smaller browser suite exercises the actual APIs/UI.

### 22.2 Mandatory deterministic sequences

#### Minimal and odd continuations

1. `Analyze file → which → please do so`.
2. `Review the order → huh? → okay → go on`.
3. `Can you read it? → yes? → then summarize it`.
4. `Explain paragraph 7 → why → continue`.
5. `Give me the deadlines → those? → yes`.
6. `Use the signed one → k → do it`.
7. `Review it → 👆 → that one`.
8. `Analyze custody → possesion [typo] → yes that`.
9. `Compare them → former → correct`.
10. `Draft a response → shorter → send-ready`.

#### Pending question and offer behavior

11. Assistant asks two choices; user says `first`.
12. Assistant asks two choices; user says `which is better?`.
13. Assistant offers one action; user says `please do so` after a social aside.
14. Two live offers remain; user says `do it`; system clarifies.
15. Pending option expires after explicit topic replacement.
16. User quotes an old assistant offer; system distinguishes quote from acceptance.

#### Documents

17. Upload A/B; `the signed one`; reverse to `actually B`.
18. Same filename, different timestamps; clarification retains task.
19. Full review failed; requested page is readable.
20. Full review building; focused search succeeds.
21. OCR partial; native-text pages answer requested question.
22. Semantic search fails; deterministic chunk search succeeds.
23. Page requested is unavailable; other pages must not be presented as that page.
24. Document quarantined after planning; publication is rejected.
25. Document deleted between draft and commit; publication is rejected.
26. Old memory generation exists; active generation is selected.
27. User returns to prior document with explicit `back to the order`.
28. New unrelated upload does not silently replace active signed order.

#### Correction and reassessment

29. `That's wrong; look again.`
30. `No, I meant the second clause.`
31. New evidence changes prior conclusion.
32. Draft says unreadable despite text capability; pre-commit rejection.
33. Draft says exhaustive despite partial coverage; pre-commit rejection.
34. Generic response despite canonical answer; repair.
35. Correction supersedes prior answer and marks dependent draft stale.
36. Challenge rechecks and upholds answer with evidence.

#### Topic and context boundaries

37. Explicit new topic replaces focus without leaking document content.
38. Related drafting request branches from order interpretation.
39. Social aside retains focus.
40. Long gap and compacted summary; pending options are expired safely.
41. Summary contains stale deadline words; current relational request stays relational.
42. Unknown name/acronym is clarified without route corruption.

#### Failure and concurrency

43. Provider timeout before draft.
44. Output truncated; continuation completes under same plan.
45. Structured payload malformed; canonical plan rerender succeeds.
46. Duplicate request ID.
47. Two tabs submit against same focus revision.
48. Edit earlier user turn after later answer.
49. Regenerate superseded branch.
50. Capability changes between plan and commit.
51. Worker lease expires during repair.
52. Retry after recoverable failure creates one result.

#### Security and injection

53. Document text instructs system to ignore user request.
54. Pasted transcript contains “switch to another file.”
55. Referent names a document from another conversation.
56. Forged pending option ID.
57. Client submits a fake focus revision/task ID.
58. Sealed/privileged content remains inside authorized scope.

### 22.3 Property-based tests

Generate sequences and assert:

- politeness/case/punctuation transformations do not change focus resolution;
- uncertain inputs never reduce active evidence;
- capability lattice is monotonic;
- no committed capability claim contradicts its snapshot;
- no committed substantive proposition lacks lineage;
- request replay is idempotent;
- focus revisions are strictly monotonic only on accepted transitions;
- stale plans never commit;
- explicit new topic prevents old evidence injection;
- authorization failure dominates all semantic scores.

Use seeded generation so failures reproduce in CI.

### 22.4 Test lanes

- PR: pure functions, schema validators, deterministic sequences, commit-boundary fault injection.
- Preview release: API + Convex integration, browser sequences, concurrent requests, upload/document states.
- Nightly: property/fuzz sequences, model-backed semantic arbitration evals, repair-quality evals.
- Weekly: cross-browser/mobile, long histories, large document sets, performance.
- Production canary: synthetic non-customer documents and conversations only; no legal advice assertions.

## 23. Performance and cost budgets

- Deterministic understanding/focus/capability computation: p95 under 40 ms server time excluding data fetch.
- Control-state data fetch: one indexed query bundle; no table scans.
- Semantic arbiter: under 15% of turns after calibration; never used for obvious happy paths.
- Added non-model orchestration overhead: p95 under 150 ms.
- Repair regeneration: under 3% of turns after rollout.
- Capability snapshot and hashes: linear in selected documents/evidence, bounded to plan-selected sets.
- Telemetry payload: under 16 KB per normal turn excluding existing retrieval audit.

## 24. Security and privacy requirements

- Server derives all user, conversation, case, task, and document scope.
- Validate every stored ID again when loading and before publication.
- Never trust client-supplied focus, pending option, plan, envelope, or capability data.
- Semantic arbitration receives minimum necessary context.
- Hashes use canonical serialization and a server-defined version.
- Redact document text and credentials from routine logs.
- Publication audits store evidence IDs/hashes, not duplicated privileged passages.
- Correction links cannot target a message outside the same authorized conversation.
- Production canaries use isolated synthetic accounts/data and clean up after completion.

## 25. Implementation file map

### New application modules

```text
src/lib/nexx/orchestration/types.ts
src/lib/nexx/orchestration/turnUnderstanding.ts
src/lib/nexx/orchestration/referentResolver.ts
src/lib/nexx/orchestration/focusTransition.ts
src/lib/nexx/orchestration/executionPlan.ts
src/lib/nexx/orchestration/policy.ts
src/lib/nexx/capabilities/types.ts
src/lib/nexx/capabilities/documentCapabilityLedger.ts
src/lib/nexx/capabilities/operationRegistry.ts
src/lib/nexx/response/claimVerifier.ts
src/lib/nexx/response/publicationContract.ts
src/lib/nexx/response/repairPolicy.ts
src/lib/nexx/testing/conversationSequenceDsl.ts
```

### New Convex modules

```text
convex/conversationControl.ts
convex/chatPublication.ts
convex/chatQualityCanary.ts
convex/releaseManifest.ts
```

### Existing modules to change

```text
src/app/api/chat/route.ts
src/lib/nexx/router.ts
src/lib/nexx/providerInput.ts
src/lib/nexx/responseLifecycle.ts
src/lib/nexx/fullDocumentReviewGate.ts
src/lib/nexx/agenticOutcome.ts
src/lib/nexx/legal-engine/activeIssueContract.ts
src/lib/nexx/legal-engine/continuityResolver.ts
src/lib/nexx/legal-engine/questionContract.ts
src/lib/nexx/legal-engine/canonicalAnswerPlan.ts
src/lib/nexx/legal-engine/answerResponsivenessVerifier.ts
src/lib/nexx/legal-engine/renderedOutputVerifier.ts
convex/schema.ts
convex/chatTurns.ts
convex/chatWorker.ts
convex/crons.ts
src/components/chat/MessageBubble.tsx
.github/workflows/ci.yml
playwright.config.ts
package.json
```

## 26. Delivery plan and dependencies

### PR 1 — Characterization and schemas

- Add failing reproduction sequences for the reported incident.
- Add new additive tables/validators/statuses and TypeScript contracts.
- Add version constants and feature flags.

Exit: baseline failure is deterministic; new schema deploy is additive and legacy behavior remains operational.

### PR 2 — Understanding and control state

- Add provisional task creation, pending-act metadata, referent resolution, focus transitions, and CAS revisions.
- Shadow compare new focus decisions with legacy routing.

Exit: all focus/continuity deterministic tests pass; shadow telemetry has no state effect.

### PR 3 — Capability and evidence plan

- Add capability ledger and operation registry.
- Drive document selection/retrieval from execution plans.
- Narrow full-review gating.

Exit: capability-split tests pass; no false global unreadability in fault injection.

### PR 4 — Canonical plan and publication gate

- Make canonical plan mandatory for substantive responses.
- Add claim verifier, publication audit, envelope minting, and commit mutations.
- Remove raw arbitrary-content completion from worker paths.

Exit: mutation-level tests prove no invalid substantive content can commit.

### PR 5 — Repair, reassessment, and correction lineage

- Add repair ladder, implicit triggers, correction dependency invalidation, and user-safe status copy.

Exit: all reassessment/generation-failure sequences pass within retry budgets.

### PR 6 — E2E, canary, release manifest, and rollout tooling

- Add browser sequences, production-safe canary, dashboards/alerts, release compatibility, and operational runbook.

Exit: preview release suite and canary are green; rollback exercise succeeds.

Dependencies are sequential at contract boundaries, but test/observability work can begin once PR 1 schemas/types stabilize.

## 27. Rollout gates

1. **Local/CI:** all deterministic and invariant tests green.
2. **Shadow:** at least 10,000 eligible turns or seven days; no cross-scope decisions; disagreement categorized.
3. **Internal:** staff/synthetic conversations only; publication gate enforced.
4. **5%:** stable conversation hash; automatic rollback thresholds active.
5. **25%:** 24 hours under error/latency/repair budgets.
6. **50%:** 48 hours; support review of sampled redacted traces.
7. **100%:** release manifests compatible; canary and all critical alerts green.

Automatic pause/rollback conditions:

- any `INV-ISO-001`, `INV-PUB-001`, or `INV-CAP-002` production violation;
- committed-answer error rate increases more than 0.5 percentage points;
- p95 added latency exceeds 300 ms for 15 minutes;
- repair exhaustion exceeds 2%;
- release manifest mismatch;
- production canary sequence failure twice consecutively.

## 28. Acceptance criteria

Implementation is accepted when:

1. All 58 mandatory sequences pass through the appropriate test lane.
2. The reported `Analyze file → which → please do so` sequence retains the correct file/task and produces a supported response.
3. Unknown or ambiguous fragments cannot overwrite active focus.
4. Full-review failure never disables supported page/chunk/scoped analysis.
5. False access and false completeness drafts are rejected before commit.
6. Every committed substantive response has a valid envelope and audit record.
7. No worker path can call a raw arbitrary-content completion mutation.
8. Stale plan/focus/capability changes fail closed without losing recoverability.
9. Correction lineage and dependent-artifact invalidation are verified.
10. Duplicate/concurrent/edit/regenerate flows remain idempotent and isolated.
11. Release compatibility is checked during promotion and continuously in production.
12. Performance, cost, privacy, and alert budgets are met through full rollout.

## 29. Definition of done

The feature is not done when a prompt usually answers correctly. It is done when the system architecture makes the following outcomes durable:

- it remembers the goal without confusing it with a route;
- it understands how the current utterance functions in the conversation;
- it preserves context when uncertain;
- it uses the strongest truthful capability available;
- it grounds substantive claims in authorized evidence;
- it detects and repairs its own contradictions;
- it cannot publish an unverified response;
- and it remains diagnosable, reversible, and release-compatible in production.
