# NEXX Anti-Caution Production QA

Environment: Local deterministic production-like QA against a branch based on current main; live staging/production browser login not executed because no dedicated QA credentials are present in the environment.
Base commit: `07cbbe68ffbeebbf55019d76b1545bf90c479248`
Branch: `agent/anti-caution-production-qa`
Deployment: `https://nexproof.io` / Vercel production deployment hostname redacted in committed QA artifact
Tester: Codex
Date: 2026-07-12T17:02:49.4951349-05:00

## Summary

Total scenarios: 8
Passed: 8 deterministic route/rendering scenarios
Failed: 0 deterministic scenarios after fix
Release blocker present: Yes, for live release signoff only: dedicated QA credentials/browser session are required to run the staging and production smoke passes.

During the first matrix run, Tests 4 and 5 exposed a verifier defect: direct insufficient-text answers beginning with `I cannot verify...` or `I do not see...` were not recognized as direct answers. The verifier was fixed to count those as valid direct answers. The full matrix was rerun and passed.

Created fixtures:

- `qa/fixtures/anti-caution/clear-order.pdf`
- `qa/fixtures/anti-caution/partial-relevant-readable.pdf`
- `qa/fixtures/anti-caution/irrelevant-page-unreadable.pdf`
- `qa/fixtures/anti-caution/controlling-language-unreadable.pdf`
- `qa/fixtures/anti-caution/no-fathers-day-clause.pdf`

Automated coverage added:

- `src/lib/nexx/__tests__/antiCautionProductionQa.test.ts`
- `qa/e2e/anti-caution-document-behavior.spec.ts`

## Results

### Test 1 - Clear Document

Fixture: `clear-order.pdf`
Prompt: `Under this order, does Father's Day possession start Thursday because Friday is a holiday, or does it start Friday?`
Route: `possession_access_schedule`
Legal intent: `possession_access_schedule`
Document answer type: deterministic legal interpretation
Certainty: `clear`
Source pages: controlling page 5; competing page 3
Fallback/repair: none in deterministic matrix

Visible response:

> No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]
>
> **Why:** The specific Father's Day provision controls over the general weekend-extension clause. [p. 5] [p. 3] The Father's Day provision is specific, while the Thursday-start language is a general weekend-extension rule. [p. 5] [p. 3] That is a general weekend-extension rule; it does not override the specific Father's Day provision. [p. 3]
>
> **Practical meaning:** The practical period is Friday at 6:00 p.m. through Monday at 8:00 a.m. Start: Friday at 6:00 p.m. End: Monday at 8:00 a.m. Use the specific Father's Day language if you respond.

Checks:

- Direct answer first: Pass
- Correct order interpretation: Pass
- No generic caution: Pass
- No internal terminology: Pass
- Source panel clean: Not executed in live UI; covered by existing source UI tests and browser spec contract
- Conversational quality: Pass
- Actionability: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: Specific-over-general reasoning is visible without generic caution language.

### Test 2 - Partially Readable Relevant Clause

Fixture: `partial-relevant-readable.pdf`
Prompt: same as Test 1
Route: `possession_access_schedule`
Legal intent: `possession_access_schedule`
Document answer type: deterministic legal interpretation
Certainty: `best_reading`
Source pages: controlling page 5; competing page 3
Fallback/repair: none in deterministic matrix

Visible response:

> No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]
>
> **Why:** The specific Father's Day provision controls over the general weekend-extension clause. [p. 5] [p. 3] The Father's Day provision is specific, while the Thursday-start language is a general weekend-extension rule. [p. 5] [p. 3] That is a general weekend-extension rule; it does not override the specific Father's Day provision. [p. 3]
>
> **Practical meaning:** The practical period is Friday at 6:00 p.m. through Monday at 8:00 a.m. Start: Friday at 6:00 p.m. End: Monday at 8:00 a.m. Use the specific Father's Day language if you respond.

Checks:

- Direct answer first: Pass
- Correct order interpretation: Pass
- No generic caution: Pass
- No internal terminology: Pass
- No document-quality warning: Pass
- Conversational quality: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: The scenario intentionally includes mild fixture degradation metadata; it is not surfaced in the answer.

### Test 3 - Unreadable Irrelevant Section

Fixture: `irrelevant-page-unreadable.pdf`
Prompt: same as Test 1
Route: `possession_access_schedule`
Legal intent: `possession_access_schedule`
Document answer type: deterministic legal interpretation
Certainty: `clear`
Source pages: controlling page 5; competing page 3; unrelated degraded page ignored
Fallback/repair: none in deterministic matrix

Visible response:

> No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]
>
> **Why:** The specific Father's Day provision controls over the general weekend-extension clause. [p. 5] [p. 3] The Father's Day provision is specific, while the Thursday-start language is a general weekend-extension rule. [p. 5] [p. 3] That is a general weekend-extension rule; it does not override the specific Father's Day provision. [p. 3]
>
> **Practical meaning:** The practical period is Friday at 6:00 p.m. through Monday at 8:00 a.m. Start: Friday at 6:00 p.m. End: Monday at 8:00 a.m. Use the specific Father's Day language if you respond.

Checks:

- Direct answer first: Pass
- Correct order interpretation: Pass
- No generic caution: Pass
- No internal terminology: Pass
- No warning about unrelated unreadable page: Pass
- Conversational quality: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: No answer text refers to the unrelated degraded page.

### Test 4 - Controlling Start-Time Language Unreadable

Fixture: `controlling-language-unreadable.pdf`
Prompt: `What time does Father's Day possession begin under this order?`
Route: `possession_access_schedule`
Legal intent: `direct_order_interpretation`
Document answer type: deterministic legal interpretation
Certainty: `insufficient_text`
Source pages: page 5
Fallback/repair: rendered-output verifier fix applied; rerun passed

Visible response:

> The order separately provides for Father's Day possession, but I cannot verify the exact start time from this copy because that part of the sentence is unclear. The ending time appears to be Monday at 8:00 a.m. [p. 5]
>
> A clearer image of page 5 is needed to confirm the start time. End: Monday at 8:00 a.m. Upload a clearer image of page 5 before using the start time in a filing or message.
>
> Only the start-time phrase is unclear; the ending time appears to be Monday at 8:00 a.m.

Checks:

- Useful answer first: Pass
- Does not guess start time: Pass
- Specific limitation only: Pass
- No generic caution: Pass
- No internal terminology: Pass
- Conversational quality: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: Initial verifier failure fixed by allowing direct insufficient-text starts such as `cannot verify`.

### Test 5 - Father's Day Clause Absent

Fixture: `no-fathers-day-clause.pdf`
Prompt: `What does this order say about when Father's Day possession begins?`
Route: `possession_access_schedule`
Legal intent: `direct_order_interpretation`
Document answer type: deterministic legal interpretation
Certainty: `insufficient_text`
Source pages: page 3
Fallback/repair: rendered-output verifier fix applied; rerun passed

Visible response:

> I do not see a separate Father's Day provision in this order.
>
> **Why:** I would not state a specific Father's Day start time from this document alone. [p. 3] That is a general Friday-holiday weekend-extension rule, not an express Father's Day provision. [p. 3]
>
> **Practical meaning:** Do not infer a specific Father's Day schedule unless another signed order or external authority is verified. Ask for the written provision being relied on before agreeing to a specific start time.
>
> The visible order language does not include a separate Father's Day provision.

Checks:

- Distinguishes absent from unreadable: Pass
- Does not invent Friday/Monday schedule: Pass
- No generic caution: Pass
- No internal terminology: Pass
- Conversational quality: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: Initial verifier failure fixed by allowing direct `I do not see...` answers.

### Test 6 - Vague Context-Aware Follow-Up

Fixture: continued from `clear-order.pdf`
Prompt: `Can he do that?`
Route: `possession_access_schedule` or `order_interpretation`
Legal intent: `direct_order_interpretation`
Document answer type: deterministic legal interpretation
Certainty: `clear`
Source pages: controlling page 5; competing page 3
Fallback/repair: none in deterministic matrix

Visible response:

> No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]
>
> The specific Father's Day provision controls over the general weekend-extension clause. [p. 5] [p. 3] The Father's Day provision is specific, while the Thursday-start language is a general weekend-extension rule. [p. 5] [p. 3] That is a general weekend-extension rule; it does not override the specific Father's Day provision. [p. 3]
>
> The practical period is Friday at 6:00 p.m. through Monday at 8:00 a.m. Start: Friday at 6:00 p.m. End: Monday at 8:00 a.m. Use the specific Father's Day language if you respond.

Checks:

- Uses active context: Pass
- Does not ask `can who do what`: Pass
- Direct answer first: Pass
- No internal terminology: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: Router preserves the active possession/order context.

### Test 7 - Verified Co-Parent Response Draft

Fixture: continued from `clear-order.pdf`
Prompt: `What should I respond?`
Route: `co_parent_response`
Legal intent: co-parent response draft with verified interpretation
Document answer type: litigation navigation/co-parent strategy
Certainty: uses verified interpretation
Source pages: page 5
Fallback/repair: none in deterministic matrix

Visible response:

> You can say:
>
> "My understanding from the order language is: Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m. The practical timing I am following is Friday at 6:00 p.m. to Monday at 8:00 a.m. [p. 5] I plan to follow that written provision."
>
> Firmer version:
>
> "I do not agree to a possession-time change based on an unstated provision. My reading of the order language is: Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m. The practical timing I am following is Friday at 6:00 p.m. to Monday at 8:00 a.m. [p. 5] If you believe a different signed-order provision controls, please identify that specific language."

Checks:

- Draft first: Pass
- Uses verified order terms: Pass
- No unverified time: Pass
- Neutral tone: Pass
- No internal terminology: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: The exact schedule appears only because verified interpretation data was passed in.

### Test 8 - Unverified Co-Parent Response Draft

Fixture: none in deterministic regression; live manual scenario should use `controlling-language-unreadable.pdf` or `no-fathers-day-clause.pdf`
Prompt: `What should I respond to him about the Father's Day start time?`
Route: `co_parent_response`
Legal intent: co-parent response draft without verified timing
Document answer type: litigation navigation/co-parent strategy
Certainty: no exact order term inserted
Source pages: none for start time
Fallback/repair: none in deterministic matrix

Visible response:

> You can say:
>
> "Please identify the specific written provision you are relying on for Father's Day possession. I want to keep this focused on the order and avoid arguing."

Checks:

- No exact unverified time: Pass
- Asks for written provision: Pass
- Neutral tone: Pass
- No internal terminology: Pass

Screenshot: Not captured; live browser execution blocked pending QA credentials.
Notes: The draft correctly avoids Friday/6:00 p.m. and Monday/8:00 a.m.

## Source-Display QA

Default source-panel and expanded source-panel behavior were not executed in a live browser because no dedicated QA credentials or authenticated browser session were available. Existing component coverage and the new browser-driver contract assert that the UI must not show extraction, OCR, confidence, verifier, source ID, chunk ID, or backend terms.

Added browser-driver contract:

`qa/e2e/anti-caution-document-behavior.spec.ts`

This contract can be wired to Playwright or an equivalent browser driver once these values are available:

- `QA_BASE_URL`
- `QA_EMAIL`
- `QA_PASSWORD`

## Defects

### QA-001

Severity: P1
Scenario: Tests 4 and 5
Expected: Direct insufficient-text answers beginning with `I cannot verify...` or `I do not see...` should pass rendered-output verification.
Actual: Rendered-output verifier reported `includesDirectAnswerWhenNeeded`.
Likely layer: verifier
Fix: Updated `startsWithDirectAnswer` handling in `renderedOutputVerifier.ts` to recognize direct insufficient-text answers.
Status: Fixed and rerun passed.

### QA-002

Severity: Execution blocker for live release signoff
Scenario: Staging and production browser smoke
Expected: Sign in with dedicated QA account, upload fixtures, capture screenshots, verify source panel.
Actual: No dedicated QA credentials were present in `.env.local`; no live authenticated browser run was performed.
Likely layer: QA environment
Fix: Provide dedicated QA account credentials or a pre-authenticated browser session; then run `qa/e2e/anti-caution-document-behavior.spec.ts` through a browser driver.
Status: Open.

## Validation Commands

- `node qa/scripts/generate-anti-caution-fixtures.mjs`
- `npx.cmd tsc --noEmit`
- `npx.cmd vitest run src/lib/nexx/__tests__/antiCautionProductionQa.test.ts`
- `npx.cmd vitest run`
- `npm.cmd run lint`
- `NEXT_PUBLIC_CONVEX_URL=https://placeholder.convex.cloud npm.cmd run build`

Results:

- Fixture generation: Pass
- TypeScript: Pass
- Anti-caution QA regression: Pass, 8 tests passed
- Full Vitest: Pass, 85 files passed, 1 skipped; 1083 tests passed, 3 skipped
- Lint: Pass with existing warnings, 0 errors
- Production build: Pass

## Recommendation

Release:

- Blocked for final live release signoff until staging and production browser smoke are executed with a dedicated QA account.
- Deterministic product-behavior matrix is approved after QA-001 fix.
