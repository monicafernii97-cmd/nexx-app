# Exhibit Studio implementation and release verification

Status: core release implementation verified on the development backend and hosted preview. Production deployment and the production release canary are separate gates. This document records measured results, not certification that every extension in specification 19 is complete.

## Implemented workflow

- Persisted case-scoped collections with revision checks, operation idempotency, ordered selections, bulk addition, independent subsets, source reuse and undo.
- Original PDF, PNG and JPEG sources; exact structured/WhatsApp message exports; immutable recorded-timeline snapshots; explicitly authored notes.
- Direct uploads through the existing upload service, chat-attachment collection actions, filtered timeline collection actions and standalone timeline PDF generation.
- Original page selection, normalized region crops, verified pixel redactions, source-ordered message excerpts, visible omissions and context selection.
- Pinned extraction spans retain their exact transcription, original page and extraction generation after OCR replacement. Missing verified extraction leaves original-page and region selection available.
- Narrative and table timeline PDFs; tables repeat headers and continue long event descriptions without dropping text.
- Combined exhibits with ordered source parts; separate parts for editing; classification filters and multiple case classification assignments pinned to their definition revision.
- Focused collections can explicitly include whole exhibits or only matching classified source selections. Reviewed summaries can be locked against manual and assistant replacement until unlocked.
- Covers, cover letters, summaries, dividers, multipage linked indices, bookmarks, master-label crosswalks, actual page ranges, configurable labels and Bates placement/page roles.
- Canonical manifests with source checksums, selector/settings snapshots, renderer versions and output page maps. Convex Base64 storage checksums are normalized to manifest hexadecimal hashes and checked against actual bytes.
- Durable scheduled workers with attempt fencing, leases, recovery, cancellation and guarded publication/cleanup. Retries currently restart composition from the immutable job snapshot.
- Stored preview PDF, authenticated raster page viewer, standalone index PDF, explicit redaction review and finalization of the exact reviewed bytes.
- Scoped assistant history, source-aware assistance, typed reversible edits and operation undo. Original evidence and finalization are outside assistant mutation capabilities.
- Legacy structured exhibit export routes users into Studio; the old stream endpoint rejects exhibit requests with a Studio destination. Court and summary paths remain separate.

## Recorded verification

Development backend: `avid-bobcat-637`. All fixtures are synthetic and cleaned after each run. QA helpers are internal, opt-in and explicitly disabled on the production deployment.

| Check | Observed result |
|---|---|
| TypeScript and production build | Passed locally; hosted Linux build passed |
| Packet unit/integration fixtures | 23 passed, including pinned transcription, matching-only subsets, timeline-table pagination, locked summaries and mixed-source layout |
| Backend live checks | 17 passed: ownership, persistence, pinned classifications, 30-item batch retry, mixed valid/cross-case batch atomicity, actual page/Bates assembly, source removal, immutable finalization, OCR replacement and live pinned-excerpt export, subsets, stale revisions, redaction review, assistant edit/undo, cancellation and expired-lease recovery |
| Real Clerk browser flow | Timeline selection → save → generation → rendered preview → finalization → byte-identical download → subset → refresh passed |
| Region browser flow | Original page rendering → pinned text selection/removal → region redaction → review → finalization → standalone index → mobile layout passed locally |
| Standalone chronology | Filter recorded timeline → choose table → save snapshot → download a standalone timeline PDF passed in the signed-in browser |
| Real upload browser flow | Shared intake → imported original → collection → generated PDF download passed; exposed and fixed Base64/hex checksum mismatch |
| Scale fixture | 100 exhibits / 500 total pages, 100 covers, multiple index pages, unique Bates and reconciled ranges; 7.0 seconds composition on local Node in the initial run, approximately 295 MB process RSS. Repeated prepared PDF source; not mixed-source load or a p95 guarantee |
| Broader regression suite | PR CI passed TypeScript, ESLint, unit/regression tests, production build, Vercel build and the existing upload preview journey on commit 5563bd3. Later changes require fresh CI before merge |
| PDF visual inspection | Poppler-rendered 79-page mixed fixture with 35 exhibits, portrait/landscape originals, dense message image, long title, two-page summary, multi-page index, table continuation and existing source stamp. Cover, table continuation and index inspected for readable spacing and no clipping |
| Hosted browser verification | All four expanded journeys passed on hosted Linux preview `nexx-8ko62w1pw-monicafernii97-cmds-projects.vercel.app`: real upload, timeline/table snapshot, pinned excerpt/redaction/mobile, and exact finalized-download release canary. A Vercel bundled worker-path issue was reproduced and fixed |
| Release canary | Approved synthetic robot: real upload → packet → rendered preview → reviewed finalization → SHA-256 verified download → registered cleanup passed locally. The same journey is included in production deployment assurance |

Local outputs are intentionally ignored: `output/exhibit-qa` and `output/exhibit-browser`. Never commit real case evidence or downloaded packet contents.

## Limits and supported boundaries

100 exhibits; 500 total pages including covers/index/front matter; 30 MB per original; 150 MB combined originals; 50 MB prepared images; 24 megapixels per raster page; two running jobs per user. Preview raster requests currently accept up to 30 MB; larger packets remain available as original PDF downloads.

Message JSON may be uploaded as `.txt` through the existing intake extension policy. Arbitrary prose text is not silently treated as a message transcript. PDF/image originals support characters outside the template font; generated text with unsupported glyphs fails clearly rather than replacing evidence characters. Annotated/form PDFs require a visually verified flattened copy for ordinary page embedding.

## Remaining specification and release work

- Rerun all hosted workflows and CI on the final revision; then verify the production deployment with the approved production robot.
- A richer structured citation/accept-reject lifecycle for assistant suggestions, shared assistant-kernel integration, source-to-timeline-event navigation and panel/tab preference persistence remain refinements. Current scoped assistance, reversible typed edits, explicit metadata proposals and summary locks work independently of these refinements.
- Per-asset durable cache/checkpoint persistence and mixed-source/concurrent p95 profiling remain incomplete. Current retries are bounded whole-job retries.
- Global Bates reservations, ZIP/volume delivery, voice and standalone individual-exhibit delivery are not exposed. These require their own implementation and acceptance checks; global numbering must not be inferred from per-packet Bates.
- Production rollout completion must be established from the deployed commit and passing production canary, not inferred from this branch report.

## Rollout and rollback

Deploy additive Convex schema/functions before the frontend. Set `EXHIBIT_STUDIO_ENABLED=true` only after the selected environment passes hosted verification. Never enable `EXHIBIT_STUDIO_QA_ENABLED` in production. Keep preview frontends connected to a development/preview backend, never production.

Rollback new generation by setting `EXHIBIT_STUDIO_ENABLED=false`; existing collection and finalized-artifact reads remain available. Source and output permission checks continue to apply. A saved finalized artifact does not imply its original source is still available or independently authenticated.

Reproduction: `npx vitest run src/lib/exhibit-packets/__tests__`, `node scripts/test-exhibit-live.mjs`, and `npx playwright test --config playwright.exhibits.config.ts`. Browser tests use the approved preview robot and the development-only QA helpers. Use `E2E_BASE_URL` for a hosted preview whose public Convex URL matches the fixture backend.

Production-safe canary: run only `release.spec.ts` with `E2E_EXHIBIT_RELEASE=true`, `E2E_ALLOW_PRODUCTION=true`, production Clerk credentials and the approved production robot. It uses the existing registered synthetic-upload lifecycle; cleanup is restricted to that robot, exact run-prefixed collections and source files. Do not execute development fixture helpers in production. No real case evidence is used by these tests.
