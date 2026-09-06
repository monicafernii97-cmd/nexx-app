# Executive Chat Semantic Acceptance and Recommendation Execution Specification

**Status:** Implementation-ready; not yet implemented  
**Priority:** P0 conversational continuity and response integrity  
**Baseline:** `origin/main@1ba53e47e369e50245b9b93237dc92ef7d1b5ea5`  
**Observed incident:** owner-only production live run, 2026-09-05  
**Extends:** `15_executive_chat_hardening_full_spec.md` and `16_executive_chat_production_incident_remediation_spec.md`  
**Change ticket:** `EXEC-CHAT-ROLLOUT-2026-09-04`  
**Production scope:** the allowlisted owner account only until every exit gate in this specification passes

## 1. Decision and intended outcome

NEXXproof must understand acceptance by conversational meaning, not by requiring users to repeat an exact phrase or an exact option label. Phrases such as `please do so`, `do that`, `go with that`, `yes, your recommendation`, and informal equivalents are examples of an intent class. They are not a phrase whitelist.

When the assistant presents choices and explicitly recommends one, a subsequent acceptance must resolve to that recommendation when the reference is current, authorized, and unambiguous. The resolved option must carry its complete executable meaning into the next turn: task, operation, scope, document IDs, evidence generation IDs, and analysis mode. The system must never rely on the language model to reconstruct those fields from conversational prose.

For the reported sequence:

```text
Analyze the signed court order and offer review-depth choices
→ Which?
→ Full-document review is the most complete option
→ Please do so
```

the final turn must produce this effective plan:

```text
intent: accept_recommendation
selected_option: full_document_review
task: current signed-order review
analysis_mode: full_document_review
documents: canonical active signed order
evidence: current verified document generation and durable review record
action: execute the review
```

It must not ask the user to reupload a readable stored document, merely restate that it can perform the review, re-present the same choices, or silently switch tasks.

This specification authorizes implementation and owner-only verification. It does not authorize cohort expansion or deletion of historical messages or genuine uploads.

## 2. Production evidence and defect statement

The 2026-09-05 live run used conversation `j572nf69ndnj8nk5hyvpcdeqwx8ay8bg` and canonical uploaded file `m172nr6ypxjjytgdzmykzertxn8dkz2k`.

The observed sequence was:

1. `Analyze the signed court order file. If more than one review depth is possible, offer the choices.`
   - Passed.
   - The plan selected the canonical order.
   - The deterministic response offered focused and full-document review.
2. `which`
   - Conversationally passed.
   - The assistant explained both choices and explicitly recommended full-document review.
   - The turn itself required no document retrieval.
3. `please do so`
   - Failed.
   - The assistant claimed the signed-order text was unavailable and requested reupload.

The failed third turn had:

- `speechAct=answer` instead of a resolved selection or confirmation;
- no resolved option referent;
- `documentActivation.active=false`;
- `selectedDocumentIds=[]`;
- no evidence requirements or retrieval queries;
- `sourceDocumentCount=0`;
- `sourcePacketCount=0`;
- `sourceCharacterCount=0`;
- a normally completed provider response, not an interrupted stream or fallback; and
- a published v1 envelope even though the v2 shadow verifier reported `RESP_LATENT_DOCUMENT_CONTEXT_SURFACED` and `RESP_UNREQUESTED_DOCUMENT_USE`.

The active rollout configuration had `foreground_intent_v2=enforce`, `document_activation_v2=enforce`, `publication_v2=shadow`, and `self_correction_v1=off`. The stronger validator detected the contradiction but was not allowed to block or repair it.

### 2.1 Root causes

The failure was produced by five interacting defects:

1. **Options are descriptive rather than executable.** `PendingOption` stores a label, aliases, a broad action name, a task ID, and document IDs. It does not store an operation payload such as `analysisMode=full_document_review`.
2. **Recommendations are not first-class state.** The assistant can recommend an option in prose without persisting `recommendedOptionId` or a recommendation receipt.
3. **A clarification response can erase document binding.** Pending interactions are derived from the current execution plan. Because the `which` turn intentionally had no document activation, its newly parsed choices were persisted with empty document IDs and replaced the earlier document-bound choices.
4. **Generic acceptance of a recommendation is misclassified.** When two pending options exist, `please do so` matches neither option label. The turn is downgraded from unresolved selection to ordinary `answer` instead of resolving the explicit recommendation.
5. **Shadow publication detects but permits the error.** The v2 verifier identifies improper document language, but v1 remains authoritative in Stage 1.

### 2.2 QA false positives

The release tests did not reproduce the persisted production state transition:

- the sequence DSL injects artificial assistant offers already bound to the active document;
- it does not parse the real two-choice response, recommendation, and follow-up;
- the production browser assertion only rejects narrow word orders such as `cannot read the file`;
- the actual phrase `I do not have the signed order text available to read` bypasses that expression; and
- the browser test does not assert selected document IDs, analysis mode, retrieval receipts, evidence count, or durable-review execution.

## 3. Scope

### In scope

- typed, executable pending options and assistant offers;
- first-class recommendation state;
- semantic classification of acceptance, rejection, modification, deferral, and option questions;
- grounded option resolution with deterministic authorization checks;
- task/document/evidence carry-forward through non-document clarification turns;
- analysis-mode propagation and durable full-review routing;
- publication checks for document-availability contradictions;
- bounded self-repair for failed conversational resolution;
- migration and cleanup of legacy pending-interaction state;
- production-shaped unit, integration, browser, and canary tests;
- owner-only rollout, telemetry, and promotion gates.

### Out of scope

- allowing the model to invent an action not present in authorized pending state;
- treating every affirmative utterance as approval;
- executing stale recommendations after a topic switch or material state change;
- retrieving historical documents on greetings, unknown terms, or promised future uploads;
- deleting historical messages or genuine uploaded files;
- broad rollout in the same change that introduces the new resolver;
- using an embedding or a model score as the sole authorization decision.

## 4. Normative invariants

| Code | Requirement |
|---|---|
| `INV-SEM-001` | Natural-language acceptance resolves only to an existing, current, authorized option or offer. |
| `INV-SEM-002` | A rendered assistant sentence is never the sole source of executable action state. |
| `INV-SEM-003` | If one current option is explicitly recommended, generic acceptance may resolve to that option. |
| `INV-SEM-004` | If multiple options remain plausible and none is uniquely recommended, generic acceptance must ask one narrow clarification. |
| `INV-SEM-005` | Negation, correction, limitation, and explicit selection override generic acceptance. |
| `INV-SEM-006` | An option cannot execute after its task, focus revision, document authorization, capability snapshot, or expiry becomes stale. |
| `INV-STATE-001` | A clarification or explanation turn may not erase valid document and evidence bindings from pending actions. |
| `INV-STATE-002` | A pending option contains the complete payload required to construct the next execution plan without reparsing assistant prose. |
| `INV-DOC-004` | A resolved document action activates only the documents bound to that option after a fresh authorization check. |
| `INV-DOC-005` | Social, unknown, unrelated, and future-upload turns retain document focus silently but do not retrieve it. |
| `INV-REV-003` | Resolving a full-document option sets `analysisMode=full_document_review` and uses a compatible verified durable-review record when available. |
| `INV-PUB-005` | A response may not claim a selected authorized document is unavailable when the capability snapshot reports readable evidence. |
| `INV-PUB-006` | A response may not promise execution when its plan selected no executable operation. |
| `INV-QA-001` | A sequence test passes only when semantic state, execution state, evidence, and visible response all pass. |
| `INV-ROLL-001` | Shadow violations in an owner canary prevent promotion even when the visible response was committed by a legacy gate. |

Violations of `INV-SEM-001`, `INV-STATE-002`, `INV-DOC-004`, `INV-PUB-005`, or `INV-REV-003` are release hard stops.

## 5. Conversational intent model

### 5.1 New intent classes

Add a semantic interaction intent separate from the broad `SpeechAct` enum:

```ts
type InteractionIntent =
  | 'accept_recommendation'
  | 'accept_offer'
  | 'select_option'
  | 'reject_recommendation'
  | 'reject_option'
  | 'modify_option'
  | 'ask_about_options'
  | 'defer_action'
  | 'cancel_action'
  | 'unrelated_turn'
  | 'uncertain';
```

`SpeechAct` remains useful for broad routing. `InteractionIntent` answers the narrower question: what does the newest user message do to the active pending interaction?

### 5.2 Required behavior by intent

| Intent | Example | Required result |
|---|---|---|
| `accept_recommendation` | `go with what you recommend` | Resolve the unique current recommended option. |
| `accept_offer` | `yes, please do that` after one offer | Execute the one current offer. |
| `select_option` | `the full review` or `second one` | Resolve the explicitly named/ordered option. |
| `reject_recommendation` | `not that one` | Mark recommendation rejected and clarify or select the remaining unique option. |
| `reject_option` | `not the focused review` | Remove that option from current candidates. |
| `modify_option` | `do the full review, but focus on possession` | Resolve the base option and apply a validated scope modifier. |
| `ask_about_options` | `which is better?` | Explain/recommend; do not execute. |
| `defer_action` | `I'll decide later` | Preserve task, clear or suspend pending execution according to expiry policy. |
| `cancel_action` | `never mind` | Cancel pending action without deleting document memory. |
| `unrelated_turn` | `what is mediation?` | Route the new foreground request; do not execute the old option. |
| `uncertain` | `that` with multiple plausible antecedents | Ask one concise clarification. |

### 5.3 Phrases are evidence, not policy

Lexical patterns provide high-precision evidence for common expressions, including:

- acceptance: `yes`, `please do so`, `do that`, `go ahead`, `go with that`, `use your recommendation`, `that sounds best`, `okay then`, `proceed`;
- selection: option labels, ordinals, `the complete one`, `the shorter one`, `the one you recommend`;
- rejection: `no`, `not that`, `the other one`, `don't do that`;
- modification: `but`, `only`, `except`, `instead`, `focus on`, `start with`;
- deferral: `later`, `hold off`, `not yet`, `I'll upload first`;
- option questions: `which`, `which is best`, `what's the difference`, `why that one`.

The resolver must normalize punctuation, casing, Unicode apostrophes, filler words, and ordinary misspellings. No lexical match may bypass the state and authorization checks below.

### 5.4 Hybrid classification

Classification must use three bounded layers:

1. **Deterministic high-precision rules** for explicit option labels, ordinals, exact offers, negation, correction, cancellation, future-upload intent, and social turns.
2. **Structured semantic classifier** for paraphrases that cannot be resolved by deterministic rules. It receives only the newest message plus redacted current pending-option metadata. It must return a schema-validated intent, candidate option IDs, modifiers, confidence, and reason codes. It cannot emit new option IDs or executable payloads.
3. **Deterministic semantic arbiter** that applies recency, uniqueness, confidence, task, focus, authorization, and negation rules. Only this arbiter can finalize resolution.

If the semantic classifier times out, returns invalid JSON, or names an unknown option, the arbiter must fall back to deterministic resolution or clarification. It must not guess.

### 5.5 Confidence policy

Recommended thresholds:

```text
explicit label or ordinal, unique authorized option: execute
generic acceptance + unique current recommendation: execute
generic acceptance + one current offer: execute
generic acceptance + multiple options + no recommendation: clarify
semantic classifier confidence >= 0.86 with >= 0.20 candidate margin: execute after arbiter checks
confidence 0.60–0.85 or margin below 0.20: clarify
confidence < 0.60: treat as uncertain or unrelated based on foreground intent
```

These values are configuration, not model-controlled output. Production tuning requires adjudicated owner-canary evidence.

## 6. Executable pending-interaction contract

### 6.1 Pending option v2

Replace prose-only pending choices with a versioned contract:

```ts
type PendingOptionV2 = {
  schemaVersion: 2;
  optionId: string;
  interactionId: string;
  label: string;
  semanticAliases: string[];
  action: 'select_document' | 'select_scope' | 'confirm_action' | 'supply_fact';
  operation: PendingOperation;
  targetTaskId: string;
  sourceTurnId: Id<'chatTurns'>;
  sourceMessageId: Id<'messages'>;
  sourcePlanId: string;
  focusRevision: number;
  documentIds: Id<'uploadedFiles'>[];
  evidenceGenerationIds: Id<'documentMemoryGenerations'>[];
  capabilitySnapshotHash: string;
  authorizationScopeHash: string;
  recommended: boolean;
  recommendationRank?: number;
  expiresAt: number;
  consumedAt?: number;
  cancelledAt?: number;
};

type PendingOperation =
  | {
      kind: 'document_review';
      analysisMode:
        | 'full_document_review'
        | 'obligations_and_deadlines'
        | 'custody_and_possession'
        | 'compare_with_conversation'
        | 'focused_question';
      focusedIssue?: string;
    }
  | { kind: 'draft'; draftMode: string }
  | { kind: 'procedure'; procedureMode: string }
  | { kind: 'answer'; requestedOperation: string }
  | { kind: 'supply_fact'; fieldKey: string };
```

The persisted representation may remain JSON during additive rollout, but it must be schema-validated at write and read boundaries. A later schema migration may normalize it into a table.

### 6.2 Recommendation receipt

Persist recommendations separately from rendering:

```ts
type RecommendationReceipt = {
  schemaVersion: 1;
  recommendationId: string;
  interactionId: string;
  recommendedOptionId: string;
  alternativeOptionIds: string[];
  targetTaskId: string;
  sourceTurnId: Id<'chatTurns'>;
  sourceMessageId: Id<'messages'>;
  focusRevision: number;
  basisCodes: string[];
  capabilitySnapshotHash: string;
  authorizationScopeHash: string;
  createdAt: number;
  expiresAt: number;
};
```

`basisCodes` may explain why an option was recommended, but they may not contain privileged document text. The recommendation ID and selected option must be included in publication metadata and the control-state update.

### 6.3 Structured creation, not prose reparsing

Deterministic interactions such as review-depth choices must construct `PendingOptionV2[]` directly before rendering. The renderer receives those options and produces natural language. It does not parse its own rendered output.

For model-generated choices, the structured assistant response schema must include a `pendingInteraction` field. The canonical answer planner validates that field against the current task and authorized documents. Free-text parsing may remain temporarily as a shadow diagnostic, but it cannot create an executable production action.

### 6.4 Review-depth options

The review-depth interaction must create exactly these semantic operations:

```text
focused review
  operation.kind=document_review
  operation.analysisMode=focused_question
  documentIds=[canonical active order]
  evidenceGenerationIds=[current verified generation]

full-document review
  operation.kind=document_review
  operation.analysisMode=full_document_review
  documentIds=[canonical active order]
  evidenceGenerationIds=[current verified generation]
```

If the assistant recommends the full review, its recommendation receipt must name the full-review option ID. A later explanatory `which` response may update recommendation rationale or presentation but must not regenerate the options with empty bindings.

## 7. Resolution algorithm

### 7.1 Inputs

The resolver receives:

- newest user message;
- current conversation control state;
- current interaction and unconsumed options;
- current recommendation receipt;
- active task and task lineage;
- current focus revision;
- authorized active document descriptors;
- document eligibility and capability summaries;
- current attachments;
- the immediately preceding assistant interaction receipt; and
- foreground-intent and future-upload detection.

It must not search arbitrary old assistant prose for an action when no current receipt exists.

### 7.2 Precedence

Apply these rules in order:

1. Current attachments and explicit new document references.
2. Explicit cancellation or future-upload intent.
3. Explicit correction, rejection, or scope limitation.
4. Explicit option label, ordinal, or semantic alias.
5. Explicit acceptance of `your recommendation` or equivalent.
6. Generic acceptance when there is one unique current recommendation.
7. Generic acceptance when there is one current offer.
8. Question about options or recommendation.
9. Semantic classifier plus deterministic arbitration.
10. Narrow clarification or unrelated foreground routing.

Negation scopes must be evaluated before affirmative tokens. `Yes, but not the full review` is not acceptance of the full-review recommendation.

### 7.3 Recommendation acceptance

`accept_recommendation` succeeds only when:

- the recommendation receipt exists and has not expired;
- the recommended option exists and is unconsumed;
- the option belongs to the current interaction and task;
- its focus revision is compatible with current focus;
- all bound documents remain authorized and eligible;
- its evidence generations remain compatible or can be refreshed deterministically;
- its operation is supported by the current capability snapshot; and
- no explicit modifier or negation conflicts with the option.

On success, return:

```ts
type InteractionResolution = {
  decision: 'execute';
  intent: 'accept_recommendation';
  interactionId: string;
  optionId: string;
  recommendationId: string;
  taskId: string;
  operation: PendingOperation;
  documentIds: string[];
  evidenceGenerationIds: string[];
  confidence: number;
  reasonCodes: string[];
};
```

### 7.4 Ambiguity behavior

The system asks a single, specific question when:

- multiple options exist and none is recommended;
- two recommendations are still live due to invalid state;
- the user says `that one` after an intervening unrelated assistant turn;
- the requested modifier conflicts with the selected operation;
- authorization or capability changed after recommendation; or
- a low-confidence semantic result cannot be separated from another candidate.

Good clarification:

```text
Do you want the focused review or the full-document review?
```

Bad clarification:

```text
Could you clarify what you mean?
```

### 7.5 Compound messages

The resolver must support acceptance plus constraints:

- `Do the full review, but start with possession.`
- `Go with your recommendation and make it plain English.`
- `Yes, but don't discuss child support.`
- `Do that after I upload the newer order.`

The result contains a base option plus validated modifiers. A future-upload modifier suppresses historical retrieval and changes the task to `await_upload`; it never executes immediately.

### 7.6 Consumption and idempotency

An option is consumed atomically with successful plan creation. Retrying the same client request returns the same resolution and plan. A consumed option cannot execute twice. Failed provider generation does not create a second task or consume a different option; recovery resumes from the persisted plan.

## 8. Focus, document, and evidence propagation

### 8.1 Preserve bindings across explanation turns

A turn such as `which`, `why that one`, or `what is the difference?` may answer from interaction metadata without retrieving the document. That is correct. It must nevertheless preserve the original options' document and evidence bindings.

Control-state updates must merge by `interactionId`:

- presentation text may change;
- recommendation may be added or changed;
- authorized bindings remain from the source options;
- empty fields from a non-document explanatory plan may not overwrite populated bindings;
- any attempted cross-task or unauthorized merge fails closed.

### 8.2 Activation from resolved actions

Extend document activation with an authoritative `resolved_pending_action` source. It is active only after `InteractionResolution.decision=execute` and authorization succeeds.

```text
source=resolved_pending_action
referenceStrength=carried
reasonCodes=[semantic_acceptance_resolved, pending_option_authorized]
```

The plan selects the option-bound document IDs, not all historical active documents. Greetings, unknown terms, and unrelated turns continue to select none.

### 8.3 Evidence generations

New document tasks and branches must inherit compatible `activeEvidenceGenerationIds`. A task with document IDs but empty evidence generations must refresh the generation binding before execution or fail with an internal retryable state—not tell the user to reupload.

Every inherited generation must be checked for:

- document ID;
- owner and case scope;
- current generation status;
- extraction and coverage version;
- quarantine/eligibility status; and
- compatibility with the requested analysis mode.

### 8.4 Full-document review routing

When the resolved operation is `full_document_review`:

1. load the canonical active order;
2. locate the compatible ready durable-review record;
3. verify the record against the current document generation, coverage manifest, page count, and source chunks;
4. resolve its citation evidence;
5. publish the verified review; and
6. record document-answer evidence.

For the owner canary, readiness requires the repaired 46/46-page, 33/33-chunk review record. The ordinary provider-generation path must not run with zero evidence when this verified record is ready.

## 9. Publication and self-correction

### 9.1 New publication checks

Add these v2 rejection codes:

| Code | Trigger |
|---|---|
| `RESP_ACCEPTED_ACTION_NOT_EXECUTED` | User accepted a resolved action but response only promises or re-offers it. |
| `RESP_RECOMMENDATION_REFERENCE_DROPPED` | A current recommendation was accepted but the candidate ignored its option. |
| `RESP_SELECTED_DOCUMENT_FALSE_UNAVAILABLE` | Candidate claims selected readable evidence is unavailable. |
| `RESP_EXECUTION_WITHOUT_OPERATION` | Candidate claims it performed work but the plan has no executable operation. |
| `RESP_EXECUTION_WITHOUT_EVIDENCE` | Evidence-requiring operation is presented as complete with no evidence. |
| `RESP_REUPLOAD_UNNECESSARY` | Candidate asks for reupload despite a readable, authorized selected document and no explicit fresh-upload requirement. |
| `RESP_REPEATED_CHOICE_AFTER_RESOLUTION` | Candidate re-asks the same choice after it was unambiguously resolved. |

The verifier must use plan and capability facts, not a narrow list of forbidden sentences. Language patterns may detect claim families, but variants such as `I don't currently have the text in front of me`, `the file isn't available here`, and `upload it again so I can read it` must map to the same availability proposition.

### 9.2 Bounded self-correction

If publication rejects a candidate for any code above:

1. inspect the persisted interaction resolution and plan;
2. recompute capability and evidence hashes;
3. repair missing propagation deterministically when possible;
4. regenerate once using the corrected plan;
5. revalidate under publication v2; and
6. publish a contextual limitation only if the corrected operation truly cannot execute.

Self-correction cannot change the selected option, task, or document without a new resolution receipt. It cannot convert an authorization failure into a successful claim.

### 9.3 Recovery language

When automatic repair is actually scheduled, a contextual status may say:

```text
I kept your full-document review selected. The document evidence did not attach correctly to that turn, so I’m reconnecting it to the stored order and retrying.
```

It may not say `I’m retrying` unless a durable retry receipt exists. If the system has a readable stored order, it may not request reupload merely because orchestration lost its binding.

## 10. Data and API changes

### 10.1 Additive schema changes

Add or version these fields:

`conversationControlStates`:

- `pendingInteractionVersion`;
- `pendingInteractionJson`;
- `activeRecommendationJson`;
- `lastInteractionResolutionId`;
- `activeEvidenceGenerationIds` remains authoritative and is revalidated.

`turnUnderstandings`:

- `interactionIntent`;
- `interactionCandidateOptionIds`;
- `interactionClassifierVersion`;
- `interactionConfidence`;
- `interactionReasonCodes`.

`turnExecutionPlans`:

- `interactionResolutionId`;
- `selectedOptionId`;
- `requestedOperation`;
- `analysisMode`;
- `selectedEvidenceGenerationIds`;
- `interactionContractHash`.

Add `interactionResolutionAudits`:

```ts
{
  resolutionId: string;
  conversationId: Id<'conversations'>;
  userId: Id<'users'>;
  turnId: Id<'chatTurns'>;
  interactionId?: string;
  recommendationId?: string;
  candidateOptionIds: string[];
  selectedOptionId?: string;
  intent: InteractionIntent;
  decision: 'execute' | 'clarify' | 'cancel' | 'defer' | 'unrelated' | 'rejected';
  confidence: number;
  reasonCodes: string[];
  classifierVersion: string;
  arbiterVersion: string;
  taskId?: string;
  documentIds: Id<'uploadedFiles'>[];
  evidenceGenerationIds: Id<'documentMemoryGenerations'>[];
  operationJson?: string;
  authorizationScopeHash: string;
  createdAt: number;
}
```

Indexes:

- `by_turn`;
- `by_conversation_created`;
- `by_interaction`;
- `by_decision_created`.

### 10.2 Internal operations

Add:

- `createPendingInteractionV2`;
- `persistRecommendationReceipt`;
- `classifyInteractionIntent`;
- `resolvePendingInteraction`;
- `authorizePendingOperation`;
- `consumePendingOptionAndCreatePlan`;
- `refreshTaskEvidenceBindings`;
- `inspectInteractionResolution`;
- `auditLegacyPendingInteractions`;
- `clearUnsafePendingInteraction`;
- `reportSemanticContinuityHealth`.

Every mutating operation must be idempotent, owner-scoped, and linked to the current turn/request ID.

## 11. Legacy-state migration and owner-conversation repair

### 11.1 Legacy pending options

Version-1 options lacking an operation payload are non-executable after v2 enforcement. They may be:

- upgraded only when operation, task, document, and evidence bindings are deterministically recoverable;
- retained as display-only historical metadata; or
- cleared when ambiguous or unsafe.

They must never be upgraded from label text alone.

### 11.2 Current failed owner turn

Before the new live rerun:

1. snapshot the current control state;
2. clear the stale confirmation/offer created by the failed `please do so` response;
3. preserve the canonical active signed order;
4. preserve the active task lineage and repaired durable-review record;
5. repair missing compatible evidence-generation bindings;
6. record the repair reason as `semantic_acceptance_canary_reset`; and
7. verify no synthetic or quarantined IDs were introduced.

Historical user and assistant messages remain unchanged.

## 12. Required test architecture

### 12.1 Unit tests

Test intent classification and arbitration independently for:

- common acceptances and paraphrases;
- casing, punctuation, filler, slang, and misspellings;
- negation before and after affirmative tokens;
- explicit option labels and ordinals;
- one recommendation, no recommendation, and conflicting recommendations;
- stale and consumed options;
- topic switches and greetings;
- future-upload intent;
- compound acceptance plus modifiers;
- classifier invalid output, timeout, and low confidence;
- unauthorized or quarantined option documents.

### 12.2 Persisted sequence integration tests

Tests must execute the real write/read pipeline:

1. create document-bound pending options;
2. publish and persist the actual assistant choice response;
3. send `which`;
4. persist the actual recommendation receipt;
5. send a natural-language acceptance;
6. resolve and consume the option;
7. build the plan;
8. retrieve evidence or load the durable review;
9. publish; and
10. inspect stored receipts.

No test helper may silently repopulate missing document IDs or bypass the production parser/contract.

### 12.3 Mandatory conversational matrix

At minimum, cover:

```text
Analyze → which → please do so
Analyze → which is better → go with that
Analyze → recommend one → okay, your recommendation
Analyze → choices → do the complete one
Analyze → choices → second
Analyze → choices without recommendation → go ahead
Analyze → recommendation → not that one
Analyze → recommendation → the other one
Analyze → recommendation → do that, but focus on possession
Analyze → recommendation → hold off, I will upload a newer order
Analyze → recommendation → hey
Analyze → recommendation → ZQX?
Analyze → recommendation → switch topics: explain mediation
Analyze → recommendation → do it → duplicated client retry
Analyze → recommendation → document quarantined before acceptance
Analyze → recommendation → capability changes before acceptance
Analyze → recommendation → intervening assistant correction → do that
Analyze → recommendation → two live recommendations caused by corrupt state
```

Each test asserts intent, selected option, task, analysis mode, documents, evidence generations, retrieval behavior, publication decision, visible response, and absence of unintended work.

### 12.4 Production browser assertions

Replace wording-only assertions with receipt-backed checks. The test harness must verify:

- the review-depth response persisted two operation-bearing options;
- the recommendation receipt identifies full-document review;
- `please do so` resolves to that exact option;
- the final plan has `analysisMode=full_document_review`;
- the canonical document is selected;
- a compatible evidence generation is selected;
- the durable-review record is used;
- source/evidence counts are nonzero;
- publication v2 passes with no shadow rejection codes;
- the visible response contains actual review content; and
- no reupload request or false availability limitation is published.

The visible-language check must use proposition classification plus representative patterns, not one narrow regex.

### 12.5 Failure injection

Inject:

- semantic classifier timeout;
- invalid classifier option ID;
- stale recommendation;
- concurrent topic switch;
- lost evidence-generation binding;
- document authorization revocation;
- durable-review record mismatch;
- provider interruption after resolution;
- publication rejection followed by successful repair;
- publication repair exhaustion.

The result must remain idempotent and truthful in every case.

## 13. Observability

### 13.1 Metrics

Add:

- `interaction_intent_total{intent}`;
- `interaction_resolution_total{decision}`;
- `recommendation_acceptance_total`;
- `recommendation_acceptance_clarification_total`;
- `pending_option_stale_total{reason}`;
- `pending_binding_drop_total{field}`;
- `accepted_action_not_executed_total`;
- `false_document_unavailable_rejection_total`;
- `full_review_resolution_total{outcome}`;
- `semantic_repair_total{outcome}`;
- `interaction_classifier_fallback_total{reason}`.

### 13.2 Trace requirements

One correlation timeline must show:

```text
user message
→ interaction intent
→ candidate options
→ recommendation resolution
→ authorization result
→ focus transition
→ document activation
→ operation and analysis mode
→ evidence selection
→ generation/durable result
→ publication checks
→ committed response
```

Support diagnostics must expose IDs, versions, counts, reason codes, and hashes without exposing private document text.

### 13.3 Hard stops

Pause the owner rollout immediately for:

- any accepted recommendation executing the wrong option;
- any cross-user or cross-case document selection;
- any false document-unavailable response that reaches publication;
- any full-review completion with zero evidence;
- any option executing twice;
- any publication without an envelope; or
- any semantic action created solely from assistant prose without a validated interaction contract.

Soft stops requiring adjudication before promotion:

- clarification rate above 15% for high-confidence acceptance fixtures;
- semantic-classifier fallback above 5%;
- accepted-action-not-executed rate above 0.5%;
- publication repair above 1%;
- owner-canary shadow rejection above 0%;
- unexplained fallback above 1%.

## 14. Delivery sequence

### PR 1 — contracts, recommendation state, and characterization

- Add v2 types, validators, additive schema fields, and resolution audit table.
- Add exact characterization for the failed production trace.
- Construct review-depth options as structured operations.
- Add recommendation receipts.

Exit: the old behavior is reproduced by a failing characterization test, and the new contracts validate without changing production behavior.

### PR 2 — semantic resolver and safe state transitions

- Add interaction-intent classification and deterministic arbitration.
- Implement recommendation acceptance, rejection, modification, and ambiguity handling.
- Preserve option bindings across `which`/explanation turns.
- Add atomic option consumption and idempotency.

Exit: all unit and persisted sequence tests pass, including paraphrases not explicitly listed in fixtures.

### PR 3 — execution, evidence, durable review, and publication

- Propagate resolved operations into execution plans.
- Add pending-action document activation.
- Refresh evidence-generation bindings.
- Route full review to the verified durable-review record.
- Add publication rejection codes and bounded repair.

Exit: the exact sequence produces a cited full review with nonzero evidence and no reupload request.

### PR 4 — migration, browser QA, observability, and runbooks

- Add legacy-state audit/repair operations.
- Repair the owner conversation after explicit preview/approval if a mutation is needed.
- Replace weak browser assertions with receipt-backed assertions.
- Add dashboards, alerts, and operator runbooks.

Exit: local, preview, synthetic production, and owner-live gates pass with no unresolved critical or major review comments.

Each PR must be ready for review, use the repository default branch as its base, allow automatic CodeRabbit review to run, and stop the review loop once no unresolved critical or major actionable issues remain.

## 15. Production rollout

1. Merge additive schema and read-compatible contracts.
2. Deploy with all new behavior off.
3. Run schema compatibility and legacy-state audit in production.
4. Enable interaction-contract writes in shadow for synthetic accounts.
5. Compare prose-derived diagnostics with structured interaction receipts; structured receipts remain authoritative.
6. Enable semantic resolution for synthetic accounts and run the full adversarial matrix.
7. Enable owner-only shadow resolution for `monicafernii97@gmail.com` without executing new actions.
8. Review resolution receipts and repair the stale owner pending interaction using a preserved snapshot.
9. Enable owner-only semantic execution while publication v2 remains shadow; run the exact live sequence once.
10. Require zero shadow rejection codes and verify the full-review evidence receipt.
11. Enable publication v2 enforcement for the owner only.
12. Enable bounded self-correction for the owner only.
13. Rerun the entire live matrix, including greeting, future upload, unknown term, topic switch, negation, and compound acceptance.
14. Observe at least 24 uninterrupted hours with no hard stops and all soft metrics accepted.
15. Expand one feature family or cohort step at a time under a separately approved rollout change.

Publication v2 must not be promoted merely to hide the resolver defect. The resolver and execution chain must first produce a valid candidate; enforcement then prevents regressions.

## 16. Acceptance criteria

Implementation is accepted only when all of the following are true:

1. `please do so` and semantically equivalent acceptance phrases resolve by intent, not an exact phrase whitelist.
2. A unique explicit recommendation is stored as a recommendation receipt.
3. Generic acceptance of that recommendation resolves to its exact authorized option.
4. Multiple options without a recommendation produce a specific clarification.
5. Negation, correction, explicit selection, deferral, and topic switches override generic acceptance correctly.
6. Clarification turns cannot erase task, document, evidence, or operation bindings.
7. A resolved full-review option creates a full-document execution plan.
8. The canonical signed order and compatible evidence generation are selected.
9. The repaired 46-page durable review is used and its evidence is recorded.
10. The assistant does not request reupload of the readable stored order.
11. Publication v2 rejects false availability and accepted-action-not-executed responses.
12. Bounded self-correction repairs recoverable propagation defects without changing user intent.
13. Persisted integration tests and browser tests inspect backend receipts as well as visible wording.
14. The exact owner sequence and all adversarial variants pass.
15. No synthetic or quarantined ID re-enters active state.
16. No option executes twice under retries or duplicate client requests.
17. Owner-only health reports zero hard stops, zero shadow publication blocks, and accepted soft metrics for 24 hours.

## 17. Definition of done

Done means the complete semantic chain is operational in production for the approved owner account:

```text
natural user language
→ context-aware interaction intent
→ grounded authorized recommendation/option
→ preserved task and document state
→ executable operation and review mode
→ verified evidence
→ truthful publication
→ inspectable receipt
```

A collection of additional regular expressions is not completion. A model that conversationally guesses the right action without a grounded receipt is not completion. A visible response that sounds appropriate while selecting no document or evidence is not completion. The implementation is complete only when natural language flexibility and deterministic execution integrity are both demonstrated by the production-shaped test suite and the owner live run.
