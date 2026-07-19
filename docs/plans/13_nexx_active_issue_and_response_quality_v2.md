# NEXX Active-Issue Continuity and Response Quality V2

**Status:** Proposed — implementation-ready
**Priority:** P0 legal responsiveness and user trust; P1 general NEXX conversation maturity
**Plan date:** July 19, 2026
**Primary incident:** A same-issue Father’s Day follow-up — “what if he fights back…” — lost the verified Father’s Day context and rendered two generic deterministic fallback sentences.
**Relationship to prior work:** This specification closes the generalization and enforcement gaps left by plans 11 and 12. It does not roll those protections back.

## 1. Executive decision

NEXX will no longer decide legal conversational continuity from the latest message’s regex classification alone. A verified, structured active-issue contract will carry the current legal problem, operative document anchors, clause roles, material schedule terms, and supported outcome across turns.

Every substantive legal turn will also produce a deterministic question contract describing what the user is actually asking. That question contract—not string length, generic prose completeness, or source presence—will determine whether the response answered directly.

The final user-facing response will be rendered from one verified canonical answer plan. `documentAnswer.answer`, model prose, and generic fallbacks will not independently compete to become the opening answer.

The production invariant is:

> No response is publishable merely because it is grammatical, cited, short, or non-repetitive. It must resolve the user’s current question with a source-supported proposition, explain the result in beginner-friendly language, and give the practical next step appropriate to that turn.

## 2. Required NEXX experience

For the incident follow-up, NEXX should respond substantially as follows:

> No. Him pushing back does not change how these provisions work together. My read remains that Father’s Day possession starts Friday at 6:00 p.m., not Thursday.
>
> The Thursday rule is the general rule for a qualifying weekend when Friday is a federal, state, or local holiday during the summer. But that paragraph begins with “Except as otherwise expressly provided.” In plain English, that means the Thursday extension applies only when another part of the order does not give that possession period its own schedule.
>
> The Father’s Day paragraph does give its own schedule: Friday at 6:00 p.m. through Monday at 8:00 a.m. The provisions therefore do not contradict each other. The Thursday rule remains valid for regular weekends within its scope; it does not replace the specific Father’s Day schedule.
>
> If he continues to argue otherwise, keep the response short and order-based: “The Father’s Day provision expressly begins possession Friday at 6:00 p.m. The Friday-holiday paragraph applies except where the order provides a separate schedule, so I will follow the specific Father’s Day provision.”

The implementation must preserve the substance of this experience without forcing this exact template on unrelated conversations.

## 3. Success criteria

### 3.1 Directness

1. A yes/no or either/or question begins with the disposition and outcome.
2. A question asking “does it start Thursday?” cannot pass with an introduction, heading, summary label, or abstract clause statement.
3. The first paragraph names the issue and practical result; pronouns such as “it” or abstractions such as “this event” cannot be left without a clear antecedent.

### 3.2 Beginner clarity

1. Assume the user is unfamiliar with court-order drafting unless the conversation establishes otherwise.
2. Translate scope phrases such as “Except as otherwise expressly provided,” “subject to,” and “notwithstanding.”
3. Explain how provisions work together before using canons such as “specific over general.”
4. Do not describe a general default and an express special rule as “competing” unless they create genuine unresolved tension.

### 3.3 Legal usefulness

1. Identify the operative clause, relevant interacting provisions, and their roles.
2. State the practical schedule, obligation, deadline, right, or limitation.
3. Address the opposing position when the user asks what happens if the other parent argues otherwise.
4. Recommend a reasonable, court-appropriate next action.
5. Offer a concise neutral communication when it is clearly useful or requested.

### 3.4 Human quality

1. Briefly recognize pressure, fear, confusion, or frustration when present.
2. Move promptly from recognition into organization and action.
3. Avoid generic sympathy loops, repetitive conclusions, rigid report templates, and needless disclaimers.

### 3.5 Reliability

1. The same verified issue cannot become ungrounded merely because the next user message uses different wording.
2. A truly new issue cannot silently inherit an old legal outcome.
3. Provider, repair, and deterministic fallback paths must satisfy the same response-quality contract.
4. Internal retrieval, OCR, confidence, and verification vocabulary never appears in the user-facing answer.

## 4. Architecture overview

The V2 pipeline will use four separate contracts:

1. **Active issue contract:** what legal problem is currently being discussed and what has already been verified.
2. **Question contract:** what the current turn is trying to accomplish.
3. **Evidence contract:** which document or authority propositions support the answer and what role each source plays.
4. **Canonical answer plan:** the one verified response plan from which user-facing prose is rendered.

Flow:

```text
Current message + active issue + bounded recent user context
  -> continuity resolution
  -> question contract
  -> document/authority retrieval plan
  -> structured model response
  -> evidence and responsiveness verification
  -> deterministic canonical answer plan
  -> adaptive user-facing renderer
  -> rendered-output quality verification
  -> persist response + updated active issue + internal trace
```

No stage may use prior assistant prose as legal evidence.

## 5. Active issue contract

### 5.1 New type

Add `src/lib/nexx/legal-engine/activeIssueContract.ts` with a versioned contract:

```ts
export type ActiveLegalIssueContractV1 = {
  version: 1;
  issueId: string;
  conversationId: string;
  caseId: string | null;
  issueType:
    | 'order_interpretation'
    | 'possession_schedule'
    | 'rights_obligations'
    | 'court_filing'
    | 'deadline'
    | 'procedure'
    | 'evidence_strategy'
    | 'co_parent_communication'
    | 'other_family_law';
  subject: {
    label: string;
    people: string[];
    events: string[];
    documentTerms: string[];
    legalTerms: string[];
    dates: string[];
    alternatives: string[];
  };
  userGoal: string;
  verifiedOutcome: {
    disposition: 'yes' | 'no' | 'qualified' | 'explanation' | 'cannot_determine';
    proposition: string;
    materialTerms: string[];
    schedule: {
      start: string | null;
      end: string | null;
      timezone: string | null;
    } | null;
  } | null;
  sourceAnchors: Array<{
    uploadedFileId: string;
    memoryGenerationId: string | null;
    chunkId: string;
    sourceId: string;
    role: 'controlling' | 'general_default' | 'express_exception' | 'special_rule' | 'supplemental' | 'superseded' | 'definition';
    pageStart: number | null;
    pageEnd: number | null;
    quoteFingerprint: string;
  }>;
  lastVerifiedTurnId: string | null;
  lastUserTurnId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
```

### 5.2 Storage

Add a `conversationLegalIssueState` Convex table rather than overloading `conversationDocumentState`. Store one row per legal issue so a packed family-law conversation can retain several issues while still identifying the one currently in focus.

Required fields:

- `conversationId`, `userId`, optional `caseId`;
- `activeIssueJson` with a strict parse/validate function;
- `issueKey` and `issueType` for bounded lookup and observability;
- `lastVerifiedTurnId`, `revision`, `createdAt`, `updatedAt`;
- `status`: `focused`, `active`, `dormant`, `superseded`, or `cleared`.

Indexes:

- `by_conversation_status`;
- `by_conversation_updated`;
- `by_user_updated`;
- `by_case_updated` when `caseId` is present.

There must be at most one `focused` issue per conversation, while up to eight bounded `active` or `dormant` issues may remain available for a packed case. A focus change does not erase or supersede unrelated unresolved issues. Updates use optimistic revision checks so concurrent turns cannot overwrite newer verified state.

### 5.3 Trust rules

1. Store only propositions that passed source and responsiveness verification.
2. Never treat `verifiedOutcome.proposition` as evidence; its `sourceAnchors` must be revalidated before reuse.
3. If an uploaded file’s active memory generation changed, the persisted anchors are stale and must be re-retrieved.
4. An edited or retried user turn creates a new issue revision and may supersede the earlier branch.
5. Deleted or inaccessible documents invalidate their anchors.
6. A new issue changes focus only after high-confidence new-issue resolution or a successful answer establishing the new issue; it does not automatically supersede the previously focused issue.
7. Packed-case intake may create several issue contracts, but only the issue addressed by the current answer becomes focused.

### 5.4 Bootstrap and migration

No bulk backfill is required. Existing conversations without issue contracts bootstrap from:

- the current user message;
- up to eight recent committed/degraded user messages;
- the active document state;
- the most recent verified response-composition metadata when available.

After the first successful V2 legal response, persist the verified focused contract and any separately identified packed-case issues. This keeps migration load bounded and avoids rewriting historical messages.

## 6. Continuity resolution

### 6.1 Replace the binary follow-up gate

Add `src/lib/nexx/legal-engine/continuityResolver.ts`:

```ts
export type ContinuityResolution = {
  kind: 'same_issue' | 'related_extension' | 'new_issue' | 'uncertain';
  activeIssueId: string | null;
  score: number;
  reasonCodes: string[];
  inheritedTerms: string[];
  conflictingNewIssueTerms: string[];
};
```

The resolver compares the current turn with the focused issue first, then a bounded set of other active or dormant issues. It is deterministic and adds no model call.

### 6.2 Same-issue signals

Recognize at minimum:

- “what if he/she/they says…”;
- “what if he fights back…”;
- “but he keeps saying…”;
- “does that change it?”;
- “what is he missing?”;
- “what if they rely on the other paragraph?”;
- “so does that mean…”;
- “are you sure?”;
- “what should I say?”;
- ordinary pronouns combined with an active document or active route;
- overlap with a material term, event, date, schedule alternative, clause role, or document anchor from the active issue.

### 6.3 New-issue signals

Treat a turn as a new issue only when one of these is true:

1. The user explicitly changes topics: “separate question,” “different issue,” “now about child support,” etc.
2. The turn introduces a high-signal legal subject absent from the active issue, such as a new motion, service deadline, support arrears, relocation, or conservatorship dispute.
3. The user selects a different uploaded document and asks a self-contained question about it.
4. The user corrects the prior subject and clearly redirects the analysis.

Generic legal words such as “order,” “holiday,” “court,” “he,” or “she” are not enough to declare a new issue.

### 6.4 Uncertain continuity

When continuity is uncertain:

- carry the active issue as a candidate for retrieval;
- include at most two other high-scoring open issues as labeled candidates when a packed conversation makes the reference genuinely unclear;
- do not carry its conclusion as established fact;
- require the question and evidence verifiers to confirm the relationship;
- ask a clarification only if the answer would materially differ between the candidate issue and the possible new issue.

This is safer than discarding context at the routing boundary.

### 6.5 Performance

- Evaluate a maximum of 40 recent messages and 4,000 normalized characters.
- Use precompiled patterns and sets.
- Complexity must remain O(n) over the bounded recent-message window.
- Do not add embeddings or an extra provider classification call.

## 7. Unified legal-signal extraction

### 7.1 Eliminate duplicated vocabularies

Add `src/lib/nexx/legal-engine/legalSignals.ts` and make these consumers use it:

- `router.ts`;
- `legalIntent.ts`;
- `documentReferenceDetection.ts`;
- `followUpContext.ts`;
- `retrievalPlan.ts`;
- composition trace generation.

### 7.2 Required signals

The shared extractor must recognize:

- federal, state, and local holiday;
- Juneteenth and common federal holiday names;
- Friday holiday, Thursday extension, summer months, school not in session;
- regular weekend, holiday possession, event-specific possession;
- “Except as otherwise expressly provided,” “subject to,” “notwithstanding,” “unless,” “supersedes,” and later modification language;
- start, end, pickup, exchange, surrender, return, and possession timing;
- adversarial continuation phrases;
- direct questions even when they do not use `can`, `does`, `is`, or `are`.

### 7.3 Normalization

Normalize curly apostrophes, punctuation, casing, common OCR substitutions, singular/plural forms, and harmless user typos. Preserve the original user text for display and audit.

## 8. Question contract

### 8.1 New type

Add `src/lib/nexx/legal-engine/questionContract.ts`:

```ts
export type LegalQuestionContract = {
  version: 1;
  kind:
    | 'yes_no'
    | 'either_or'
    | 'meaning'
    | 'schedule'
    | 'rights_obligations'
    | 'next_step'
    | 'communication'
    | 'procedure'
    | 'document_summary'
    | 'packed_intake';
  userGoal: string;
  subjectLabel: string | null;
  requestedOutcome: string;
  alternatives: string[];
  requiredAnswerTerms: string[];
  requiredExplanationConcepts: string[];
  requiresDocumentGrounding: boolean;
  requiresDirectDisposition: boolean;
  requiresPracticalNextStep: boolean;
  draftUsefulness: 'required' | 'helpful' | 'not_needed';
};
```

### 8.2 Incident contract

For “what if he fights back … federal holiday … starts Thursday?” with an active Father’s Day issue, the contract must contain:

- `kind`: `yes_no` or `either_or`;
- `subjectLabel`: `Father’s Day possession`;
- `alternatives`: `Thursday`, `Friday`;
- required answer terms: `Father’s Day`, `Friday`, `Thursday`;
- required explanation concepts: `general Friday-holiday rule`, `separate Father’s Day schedule`, `Except as otherwise expressly provided`;
- document grounding and direct disposition required;
- practical next step required;
- a communication draft marked helpful.

### 8.3 Targetedness

Replace `shouldRenderTargetedDocumentAnswer(documentReference)` as the sole targeted-answer gate. A turn is targeted when the question contract requests a schedule, disposition, right, obligation, deadline, meaning, clause relationship, or exact document fact.

`documentReference.referenceType` remains a retrieval signal, not the definition of whether the user asked a real question.

## 9. Evidence and clause-role contract

### 9.1 Retrieval

Build the retrieval query from:

1. current message;
2. inherited active-issue terms approved by continuity resolution;
3. question-contract terms;
4. source-anchor refresh terms;
5. existing clause bucket queries.

Do not append prior assistant prose.

### 9.2 Typed role verification

For every order-interpretation answer, classify selected sources as:

- controlling special provision;
- interacting general default;
- express scope/exception language;
- supplemental definition;
- later modification or superseding language;
- unrelated context.

A source’s presence or source ID does not establish its role.

### 9.3 Extensible issue predicates

Replace Father’s-Day-only activation with issue predicates selected from the active issue and question contracts.

The first predicates should cover:

- named possession holidays;
- regular weekend holiday extensions;
- school-holiday extensions;
- start/end exchange schedules;
- notice periods and deadlines;
- later signed modifications;
- rights and obligations stated with shall/must/may/not.

Each predicate defines:

- required operative source terms;
- material values that must match;
- allowed derivations;
- interacting clause roles;
- response concepts required for beginner clarity.

Father’s Day remains a regression fixture, not a hard-coded exception that bypasses general quality enforcement.

## 10. Canonical answer plan

### 10.1 New internal plan

Add `src/lib/nexx/legal-engine/canonicalAnswerPlan.ts`:

```ts
export type CanonicalLegalAnswerPlan = {
  version: 1;
  issueId: string | null;
  question: LegalQuestionContract;
  conclusion: {
    disposition: 'yes' | 'no' | 'qualified' | 'explanation' | 'cannot_determine';
    proposition: string;
    sourceIds: string[];
  };
  reasons: Array<{
    proposition: string;
    sourceIds: string[];
    purpose: 'operative_rule' | 'scope_translation' | 'interaction' | 'counterargument' | 'limitation';
  }>;
  practicalOutcome: {
    proposition: string;
    start: string | null;
    end: string | null;
  } | null;
  nextAction: string | null;
  communicationDraft: {
    tone: 'neutral' | 'firm';
    text: string;
  } | null;
  materialLimitation: string | null;
};
```

### 10.2 One source of rendered truth

Only `CanonicalLegalAnswerPlan` may feed the final legal renderer.

- `documentAnswer` remains the evidence/citation record.
- `legalInterpretation` remains the provider structured reasoning record during migration.
- `litigationNavigation` may contribute verified action and draft candidates.
- none of those structures renders a peer answer beside the canonical plan.

### 10.3 Schema migration

Do not immediately remove existing response fields. Add the canonical plan as an internal post-provider type first. Once all routes use it and production telemetry is stable, evaluate a provider-schema V3 that reduces duplicate prose fields.

This phased approach avoids a risky provider schema and runtime migration in the same release.

## 11. Responsiveness and quality verification

### 11.1 New verifier

Add `src/lib/nexx/legal-engine/answerResponsivenessVerifier.ts`.

Required checks:

- `resolvesRequestedOutcome`;
- `statesRequiredAlternatives`;
- `namesIssueWithoutDanglingAbstraction`;
- `dispositionMatchesQuestionKind`;
- `operativeValuesMatchSources`;
- `explainsRequiredConcepts`;
- `translatesPriorityLanguage`;
- `addressesOpposingArgumentWhenAsked`;
- `hasPracticalOutcomeWhenRequired`;
- `hasNextActionWhenRequired`;
- `draftMatchesVerifiedOutcome`;
- `containsNoGenericCanonicalAnswer`;
- `containsNoExtractionOrBackendDebris`.

### 11.2 Remove length-as-meaning checks

Length remains a hygiene check, never proof of responsiveness.

The following cannot satisfy a direct legal question:

- “Here are the key provisions in the order.”
- “The specific provision applies.”
- “The general rule remains in effect within its scope.”
- “Follow the order as written.”
- “It depends on the provision.”

Maintain these in a normalized generic-answer denylist plus structural checks for unnamed subjects and unresolved alternatives.

### 11.3 Source support

The conclusion, every material date/time/amount, each legal-role statement, and every draft assertion must map to supporting source IDs or an explicitly allowed deterministic derivation.

For the Father’s Day incident:

- Friday 6:00 p.m. and Monday 8:00 a.m. must come from the operative Father’s Day clause;
- the Thursday rule must come from the regular-weekend holiday extension;
- the scope explanation must cite the express carveout;
- the general clause cannot be labeled controlling for Father’s Day;
- a summer-interference mention or Thanksgiving provision cannot satisfy the predicate.

### 11.4 Beginner-language verification

When a controlling outcome relies on an exception, priority phrase, or defined term, at least one reason must translate it into ordinary language. Merely repeating the quoted phrase does not pass.

### 11.5 Verifier ordering

Run checks in this order:

1. active issue and question contract validity;
2. source identity and accessibility;
3. clause-role correctness;
4. proposition support;
5. responsiveness;
6. draft safety;
7. rendering hygiene and repetition.

Do not repair style before confirming that the answer is substantively correct.

## 12. Fallback redesign

### 12.1 Allowed fallback ladder

1. **Verified provider answer:** structured provider output passes all checks.
2. **Deterministic issue-specific synthesis:** build the conclusion and reasons from verified clause roles and material values.
3. **Concrete grounded limitation:** state what is visible, the exact missing item, and what would change the answer.

There is no generic “key provisions” legal-answer fallback.

### 12.2 Deterministic synthesis requirements

The synthesizer accepts only:

- a valid question contract;
- a supported controlling proposition;
- verified material values;
- verified interaction/priority propositions.

If those are unavailable, it must use the limitation fallback. It may not invent a subject or substitute the highest-scoring raw source sentence.

### 12.3 Limitation fallback example

> I can verify the general Friday-holiday rule, but I cannot verify the complete Father’s Day start-time sentence from the pages currently available. The missing part matters because it determines whether the order gives Father’s Day its own schedule. Upload that page or a clearer copy, and I can compare the two provisions directly.

This is preferable to vague confidence language or a generic summary.

### 12.4 Minimal render fallback

Replace `deterministicRenderedFallback()` with a fallback that accepts only a verified canonical plan. It must include:

- conclusion or concrete limitation;
- one distinct reason when supported;
- required practical next action;
- required draft when the question contract says it is required.

If the canonical plan itself is invalid, do not attempt to preserve its prose.

## 13. Adaptive rendering

### 13.1 Render from user need, not regex wording

Choose presentation mode from the question contract and issue complexity:

- `direct_conversational` for simple rights/schedule questions;
- `clause_explanation` for interacting order provisions;
- `strategy_and_draft` for co-parent pressure or communication;
- `procedure_navigation` for filings and deadlines;
- `packed_case_map` for long multi-issue intake;
- `grounded_limitation` when material text is unavailable.

### 13.2 Default legal-answer sequence

1. Direct conclusion.
2. Plain-English reason.
3. How other provisions or arguments affect the result.
4. Practical meaning/next action.
5. Optional concise draft.

Do not print these as fixed headings unless headings materially improve a complex answer.

### 13.3 Repetition

The conclusion appears once in the analysis body. The communication draft may restate it because it serves a different purpose, but it must be shorter than the analysis and suitable for a judge to read later.

### 13.4 UI rendering

Continue rendering assistant markdown through the existing safe markdown component. As a separate UI hardening task, verify the chat surface against the project’s AI Elements compatibility requirements before changing transport or message rendering. This response-quality implementation does not require an AI SDK transport migration.

## 14. Route-specific NEXX behavior gates

### 14.1 Order interpretation and possession

Must answer the actual schedule/right question, identify operative language, translate interaction, state practical outcome, and distinguish genuine conflict from scope.

### 14.2 Filing and litigation navigation

Must identify what was filed, requested relief, known service/hearing dates, missing deadline inputs, what happens next, and immediate preparation priorities. Never invent a deadline or local rule.

### 14.3 Pro se guidance

Must explain the process, required information, realistic risk points, forms/documents to verify, and preparation sequence. Lack of counsel cannot terminate useful guidance.

### 14.4 Emotional or pressured user

Must briefly acknowledge the pressure, separate the other parent’s claim from the controlling facts/order, identify what matters, prevent reactive communication, and give a court-appropriate next step.

### 14.5 Co-parent response

Must derive the draft from a verified outcome, remain brief and neutral, avoid accusations, and omit backend/source citations unless strategically requested.

### 14.6 Document quality limitations

Use all readable material. Mention only the missing or unreadable language that could materially change the answer. Never expose OCR scores, retrieval status, or verifier terminology.

## 15. File-level implementation plan

### 15.1 Add

- `src/lib/nexx/legal-engine/activeIssueContract.ts`
- `src/lib/nexx/legal-engine/continuityResolver.ts`
- `src/lib/nexx/legal-engine/legalSignals.ts`
- `src/lib/nexx/legal-engine/questionContract.ts`
- `src/lib/nexx/legal-engine/canonicalAnswerPlan.ts`
- `src/lib/nexx/legal-engine/answerResponsivenessVerifier.ts`
- `src/lib/nexx/legal-engine/genericAnswerPolicy.ts`
- `src/lib/nexx/legal-engine/issuePredicates.ts`
- `convex/conversationLegalIssueState.ts`
- `src/lib/nexx/__tests__/activeIssueContinuity.test.ts`
- `src/lib/nexx/__tests__/answerResponsiveness.test.ts`
- `src/lib/nexx/__tests__/chatAdversarialFollowupIncident.test.ts`
- `src/lib/nexx/__tests__/canonicalAnswerFallback.test.ts`
- `src/lib/nexx/__tests__/nexxBehaviorGolden.test.ts`

### 15.2 Modify

- `convex/schema.ts`: add issue-state storage and indexes.
- `convex/chatTurns.ts`: load issue state, build contextual retrieval from approved terms, persist revisions, record trace.
- `convex/chatWorker.ts`: build question contract, verify canonical plan, replace generic fallback, update issue state only after verification.
- `src/lib/nexx/router.ts`: consume continuity resolution; stop treating unrecognized phrasing as automatically new.
- `src/lib/nexx/followUpContext.ts`: accept continuity resolution and active issue terms.
- `src/lib/nexx/legalIntent.ts`: use shared legal signals.
- `src/lib/nexx/documentReferenceDetection.ts`: use shared holiday, timing, clause, and continuation signals.
- `src/lib/nexx/documentChunkRetrieval.ts`: include question-contract and active-issue terms without expanding source-count limits.
- `src/lib/nexx/legal-engine/retrievalPlan.ts`: select clause buckets from the question and active issue.
- `src/lib/nexx/legal-engine/issuePacks/texasPossession.ts`: expand federal-holiday and schedule language.
- `src/lib/nexx/legalDocumentAnswer.ts`: separate summary labels from canonical legal propositions; remove generic targeted answer.
- `src/lib/nexx/legal-engine/bestEffortLegalInterpretation.ts`: require issue predicate and supported outcome; remove generic clause abstractions.
- `src/lib/nexx/legal-engine/legalInterpretationVerifier.ts`: delegate responsiveness and issue-specific material checks.
- `src/lib/nexx/legal-engine/responsePlan.ts`: produce or adapt to the canonical answer plan.
- `src/lib/nexx/legal-engine/legalInterpretationRenderer.ts`: render one canonical plan adaptively.
- `src/lib/nexx/legal-engine/renderedOutputVerifier.ts`: verify required answer content, not opening regex alone.
- `src/lib/nexx/legal-engine/semanticDedup.ts`: retain repetition protection after substantive verification.
- `src/lib/nexx/prompts/developerPrompt.ts`: describe canonical structured responsibilities and forbid generic direct answers.
- `src/lib/nexx/schemas.ts` and `legalInterpretationSchema.ts`: add only fields required by the phased contract adapter.
- `src/lib/types.ts`: add V2 composition trace fields.

### 15.3 Remove or deprecate

- hard-coded “Here are the key provisions in the order” as a legal conclusion;
- hard-coded “The provision written specifically for this event applies…” as a sufficient explanation;
- `classifyFollowUpIntent(message) === 'new_issue'` as an unconditional context-discard rule;
- minimum string length as proof that a question was answered;
- Father’s-Day literal detection as the only trigger for schedule proposition verification;
- raw `documentAnswer.answer` as a canonical targeted answer;
- fallback logic that drops the required next action after semantic deduplication.

## 16. Implementation sequence

### Phase 0 — Characterization and safety net

1. Add the exact screenshot prompt as a failing regression.
2. Add current-output characterization tests for fallback, routing, and document detection.
3. Add negative tests proving a real new issue does not inherit Father’s Day.
4. Record baseline latency, repair rate, minimal fallback rate, and average selected source count.

Exit gate: tests reproduce the failure without production data or a live provider.

### Phase 1 — Shared signals and continuity resolver

1. Centralize legal signals.
2. Implement deterministic continuity resolution.
3. Update router and follow-up context to consume it.
4. Add paraphrase and typo matrices.

Exit gate: the screenshot prompt resolves `same_issue`; explicit child-support or new-motion prompts resolve `new_issue`.

### Phase 2 — Persisted active issue

1. Add schema/table and validated serialization.
2. Load the focused issue and a bounded open-issue set in generation context.
3. Revalidate document anchors.
4. Persist only after successful verification.
5. Handle focus changes, packed-case issue creation, retry/edit behavior, and concurrent revisions.

Exit gate: multi-turn tests retain the focused issue across route changes, preserve unrelated unresolved issues in packed conversations, and never cross conversation/user/document boundaries.

### Phase 3 — Question and canonical answer contracts

1. Build deterministic question contracts.
2. Adapt existing provider structures into a canonical plan.
3. Make the canonical plan the only legal-render input.
4. Retain existing provider schema during this phase.

Exit gate: all legal routes render through one plan with no peer answer concatenation.

### Phase 4 — Proposition and responsiveness verification

1. Implement general issue predicates.
2. Enforce required outcomes, alternatives, explanations, and practical actions.
3. Validate drafts independently.
4. Add generic-answer rejection.

Exit gate: every deliberately vague incident response fails verification even when it is grammatical, cited, and non-repetitive.

### Phase 5 — Fallback and renderer replacement

1. Add issue-specific deterministic synthesis.
2. Add concrete limitation fallback.
3. Replace minimal fallback.
4. Re-run semantic dedup only after substantive verification.

Exit gate: forced provider, repair, and render failures still produce either the verified outcome or a concrete limitation—never generic filler.

### Phase 6 — General NEXX behavior matrix

1. Add golden tests across possession, filings, pro se, emotional support, evidence organization, and co-parent response.
2. Validate beginner clarity and court-appropriate recommendations.
3. Confirm adaptive structure does not become a rigid template.

Exit gate: the architecture improves the incident without overfitting to Father’s Day.

### Phase 7 — Shadow rollout and production release

1. Deploy issue/question contract computation in shadow mode.
2. Compare V1 route/context decisions with V2 without changing answers.
3. Enable V2 output for internal/test accounts.
4. Canary by stable conversation hash: 5%, 25%, 50%, 100%.
5. Hold or roll back automatically when quality or error thresholds regress.

## 17. Test matrix

### 17.1 Exact incident

Conversation:

1. User asks whether Father’s Day starts Thursday because Friday is Juneteenth.
2. NEXX resolves Friday at 6:00 p.m. through Monday at 8:00 a.m.
3. User asks the exact screenshot follow-up.

Assertions:

- continuity is `same_issue`;
- active issue contains Father’s Day, Juneteenth, Thursday, Friday, and the active order;
- retrieval selects the Father’s Day clause, general extension, and express carveout;
- opening says no/Friday, not Thursday;
- explanation translates the carveout;
- response says the provisions do not contradict each other;
- response addresses the other parent’s argument;
- practical next action is present;
- no generic fallback phrase appears;
- no internal/extraction vocabulary appears;
- response is complete and non-repetitive.

### 17.2 Continuation paraphrases

At least 30 table-driven variants, including:

- “But he says the federal-holiday paragraph gives him Thursday.”
- “What if he keeps arguing the other provision controls?”
- “Does his interpretation change your answer?”
- “What is he leaving out?”
- “Are you sure the Friday language wins?”
- “He will say Juneteenth makes it Thursday.”
- “What if he fights me on this?”
- “Okay, but the order literally says Friday holidays begin Thursday.”
- casing, punctuation, apostrophe, typo, and speech-to-text variants.

### 17.3 New-issue isolation

- “Separate question: when is my response to his new motion due?”
- “Now I need help with child support arrears.”
- “Different order—what does this injunction mean?”
- a different conversation belonging to the same user;
- a different case;
- a packed conversation switching between two previously established issues;
- a shared file without an active grant;
- edited and retried branches.

No prior Father’s Day conclusion may leak into these answers.

### 17.4 Fallback injection

Force independently:

- malformed provider JSON;
- invalid source IDs;
- wrong schedule values;
- citation repair failure;
- missing controlling clause;
- generic provider direct answer;
- repeated renderer output;
- unsafe communication draft;
- stale memory generation;
- truncated controlling sentence.

Each path must produce a verified answer or concrete limitation.

### 17.5 General behavior goldens

Include representative scenarios for:

- custody/possession rights;
- modification and later-order priority;
- enforcement allegation review;
- newly served motion and deadline inputs;
- hearing preparation;
- pro se filing navigation;
- evidence/timeline organization;
- emotional multi-issue intake;
- neutral and firm co-parent drafting;
- readable document with one immaterial blurred page;
- materially missing controlling language.

### 17.6 Property and invariance tests

- Adding polite filler must not change issue resolution.
- Changing pronouns must not change verified outcome.
- Punctuation/casing must not change signal extraction.
- Reordering unrelated source packets must not change the controlling proposition.
- Duplicate source packets must not duplicate rendered reasons.
- A new issue term with a strong explicit transition must override continuity.
- The same inputs must produce the same deterministic fallback.

## 18. Performance and high-usage requirements

### 18.1 Runtime budgets

- Continuity + signal + question-contract computation: target p95 under 10 ms in isolation.
- Verification + canonical-plan composition: target p95 under 20 ms at maximum selected-source count.
- No additional model call in the successful path.
- No increase to current maximum retrieval chunk count.
- No unbounded database scans.
- One indexed read for active issue state and at most one optimistic write after a verified response.

### 18.2 Load tests

1. Run at least 1,000 pure pipeline evaluations with maximum recent-message, open-issue, and source-packet bounds.
2. Run at least 200 concurrent synthetic conversations, including packed multi-issue conversations, and confirm issue isolation and correct focus selection.
3. Exercise retries, edits, and duplicate request IDs.
4. Confirm active-issue writes are idempotent and revision-safe.
5. Measure heap growth and ensure contracts/traces remain bounded.

### 18.3 Data bounds

- focused issue JSON maximum: 16 KB;
- non-focused open issue JSON maximum: 8 KB each, with at most eight open issues loaded;
- subject/material term arrays: maximum 32 normalized values each;
- source anchors: maximum 12;
- quote fingerprint only, not full source text;
- composition trace maximum: 12 KB;
- retain existing audit expiration behavior unless product/legal retention requirements specify otherwise.

### 18.4 Security and privacy

- Issue-state reads and writes are internal server functions; do not expose a client query that accepts an arbitrary conversation ID.
- Reuse the existing authenticated conversation/user/case ownership checks before any issue state can influence generation.
- Store source fingerprints and identifiers, not complete order passages or prior assistant messages.
- Delete or clear issue-state rows when their conversation is deleted, and invalidate document anchors when access grants are removed.
- Never move issue state between conversations, even when they belong to the same user or case, without an explicit product-level handoff design.
- Redact user names and document text from operational alerts; use trace fingerprints and reason codes.

## 19. Observability

### 19.1 Composition trace V2

Add internal fields:

- `traceVersion`;
- `activeIssueId` and revision;
- `continuityKind`, score, and reason codes;
- inherited and conflicting issue terms;
- question kind and required answer terms;
- targeted-answer decision and reasons;
- retrieval buckets requested/filled;
- source roles and operative predicate result;
- canonical plan source: provider, deterministic synthesis, or limitation;
- responsiveness check results;
- generic-answer rejection;
- fallback/repair stage;
- final word/character count and verification result.

No trace data may be rendered to users.

### 19.2 Alerts

Alert on:

- any known generic canonical phrase reaching a committed assistant message;
- `minimal` or limitation fallback rate above baseline threshold;
- order/schedule route with no active issue and no self-contained question contract;
- direct question committed without a disposition;
- material schedule values failing source verification;
- active issue revision conflicts;
- stale source anchors reused;
- response repair rate or provider schema failure rate regression;
- p95 generation or verification latency regression.

### 19.3 Quality sampling

Create an internal redacted quality evaluator that scores:

- directness;
- responsiveness;
- beginner clarity;
- legal/source grounding;
- practical usefulness;
- court-appropriate tone;
- repetition/template feel.

Use it for release evaluation and trend monitoring, not as the only runtime gate.

## 20. Feature flag, rollout, and rollback

Add a server-side `NEXX_RESPONSE_PIPELINE_V2` control with modes:

- `off`;
- `shadow`;
- `internal`;
- percentage canary;
- `on`.

Use a stable hash of conversation ID for percentage assignment. Do not randomly switch a conversation between pipelines.

Rollback must disable V2 answer selection without deleting issue-state data. V1 remains available during canary, but generic-answer denylisting should remain active if independently safe.

Promotion gates:

1. all unit/integration/golden tests pass;
2. TypeScript, lint, build, and Convex code generation pass;
3. no critical/major review findings;
4. shadow divergence reviewed;
5. internal exact-incident test passes against production documents;
6. canary shows no error, latency, isolation, or limitation-rate regression;
7. manual browser verification confirms final UI rendering and no console errors.

## 21. Definition of done

The implementation is complete only when:

1. The exact screenshot follow-up produces the intended substantive answer from the active order.
2. At least 30 natural paraphrases preserve the same verified issue and result.
3. Strong new-issue prompts do not inherit the old issue.
4. Generic grammatical prose cannot pass as a direct legal answer.
5. Every provider/repair/fallback path is covered and fail-safe.
6. The general NEXX behavior matrix passes across order interpretation, filings, pro se navigation, emotional support, evidence strategy, and communication.
7. Concurrency, retry, edit, access-control, and stale-document tests pass.
8. Performance remains within the stated budgets.
9. Observability and rollback controls are live before full rollout.
10. Production canary and full rollout meet the promotion gates.

## 22. Implementation constraints

- Preserve document, case, user, and conversation access boundaries.
- Preserve existing user changes and unrelated worktree changes.
- Do not introduce a new model call solely for routing or continuity.
- Do not perform an AI SDK transport migration as part of this fix.
- Do not weaken citation/source verification to improve fluency.
- Do not hard-code the Father’s Day conclusion into general chat behavior.
- Do not expose active issue contracts, traces, retrieval terms, verifier checks, or confidence machinery to users.
- Do not mark the feature complete based only on unit tests; production-like multi-turn verification is required.
