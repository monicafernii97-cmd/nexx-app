# Legal Agent Quality Engine Plan

This plan defines the step-by-step implementation loop for turning the chat flow into a confident, grounded legal assistant for court-order analysis, court filing drafting, and location-aware procedure support.

The non-negotiable rule remains: `messages.content` is user-visible only. It must contain polished user-facing text or a safe status message, never raw provider deltas, retrieval packets, source metadata, tool output, chunk IDs, memory IDs, block IDs, raw JSON, or debug text.

## Desired Product Behavior

- The assistant reads uploaded court documents, extracts the actual provisions, explains obligations and deadlines in plain English, and cites pages when page data exists.
- If extraction is partial but usable, the assistant answers from the extracted text without defaulting to alarmist warnings. If no exact page is available, it can still provide grounded analysis without inventing a page citation.
- The assistant drafts court filings, captions, motions, notices, declarations, proposed orders, checklists, and messages with state, county, city, court, case, party, and filing context.
- The assistant is resourceful: when user/account context is insufficient, it asks narrowly for the missing detail or uses authoritative live legal/court sources where available.
- The assistant is direct when a requested claim is missing, contradicted by the uploaded document, misleading, or likely inconsistent with applicable family-court procedure.
- Sources stay quiet by default: main answers use compact citations like `[p. 2]`; expanded panels show document title, page, short quote preview, confidence, warning if truly needed, and open/copy actions.

## Phase 1: Grounded Court-Order Fallbacks

- [ ] Replace generic "cannot safely support" court-order fallback with a grounded best-effort answer when extracted source packets exist.
- [ ] Cite available pages; if pages are missing, use "Order text" internally in tables instead of "Review source" or "Needs source review."
- [ ] Keep partial OCR/retrieval warnings out of the default response unless the extraction is truly unusable or contradictory.
- [ ] Preserve the P0 raw metadata protections in worker, persistence, and UI rendering.
- [ ] Add renderer tests proving no internal IDs or raw metadata are visible.
- [ ] Run local checks, CodeRabbit CLI review, PR review, merge, and production verification.

Complete means a court-order upload with usable extraction produces a structured, cited analysis instead of the generic incomplete-text fallback.

## Phase 2: Clean Document Lifecycle UX

- [ ] Define one document lifecycle state machine: selected, uploading, uploaded, reading document, preparing sources, ready, analyzing, complete, needs verification, failed.
- [ ] Render each state exactly once in the composer/upload area or inline status card, not as an assistant pretending to speak.
- [ ] Replace vague status language with legal workflow language: reading document, extracting obligations, finding deadlines, checking risks, preparing summary.
- [ ] Ensure analysis does not begin before the document is ready unless the UI clearly labels the run as partial.
- [ ] Add mobile and desktop QA for upload, ready, analyzing, final answer, and failure states.

Complete means upload and processing feel calm, singular, and understandable on desktop and mobile.

## Phase 3: Structured Legal Answer Contract

- [ ] Enforce a stable court-order answer shape: Executive Summary, Highest-Priority Findings, Key Obligations, Deadlines, Risks and Cautions, Recommended Next Steps, Source Details.
- [ ] Add answer-type routing for extraction, explanation, drafting, filing review, deadline extraction, and follow-up workflow requests.
- [ ] Add high-value follow-up chips: Create deadline checklist, Draft AppClose message, Explain possession schedule, Extract only deadlines, Create compliance calendar, Find enforcement risks.
- [ ] Keep compact citations inline and source details collapsed by default.
- [ ] Add snapshot and behavior tests for all answer types.

Complete means court-order answers are consistently structured and action-oriented without bulky repeated filename sources.

## Phase 4: Account-Aware Drafting Context

- [ ] Inventory account/case data available to chat: user location, state, county, city, court, case type, parties, children, filing posture, saved documents, deadlines, and prior case facts.
- [ ] Create a safe context builder that passes only relevant account/case fields to the model for the current request.
- [ ] Add consent/visibility rules so users understand what profile or case context is being used.
- [ ] Use saved location and case details for court document drafting so users do not have to repeat captions, titles, courts, parties, or county-specific details.
- [ ] Add tests proving cross-user/cross-case context cannot leak.

Complete means the assistant can draft case-specific court documents from saved account context without exposing private metadata or mixing cases.

## Phase 5: Official Law and Local Court Research

- [ ] Add an authoritative-source policy that prefers statutes, court rules, official judiciary pages, state self-help sites, and county clerk/court websites.
- [ ] Build source discovery from user/account location: state, county, city, court name, court type, and filing category.
- [ ] Fetch and summarize live court/clerk sources with citations and retrieval timestamps.
- [ ] Clearly separate uploaded-document facts from external legal/procedure sources.
- [ ] If the uploaded document conflicts with applicable law/procedure or user assumptions, explain the conflict directly and cite both the document and official source.
- [ ] Add tests/mocks for county clerk retrieval, missing county data, dead links, stale pages, and conflicting sources.

Complete means filing guidance and drafts can use official local sources based on location instead of generic legal guesses.

## Phase 6: Court Filing Drafting Engine

- [ ] Add drafting templates for common family-court artifacts: motion, response, declaration, proposed order, notice, certificate of service, discovery request, enforcement summary, deadline checklist, and compliance calendar.
- [ ] Generate court-appropriate captions, titles, party labels, jurisdictional sections, factual background, requested relief, signature blocks, service language, and exhibit references.
- [ ] Require grounding for factual allegations from uploaded documents, user facts, or cited official sources.
- [ ] Ask concise follow-up questions only when a necessary drafting field is missing and cannot be inferred safely.
- [ ] Add export-ready formatting tests and legal drafting QA fixtures.

Complete means users can ask for precise court-document drafts and receive confident, structured drafts based on their documents, case context, and local rules.

## Phase 7: Safe QA and Production Verification

- [ ] Run the full PDF upload -> analysis -> final answer flow in staging or local preview with synthetic, public, or explicitly consented documents.
- [ ] If production verification is required, limit it to a read-only smoke check with redacted message snapshots; confirm `messages.content` stays clean without exposing private legal text or user metadata.
- [ ] Capture desktop and mobile screenshots for upload state, analysis state, final answer, collapsed sources, expanded sources, and bottom scroll.
- [ ] Run grep checks for internal field names and explain every remaining result as internal-only or user-visible.
- [ ] Run lint, typecheck/tsc, tests, build, and focused Playwright QA.
- [ ] Merge only after CodeRabbit and GitHub checks have no actionable critical or major issues.

Complete means the live production chat flow matches the desired behavior and no raw internals appear in UI or visible message records.

## Review Loop for Every Phase

1. Create or continue a `codex/` phase branch.
2. Implement only the current phase scope.
3. Run focused tests first, then full local checks as appropriate.
4. Run CodeRabbit CLI review on the phase diff and address actionable findings.
5. Commit intentionally, push, and open a ready-for-review PR.
6. Let automatic GitHub and CodeRabbit PR review run.
7. Fix unresolved actionable comments, push updates, and avoid rapid review loops.
8. Merge to `main` only when the phase passes checks and has no critical or major actionable comments.
9. Verify production behavior before starting the next phase.
