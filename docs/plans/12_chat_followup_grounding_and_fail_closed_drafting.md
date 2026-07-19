# NEXX Follow-Up Grounding and Fail-Closed Drafting Specification

**Status:** Implemented; release validation in progress
**Priority:** P0 correctness, trust, and production reliability
**Incident date:** July 18, 2026
**Incident:** A Father’s Day follow-up asking what to say returned a generic OCR fragment as the answer and embedded that fragment in a proposed co-parent message.

## 1. Executive decision

NEXX must preserve the active legal issue when a conversation changes from order interpretation to practical drafting. A route change must never discard the issue terms used to retrieve and verify the controlling order language.

A source identifier proves only that a source exists. It does not prove that the source is controlling, that an answer is responsive, or that a draft is safe to send. Every user-facing legal conclusion and every proposed outgoing message must be verified against the operative source proposition before rendering.

If that verification cannot be completed, NEXX must fail closed with a clean, useful explanation. It must never place raw OCR text, page furniture, incomplete headings, or extraction fragments into an answer or communication draft.

## 2. Required user experience

For the active Father’s Day / Juneteenth issue, a follow-up such as “What should I say?” should produce:

> You can say:
>
> “I reviewed both provisions. The Friday-holiday extension begins with ‘Except as otherwise expressly provided,’ and the order separately states that Father’s Day possession begins Friday at 6:00 p.m. I will follow the specific Father’s Day schedule.”
>
> That keeps the response focused on the written order. The provisions do not contradict each other: the Thursday extension remains the general rule for qualifying weekends, while the separately stated Father’s Day schedule governs this particular period.

The response must not expose page headers, extraction markers, incomplete document text, internal verification language, or full party names that add no practical value.

## 3. Confirmed root causes

### 3.1 Retrieval context is coupled to the current route

The follow-up retrieval message is enriched only for document-analysis routes. “What should I say?” changes the route to `co_parent_response`, so the same active order issue can be retrieved with only generic drafting words. Generic searches favor early document chunks such as a “Weekends” heading instead of the previously resolved Father’s Day clause.

### 3.2 Conversation continuity retains questions but not a verified issue contract

Recent context is assembled from user messages. The prior verified legal outcome and its operative source identifiers are not a first-class input to follow-up drafting. The model must reconstruct the issue from scratch on every turn.

### 3.3 Top-level answers are not proposition-verified

Document verification checks structured claims and citations, but the top-level `documentAnswer.answer` can become the canonical direct answer without being checked for responsiveness, extraction debris, or support for the requested issue.

### 3.4 Legal interpretation verification is structural

Minimum lengths, known source identifiers, and the presence of explanation text can satisfy verification even when the direct answer does not state the operative result. For Father’s Day, a general weekend clause or priority phrase can be considered relevant even though neither is the operative Father’s Day schedule.

### 3.5 “Verified” drafting accepts source presence as proof

The drafting bridge treats an interpretation as verified when a controlling clause contains a source identifier. It then copies the practical result or direct answer into a message. This allows malformed or nonresponsive text to become a proposed communication.

### 3.6 Best-effort and final fallbacks amplify upstream corruption

The document fallback selects the strongest-looking raw source sentence. The rendered fallback then preserves the canonical answer, explanation, and draft. If the canonical answer is an OCR fragment, the fallback makes the broken text deterministic.

### 3.7 Existing tests bypass the broken boundary

Current follow-up tests inject a correct interpretation directly into the drafting renderer. They do not exercise stored-document retrieval, route transition, malformed OCR, repair, and deterministic fallback in one multi-turn story.

## 4. Functional requirements

### 4.1 Active-issue continuity

1. Document-grounded follow-ups include order interpretation, possession scheduling, co-parent response, de-escalation, and other litigation-navigation routes.
2. Retrieval uses a bounded contextual query containing the current message and recent relevant user issue statements.
3. Context assembly is deterministic, deduplicated, size-bounded, and linear in the number of recent messages.
4. A drafting route must re-retrieve the operative clauses when an active document is present.
5. A new issue must not inherit the prior issue query.

### 4.2 Operative-clause verification

For a Father’s Day schedule question:

1. A controlling clause must itself contain Father’s Day, a Friday start, and a Monday end.
2. The general Friday-holiday extension is an interacting general rule, not a controlling clause.
3. The express carveout is priority/scope language, not the event schedule.
4. The rendered outcome must state Friday, not Thursday, when the operative clause supports that result.
5. Any material day or time in the answer must be present in or deterministically derived from verified source language.

Equivalent issue-specific predicates must be extensible for other possession holidays without weakening the generic verifier.

### 4.3 User-facing text hygiene

Answers, practical results, and drafts must reject:

- page furniture such as `-- 10 of 46 --`;
- isolated numbered headings;
- internal source or extraction fields;
- visibly incomplete clauses;
- raw fragments ending with `as follows:` or an orphaned paragraph number;
- excessive all-caps party-name text copied from an order;
- ellipsis truncation used as the substance of a legal conclusion.

Exact short quotations remain allowed when complete and tied to a supported proposition.

### 4.4 Draft safety

1. A draft is generated only from a verified practical proposition, never directly from a raw source packet.
2. Draft verification is independent from answer verification.
3. A draft must contain the operative result for the active issue.
4. Citations may inform the user-facing analysis but should not be embedded in a message intended to send to the other parent unless the user requests them.
5. If a verified result is unavailable, provide a short holding response that asks for the specific written provision without asserting an unverified schedule.

### 4.5 Fail-closed fallback

1. Best-effort interpretation may synthesize a deterministic answer only when an issue-specific operative clause is present.
2. Raw source previews are never canonical answers for targeted legal questions.
3. The final rendered fallback revalidates answer, explanation, practical result, and draft.
4. If the canonical plan is invalid, render a clean limitation and next step rather than preserving invalid text.
5. Fallback remains bounded, sentence-safe, idempotent, and free of semantic repetition.

### 4.6 Observability

Internal composition traces must record:

- whether follow-up context was applied;
- active-issue terms used for retrieval;
- whether operative-clause validation passed;
- whether answer and draft proposition validation passed;
- whether extraction debris was rejected;
- fallback stage and final verification outcome.

No trace vocabulary may appear in the user-facing response.

## 5. Performance and high-usage requirements

1. Context construction is O(n) over a fixed recent-message window and capped at 4,000 characters.
2. Verification uses prebuilt maps and bounded source sets; it must not add model calls.
3. Source-role and text-hygiene checks are deterministic and synchronous.
4. Retrieval retains current maximum chunk limits and does not expand database scans.
5. Repair attempts remain bounded to the existing provider attempt budget.
6. Identical follow-up inputs yield identical deterministic fallback output.
7. Concurrent conversations remain isolated by conversation, user, document grant, and active memory generation.

## 6. Required test matrix

### 6.1 Exact multi-turn production incident

1. Turn one asks whether Father’s Day starts Thursday because Friday is Juneteenth.
2. Turn two asks “What should I say?”
3. The route changes to co-parent response.
4. Retrieval still selects the Father’s Day schedule, general extension, and express carveout.
5. The draft states Friday at 6:00 p.m. and contains no OCR debris.

### 6.2 Adversarial source selection

- A generic “Weekends” chunk cannot control Father’s Day.
- A summer-interference reference cannot control Father’s Day.
- Thanksgiving text cannot control Father’s Day.
- A known but unrelated source identifier cannot satisfy answer or draft verification.
- A malformed page header cannot become a canonical answer.

### 6.3 Repair and fallback

- Force invalid provider legal interpretation.
- Force citation repair failure.
- Force rendered repair and minimal fallback.
- Assert every stage either produces the verified result or a clean limitation.
- Assert no stage produces raw source text as an outgoing draft.

### 6.4 Context isolation and scale

- A new issue does not inherit Father’s Day terms.
- Two conversations with different active documents do not share issue terms.
- Repeated follow-ups do not grow context without bound.
- Large recent-message collections remain capped and deterministic.
- Verification time remains stable across the maximum selected-source count.

## 7. Release gates

### P0

- Exact multi-turn incident passes through retrieval, interpretation, drafting, repair, and fallback.
- Direct answer and draft proposition support are enforced.
- Extraction debris cannot pass any user-facing boundary.
- Co-parent follow-ups retain active document issue context.
- Targeted legal fallbacks never use raw source previews.

### Quality

- Targeted tests pass.
- Full Vitest suite passes.
- TypeScript passes with no errors.
- ESLint has no new errors.
- Production build succeeds.
- CodeRabbit has no unresolved critical or major findings.

### Production

- Ready-for-review PR merges to the repository default branch.
- Convex production deployment succeeds.
- Vercel production deployment is READY and aliased to `nexproof.io`.
- Public production loads without console errors.
- An authenticated multi-turn smoke test is performed when an authenticated browser session is technically available; otherwise the release report must explicitly identify that verification limitation and provide all other production evidence.
