# NEXX Family-Law Case Strategist Response Quality Specification

**Status:** Ready for implementation
**Priority:** P0 correctness and trust repair, followed by P1 conversation quality
**Audit date:** July 16, 2026
**Primary incident:** Father’s Day / Juneteenth order-interpretation response repeated its conclusion, mislabeled unrelated excerpts as controlling language, and described a resolved carveout as “competing language.”

## 1. Executive decision

NEXX must produce one coherent, source-grounded answer from one canonical response plan. It must not concatenate multiple independently worded versions of the same conclusion.

For court-order questions, NEXX must:

1. answer the user’s actual question first;
2. identify the operative order language and verify that every quotation and citation supports the proposition attached to it;
3. explain in plain English how provisions work together;
4. distinguish a general default rule from an express exception or special rule;
5. reserve “conflict,” “competing,” and “ambiguity” for genuine unresolved tension;
6. state the practical result once;
7. offer a co-parent draft only when the user asks for one or it adds clear practical value; and
8. keep internal uncertainty, retrieval, extraction, verification, and repair mechanics out of the user-facing response.

The immediate Father’s Day result should have been: the express Father’s Day provision supplies the start time, and the general Friday-holiday extension does not move this particular period to Thursday because that general rule begins with “Except as otherwise expressly provided.” The provisions are not contradictory. The general rule remains valid for qualifying weekend periods that do not have a separately stated schedule.

## 2. The response NEXX should have given

> No. My read of the final order is that Father’s Day possession begins Friday, June 19, 2026, at 6:00 p.m.—not Thursday—and ends Monday, June 22, at 8:00 a.m.
>
> Here is why: the order separately states the start and end times for Father’s Day. The Friday-holiday rule begins with “Except as otherwise expressly provided in this Modified Expanded Possession Order.” In plain English, that means the Thursday extension is the default rule only when another part of the order does not give a different, specific schedule. The Father’s Day paragraph does give that specific schedule.
>
> So these provisions do not contradict each other. The Thursday rule can still apply to a qualifying regular weekend, but it does not replace the expressly stated Father’s Day start time. The other parent’s reading focuses on Juneteenth falling on Friday, but it leaves out the opening exception that tells you when the Thursday rule does not apply.

If the user asked what to send, NEXX could add one short draft, without repeating the full analysis:

> “I reviewed the Father’s Day and Friday-holiday provisions. The holiday extension begins with ‘Except as otherwise expressly provided,’ and the order separately provides that Father’s Day possession begins Friday at 6:00 p.m. I will follow that specific schedule.”

### Calendar premise

For 2026, Father’s Day is Sunday, June 21. The preceding Friday is June 19, which is Juneteenth National Independence Day. The calendar facts should be resolved to absolute dates before rendering the answer. A current authoritative federal-holiday source should be used when the holiday’s legal status matters.

## 3. Audit of the supplied response

### What it got right

- It reached the stronger reading of the quoted order language: Friday at 6:00 p.m., not Thursday.
- It noticed the operative introductory phrase, “Except as otherwise expressly provided.”
- It avoided attacking the other parent.
- It attempted to provide a court-appropriate response draft.

### What failed

| Failure | Severity | User impact |
|---|---:|---|
| The conclusion was repeated several times | P0 | Makes the answer feel broken and obscures the reasoning |
| The rendered answer was cut off mid-word at “Giovann…” | P0 | Signals corruption and destroys trust |
| A summer-possession excerpt and a Thanksgiving excerpt were labeled “Controlling language” | P0 | Citations do not support the stated conclusion |
| “Potential competing provision” and “Competing language” were shown after the issue had already been resolved | P1 | Suggests the Thursday rule may still rival or contradict the Father’s Day rule |
| The same specific-over-general rationale was stated in multiple slightly different sentences | P1 | Adds volume without adding understanding |
| “The stronger reading” was used without first translating the order’s express carveout | P1 | Sounds tentative and legalistic even though the order contains a direct scope instruction |
| The user was given raw, long excerpts that did not answer the question | P1 | Transfers document-analysis work back to the user |
| The answer did not clearly say that the general rule remains valid but is outside this special provision’s scope | P1 | Leaves the user wondering whether the clauses contradict each other |
| The draft repeated the analysis nearly verbatim | P2 | Makes a simple co-parent message unnecessarily long |

## 4. Confirmed root causes in the current code

### 4.1 Direct-answer verification rejects a valid direct answer

`startsWithDirectAnswer()` in `renderedOutputVerifier.ts` uses a narrow phrase whitelist. It recognizes starts such as “No,” “Yes,” “My read,” and “The order,” but not a direct legal conclusion such as:

> “The Father’s Day clause controls.”

For a short question containing words such as “does” or “is,” the verifier therefore reports `includesDirectAnswerWhenNeeded`, even though the response already answers directly.

### 4.2 The repair puts an “answer-first” repair at the end

`repairRenderedOutput()` appends `injections.directAnswer` after the existing body. This cannot repair a requirement that the direct answer appear first. The beginning remains unchanged, so the next verification fails for the same reason.

### 4.3 The second fallback deliberately concatenates duplicate content

`deterministicRenderedFallback()` builds this array:

1. `directAnswer`;
2. `You can say: draftText`;
3. deadline text when relevant; and
4. the entire already repaired message.

The direct answer and draft are therefore added in front of a message that already contains the direct answer, explanation, practical result, and possibly a suggested reply.

Its `Set` only removes byte-for-byte identical whole sections. It cannot recognize the same conclusion when one copy has citations, a heading, quote marks, or a short prefix.

### 4.4 The fallback truncates by raw character count

The combined fallback is cut with `.slice(0, 4_000)`. This can split a sentence or word. The supplied “Giovann…” cutoff is consistent with this path.

After that cut, the outer repair can append the direct answer again, producing the final repeated conclusion after the visibly truncated block.

### 4.5 The renderer assembles three versions of the same reason

For standard and quick responses, `legalInterpretationRenderer.ts` builds `whyText` by concatenating:

- `interpretation.legalReading`;
- up to two `priorityLanguage[].explanation` values; and
- `competingClauses[0].whyItDoesOrDoesNotControl`.

Those fields usually express the same proposition. The current Father’s Day fixtures intentionally populate all three with variations of “the specific provision controls over the general provision,” so repetition is a designed outcome.

The practical block similarly concatenates `result`, `Start`, `End`, and `whatUserShouldDo` even when `result` already contains the start and end times.

### 4.6 The structured renderer exposes internal analysis categories

The structured mode renders headings named “Controlling language,” “Competing language,” “Why this controls,” “Practical reading,” “Practical meaning,” and “Suggested reply.” This is a diagnostic worksheet, not a natural client-facing explanation.

The default also becomes `structured_clause_analysis` whenever `userMessage` is absent from renderer options, and several golden tests invoke that default directly.

### 4.7 The fallback can label unrelated excerpts as controlling

`buildBestEffortLegalInterpretationFromDocumentAnswer()` does not determine clause role from legal scope. It:

1. selects source packets cited somewhere in `documentAnswer`;
2. sorts them with broad keyword weights;
3. treats the first source as preliminarily controlling;
4. labels packets matching generic words such as `regular`, `general`, `weekend`, `thursday`, `student holiday`, or `federal` as competing; and
5. labels the remaining packets as controlling.

That permits a summer-possession paragraph that merely mentions interference with Father’s Day, and even an unrelated Thanksgiving paragraph, to become “controlling language.” This exactly matches the supplied output.

The fallback also receives the raw current `userMessage`, not the resolved active issue/follow-up context. A vague follow-up can therefore lose the Father’s Day issue during source ranking even if routing correctly preserved it.

### 4.8 Source validation checks identity, not support

`verifyLegalInterpretationAnswer()` confirms that `sourceIds` exist, but it does not verify that:

- a clause quote appears in the cited packet;
- the packet discusses the issue being answered;
- the cited language supplies the start/end time claimed; or
- a packet assigned the “controlling” role is actually operative language.

`verifyLegalDocumentAnswer()` similarly permits document claims to cite any known source ID. Exact support text is optional. A valid ID attached to an unrelated paragraph can pass.

The direct-answer renderer then attaches page labels from every alleged controlling clause. Once source roles are wrong, the page citations on the conclusion are wrong too.

### 4.9 Retrieval buckets are broad and are not legal-role guarantees

The Texas possession retrieval plan includes broad terms such as “school,” “weekend,” “holiday,” “Friday,” “summer possession,” and “Father’s Day.” A paragraph can score in a bucket because it contains one of those terms without containing the operative clause.

Bucket coverage is useful for recall, but the current pipeline can treat retrieval-bucket membership as if it proved legal role. Retrieval relevance and legal control are different questions and must be verified separately.

### 4.10 Existing QA approves the defect pattern

The current deterministic QA passes 38 targeted tests. It still misses this incident because:

- fixtures isolate clean, idealized clauses with perfect headings;
- tests assert that all structured headings exist;
- tests assert the presence of repeated rationale but not its uniqueness;
- duplicate checking counts duplicate headings only;
- the QA report labels a visibly repetitive answer “Conversational quality: Pass”;
- the browser contract checks required phrases and forbidden internal terms, not coherence, source entailment, or repetition;
- no test exercises the full verify → repair → reverify → deterministic fallback loop with “The Father’s Day clause controls” as the opening;
- no test rejects mid-sentence truncation; and
- no test uses the noisy 46-page source pattern shown in the incident.

## 5. Required product behavior contract

### 5.1 Default audience: a legal beginner

Unless the user expressly identifies themselves as a lawyer or demonstrates sustained familiarity that the conversation has recorded, NEXX must assume they are new to family-law orders and procedure.

NEXX must define legal effect in ordinary language; explain phrases such as “except,” “subject to,” and “notwithstanding”; use absolute dates when relative dates can be resolved; distinguish what the order says from what the other parent argues; and avoid unexplained labels such as “specific-over-general,” “competing language,” or “stronger reading.”

Legal terminology may follow a plain-language explanation, but may not replace it.

### 5.2 Direct-first response plan

Every response must be composed from one internal `ResponsePlan`:

```ts
type ResponsePlan = {
  userGoal: string;
  directAnswer: string;
  explanationSteps: Array<{ point: string; sourceIds: string[] }>;
  practicalOutcome?: string | null;
  nextAction?: string | null;
  communicationDraft?: {
    text: string;
    includeBecause: 'user_requested' | 'clearly_actionable';
  } | null;
  materialLimitation?: string | null;
};
```

The renderer must select from these fields once. It must never concatenate a model-written `message`, a deterministic interpretation, a litigation response, and a repair fallback as peer answers.

### 5.3 Clause relationship model

Replace the user-facing concept of `competingClauses` with an internal `interactingClauses` model:

```ts
type ClauseRelationship =
  | 'general_default'
  | 'express_exception'
  | 'special_rule'
  | 'supplemental'
  | 'superseded'
  | 'genuine_conflict'
  | 'unrelated';

type InteractingClause = {
  relationship: ClauseRelationship;
  quote: string;
  sourceIds: string[];
  scope: string;
  effectOnOutcome: string;
};
```

Rules:

- Use `genuine_conflict` only when two operative provisions cannot reasonably be harmonized from the visible text.
- An express carveout that tells the reader which rule applies is not a conflict.
- A general rule outside the special provision’s scope is not “overruled”; it remains valid for the situations it covers.
- User-facing headings should say “How the two provisions work together” or “Why the Thursday rule does not change Father’s Day,” not “Competing language.”
- Do not show a second-clause section when it does not help answer the user’s actual confusion.

### 5.4 Order-interpretation hierarchy

The internal legal analysis must apply this sequence:

1. Confirm the currently operative signed order or later signed modification when the available documents permit it.
2. Identify the provision that directly addresses the event, right, deadline, or possession period.
3. Identify express scope language: “except as otherwise expressly provided,” “notwithstanding,” “subject to,” “unless,” or equivalent language.
4. Determine whether the other provision is a default rule, an exception, a special rule, a later modification, or a true inconsistency.
5. Harmonize provisions when the text supplies a coherent scope for each.
6. Use specific-over-general as an interpretive aid after the text’s express scope language, not as a vague substitute for reading the order.
7. Call the order ambiguous only when the visible language leaves a material issue unresolved.

### 5.5 Court-aware, user-aligned neutrality

NEXX is on the user’s side by making the user clearer, calmer, and better prepared. It may say the other parent’s reading is unsupported, but it must not invent motive or diagnose character.

Recommended framing includes:

- “The other parent is focusing on the Friday-holiday rule, but that reading leaves out the opening exception.”
- “That position is understandable as a first read, but it does not account for the separate Father’s Day schedule.”
- “A short, order-based response will create a cleaner record than a long argument.”

### 5.6 Adaptive conversation, not a fixed template

- **Simple order question:** direct answer + one plain-English explanation + practical result.
- **What should I say?:** draft first + one short reason if needed.
- **Clause explanation request:** direct answer + short quotes + how provisions fit together.
- **Packed case intake:** acknowledge overwhelm briefly, identify urgent priorities, organize issues, then give next steps.
- **Court filing/procedure:** deadline or posture first, then process, needed facts, filing readiness, and next action.
- **Drafting:** provide the requested draft plus a visible filing-readiness gate for missing court-specific information.

Headings are optional tools, not mandatory slots.

### 5.7 Material uncertainty only

If the operative sentence is readable, answer from it. Do not expose extraction or confidence terminology.

If a missing phrase could change the result, state only the practical limitation:

> “I can read the Father’s Day ending time, but the start-time phrase is cut off. I need a clearer image of that sentence to confirm whether it begins Thursday or Friday.”

Do not downgrade a clear answer because unrelated pages are poor quality.

## 6. P0 implementation requirements

### 6.1 Make rendered verification canonical-answer aware

Modify `verifyRenderedOutput()` to accept `canonicalDirectAnswer` and `draftRequired`. The direct-first check must use normalized prefix equivalence or proposition matching against the canonical answer, not a hard-coded opening-word whitelist.

It must accept direct starts such as “The Father’s Day clause controls,” “Father’s Day begins Friday at 6:00 p.m.,” “That provision does not move Father’s Day to Thursday,” and “Giovanni’s possession begins Friday.”

### 6.2 Repairs must be idempotent and position-correct

- If the direct answer is missing, prepend it once.
- If a requested draft is missing, insert it in the render mode’s designated location.
- Never append the direct answer to repair a direct-first failure.
- `repair(repair(message))` must equal `repair(message)`.
- A repair must not introduce a second conclusion, draft, or duplicate heading.

### 6.3 Replace concatenating fallback with minimal re-render

Remove the current `deterministicRenderedFallback()` composition strategy.

On a rendered-output failure, re-render from structured fields in a minimal mode: canonical direct answer, one verified explanation step, one practical result, and a draft only if required. Do not include the failed rendered message in the fallback.

The final fallback must itself be verified. If it fails, return the verified direct answer and one verified source-backed reason—not another concatenation pass.

### 6.4 Sentence-aware length control

- Remove raw `.slice(0, 4_000)` from legal response composition.
- Enforce length by selecting blocks before rendering.
- If an emergency cap remains, truncate at a paragraph or sentence boundary and never inside a quote, citation, word, or draft.
- A simple order question should normally remain under 220 words, excluding an explicitly requested message draft.

### 6.5 Semantic repetition guard

Add a user-facing semantic duplication check that removes citations, headings, and wrappers; excludes the optional draft from comparison with analysis; normalizes names and punctuation; compares sentence token sets or shingles; and flags substantially equivalent propositions.

Acceptance threshold:

- the core conclusion may appear once in the analysis body;
- no two non-quoted explanation sentences may have normalized similarity greater than `0.82` unless the second adds a distinct fact; and
- start/end times may not be restated in separate `result`, `Start`, and `End` sentences when the first result already contains them.

### 6.6 Verify clause quotations against cited text

For every controlling or interacting clause:

- the quote must fuzzy-match the cited source packet;
- the source must contain the issue anchor or be an adjacent continuation of an anchored clause;
- claimed operative details must be present in the quote or a verified continuation; and
- page labels must come only from the source packet supporting that proposition.

A known source ID alone is not sufficient.

### 6.7 Require proposition-level support for document claims

For `documentAnswer.claims`, require or deterministically derive a short support span, verify it occurs in the cited packet, and reject claims whose sources are unrelated provisions.

### 6.8 Fail safely when clause role cannot be established

`buildBestEffortLegalInterpretationFromDocumentAnswer()` must not invent controlling/competing roles from generic keyword regexes.

If the operative Father’s Day sentence cannot be located and verified, the fallback must say so. It may explain the visible general rule, but it must not call a summer or Thanksgiving paragraph controlling.

Pass the resolved active issue context into fallback ranking. Do not rank sources from a vague current message alone.

## 7. P1 implementation requirements

### 7.1 Redesign the legal interpretation schema

Reduce overlapping prose fields. The current schema asks the model to write the same conclusion into `directAnswer`, `plainEnglish`, `legalReading`, `priorityLanguage`, `practicalMeaning.result`, and `draftMessage`.

Introduce a v2 schema with one canonical direct answer, verified operative clauses, typed clause relationships, distinct explanation steps, structured practical schedule fields, one optional next action, one optional communication draft, and one material limitation field. Keep times as data and render them once.

### 7.2 Rewrite the developer behavior prompt

Add explicit requirements to default to a legal beginner; translate scope/exception phrases; avoid calling a resolved default/special-rule relationship “competing”; avoid repeating a conclusion across sections; use exact order language before interpretive canons; explain what the other parent’s reading misses without attacking the person; and treat the response plan as hidden reasoning rather than a checklist to print.

### 7.3 Separate retrieval recall from legal-role classification

Retain broad retrieval for recall, but add a role-classification gate. For possession disputes, role classification should require combinations such as:

- **special Father’s Day rule:** Father’s Day + possession + beginning/start + Friday + ending/end;
- **general holiday extension:** weekend period + begins + Friday holiday/student holiday/federal holiday + Thursday;
- **priority carveout:** “except as otherwise expressly provided” or equivalent; and
- **unrelated reference:** mentions Father’s Day only as an interference limitation or appears in another holiday section.

Adjacent chunks may be joined only when document order and section continuity are verified.

### 7.4 Add deterministic calendar resolution

Create a calendar resolver that resolves relative holidays to the requested year, calculates preceding/following weekdays from the order, preserves the case timezone, uses current authoritative sources when federal/state/local status matters, distinguishes the holiday date from an observed work holiday when relevant, and avoids assuming school is out without the applicable school calendar when that condition could change the result.

Calendar calculations are inputs to the answer; they are not model guesses.

### 7.5 Draft strategy

When a draft is useful, keep it shorter than the analysis; state the order-based position once; omit accusations and legal lectures; avoid page citations in ordinary co-parent messages unless strategically useful; make the message suitable for later judicial review; and provide a firmer version only when requested or clearly warranted.

## 8. File-level change plan

### Modify

- `src/lib/nexx/legal-engine/renderedOutputVerifier.ts`: canonical-answer verification, semantic duplication, idempotent repair.
- `convex/chatWorker.ts`: remove concatenating fallback, pass canonical fields, minimal re-render, composition trace.
- `src/lib/nexx/legal-engine/legalInterpretationRenderer.ts`: render each proposition once, remove default “Competing language,” render times once, require explicit mode.
- `src/lib/nexx/legal-engine/legalInterpretationSchema.ts`: v2 response plan and clause relationships.
- `src/lib/nexx/schemas.ts`: mirror the v2 structured-output contract.
- `src/lib/nexx/prompts/developerPrompt.ts`: novice-first, no-repetition, express-carveout-first guidance.
- `src/lib/nexx/legal-engine/legalInterpretationVerifier.ts`: quote-to-source and issue-role verification.
- `src/lib/nexx/legalDocumentAnswer.ts`: proposition-level source support.
- `src/lib/nexx/legal-engine/bestEffortLegalInterpretation.ts`: remove generic role inference, accept active issue context, fail safely.
- `src/lib/nexx/documentChunkRetrieval.ts`: preserve broad recall but expose evidence for the role gate.
- `src/lib/nexx/legal-engine/retrievalPlan.ts`: separate query buckets from verified roles.
- `src/lib/nexx/legal-engine/issuePacks/texasPossession.ts`: compound operative patterns and negative patterns.
- `src/lib/nexx/legal-engine/responseComposer.ts`: compose one response plan, not peer markdown answers.
- `convex/chatTurns.ts`: pass resolved follow-up issue context into generation and audit metadata.

### Add

- `src/lib/nexx/legal-engine/responsePlan.ts`
- `src/lib/nexx/legal-engine/clauseRelationship.ts`
- `src/lib/nexx/legal-engine/semanticDedup.ts`
- `src/lib/nexx/legal-engine/possessionCalendar.ts`
- `src/lib/nexx/__tests__/fixtures/fathersDayJuneteenth46Page.ts`

## 9. Internal observability

Persist an internal-only composition trace with render mode, canonical-answer fingerprint, selected source roles/pages, clause-role results, initial verifier errors, repair count, fallback stage, semantic duplicate score, length, and final verification result.

Do not expose this metadata in chat or source panels.

Alert when more than one repair occurs, a final fallback is used, a response is cut for length, a controlling clause fails issue-role verification, semantic duplication exceeds the threshold, or a direct answer’s citations do not support its operative terms.

This trace is required to diagnose the exact production path without relying on a copied answer alone.

## 10. Regression and acceptance tests

### 10.1 Exact incident regression

Given a source set containing the actual Father’s Day clause, the general Friday-holiday extension, a summer paragraph that only mentions interference with Father’s Day, a Thanksgiving/Christmas paragraph, and surrounding noisy text, the response must:

- begin with Friday, not Thursday;
- resolve the period to Friday, June 19, 2026 at 6:00 p.m. through Monday, June 22 at 8:00 a.m.;
- quote or accurately paraphrase the express carveout;
- explain it in beginner-friendly language;
- say the clauses do not contradict each other;
- explain that the general rule remains applicable within its scope;
- cite only the actual Father’s Day and general-extension language;
- exclude the summer-interference and Thanksgiving excerpts from controlling support;
- omit “Potential competing provision” and “Competing language”;
- state the core conclusion once in the analysis body;
- remain under 220 words unless more detail is requested; and
- end on a complete sentence.

### 10.2 Verifier/repair regressions

- “The Father’s Day clause controls.” passes direct-first verification.
- A truly missing direct answer is prepended once.
- A second repair produces byte-for-byte identical output.
- No repair appends a direct answer to the bottom.
- A fallback excludes the failed rendered body.
- A final fallback is verified before persistence.
- No length limit splits a word, sentence, quote, or citation.
- Duplicate conclusions with different citations or headings are detected.

### 10.3 Source-grounding regressions

- A valid but unrelated source ID does not satisfy a document claim.
- A clause quote not present in its source fails verification.
- A paragraph saying summer possession must not interfere with Father’s Day cannot be the operative schedule.
- A Thanksgiving paragraph cannot be a controlling Father’s Day clause.
- A continuation chunk supports the clause only when adjacency and section continuity are verified.
- Page citations attach to the exact proposition they support.
- A vague “Can he do that?” follow-up uses the resolved Father’s Day context during fallback.

### 10.4 Conversation-quality regressions

- A simple order question uses at most one light heading.
- A user who asks “What should I say?” receives the draft first.
- A user who does not ask for a message does not automatically receive a long draft.
- “Except as otherwise expressly provided” is translated into plain English.
- A resolved relationship is described as provisions working together, not as ambiguity.
- Emotional context receives one brief acknowledgment followed by legal/practical organization.
- No response exposes OCR, retrieval, confidence, verifier, chunks, source packets, or repair state.

### 10.5 Broader NEXX strategist regressions

Add golden conversations for order rights and obligations; later modifications; motion/petition analysis and deadline triage; evidence organization; pro se navigation; hearing preparation; neutral and firm co-parent drafts; incomplete filing-readiness data; genuine ambiguity; and safety-sensitive facts without inflammatory labeling.

Each must score legal grounding, directness, beginner comprehension, emotional intelligence, actionability, court appropriateness, source accuracy, non-repetition, and natural conversation. Presence of required keywords alone is not a conversational-quality pass.

## 11. Release gates

### P0 gate

- Exact incident regression passes end to end.
- Semantic repetition and source-role verification are enforced.
- No raw character truncation remains in legal-answer fallback.
- Repair is idempotent.
- Full unit suite, typecheck, lint, and production build pass.

### P1 gate

- Legal interpretation v2 is live.
- Beginner-first clause interaction language is live.
- Calendar resolution is deterministic.
- At least ten broader strategist golden conversations pass human review.
- Authenticated browser QA captures final answers and expanded sources.

### Production smoke gate

In an authenticated staging conversation:

1. upload the incident-style order fixture;
2. ask the exact Father’s Day/Juneteenth question;
3. capture the final answer and sources panel;
4. confirm no duplicate assistant bubble or stale draft remains;
5. inspect the internal composition trace;
6. confirm zero repairs or one successful idempotent repair;
7. confirm citations open the operative clauses; and
8. repeat with “What should I say?” and “Can he do that?” follow-ups.

## 12. Implementation sequence

1. **P0-A:** Fix direct-answer verification, repair placement, fallback composition, and sentence-safe limits.
2. **P0-B:** Add quote/source entailment and clause-role verification.
3. **P0-C:** Add the exact incident fixture and end-to-end regression.
4. **P1-A:** Introduce the canonical response plan and legal interpretation v2.
5. **P1-B:** Replace “competing language” with typed relationships and novice-first rendering.
6. **P1-C:** Add deterministic possession calendar resolution.
7. **P1-D:** Expand strategist golden conversations and authenticated browser QA.
8. **P2:** Add quality dashboards and tune naturalness from real conversations.

## 13. Definition of done

This specification is complete when a user can upload a real family-court order, ask a confused or emotionally charged question in ordinary language, and receive a response that correctly identifies the controlling text; explains why in beginner-friendly language; distinguishes a default rule from a special provision without manufacturing conflict; states the practical result once; provides a calm, court-appropriate next action; uses only citations that support the claim; never exposes internal mechanics; never repeats or truncates itself; and leaves the user more informed, prepared, and confident.
