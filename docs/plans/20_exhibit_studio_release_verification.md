# Exhibit Studio implementation and release verification

Status: implementation under verification. This document does not certify completion of every requirement in specification 19. Production enablement is gated on hosted artifact verification and the outstanding items below.

## Implemented workflow

- Persisted case-scoped collections with revision checks, operation idempotency, ordered selections, bulk addition, independent subsets, source reuse and undo.
- Original PDF, PNG and JPEG sources; exact structured/WhatsApp message exports; immutable recorded-timeline snapshots; explicitly authored notes.
- Direct uploads through the existing upload service, chat-attachment collection actions, filtered timeline collection actions and standalone timeline PDF generation.
- Original page selection, normalized region crops, verified pixel redactions, source-ordered message excerpts, visible omissions and context selection.
- Combined exhibits with ordered source parts; separate parts for editing; classification filters and multiple case classification assignments pinned to their definition revision.
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
| Packet unit/integration fixtures | 18 passed after checksum, classification and numbering changes |
| Backend live checks | 14 passed: ownership, persistence, pinned classifications, idempotency, actual page/Bates assembly, source removal, immutable finalization, subsets, stale revisions, redaction review, assistant edit/undo, cancellation and expired-lease recovery |
| Real Clerk browser flow | Timeline selection → save → generation → rendered preview → finalization → byte-identical download → subset → refresh passed |
| Region browser flow | Original page rendering → region redaction → review → finalization → standalone index → mobile layout passed locally |
| Real upload browser flow | Shared intake → imported original → collection → generated PDF download passed; exposed and fixed Base64/hex checksum mismatch |
| Scale fixture | 100 exhibits / 500 total pages, 100 covers, multiple index pages, unique Bates and reconciled ranges; 7.0 seconds composition on local Node in the initial run, approximately 295 MB process RSS. Repeated prepared PDF source; not mixed-source load or a p95 guarantee |
| Broader regression suite | Initial run: 1,643 passed, six skipped, one unrelated timing assertion failed under parallel build/browser load. Its complete 39-test file passed when rerun alone. Latest full-suite run remains a release check |
| PDF visual inspection | Synthetic index and cover rendered with Poppler and inspected; complete dense/mixed-source visual reference set remains outstanding |
| Hosted browser verification | Sign-in/Studio work; source raster route returned 404. Investigation in progress; do not enable production on build success alone |

Local outputs are intentionally ignored: `output/exhibit-qa` and `output/exhibit-browser`. Never commit real case evidence or downloaded packet contents.

## Limits and supported boundaries

100 exhibits; 500 total pages including covers/index/front matter; 30 MB per original; 150 MB combined originals; 50 MB prepared images; 24 megapixels per raster page; two running jobs per user. Preview raster requests currently accept up to 30 MB; larger packets remain available as original PDF downloads.

Message JSON may be uploaded as `.txt` through the existing intake extension policy. Arbitrary prose text is not silently treated as a message transcript. PDF/image originals support characters outside the template font; generated text with unsupported glyphs fails clearly rather than replacing evidence characters. Annotated/form PDFs require a visually verified flattened copy for ordinary page embedding.

## Remaining specification and release work

- Resolve hosted raster-preview failure and rerun complete hosted workflows on the final revision.
- Complete the acceptance matrix with direct evidence for cross-case bulk atomicity, 30-item batch retries, timeline-edit immutability, keyboard flows and dense/long visual fixtures.
- OCR text-span selection pinned to document-memory extraction generations is not implemented. Current region/page selectors reference immutable original bytes and do not drift when OCR changes.
- A combined exhibit is filtered as a complete exhibit; matching-part-only classification selection needs explicit per-part assignment and inventory UX.
- Timeline currently exports a narrative chronology; alternate table templates and source-to-event navigation need further work.
- Shared assistant-kernel integration, richer source-cited suggestion lifecycle, summary locks and panel/tab preference persistence remain incomplete.
- Per-asset durable cache/checkpoint persistence and mixed-source/concurrent p95 profiling remain incomplete. Current retries are bounded whole-job retries.
- Global Bates reservations, ZIP/volume delivery, voice and standalone individual-exhibit delivery are not exposed. These require their own implementation and acceptance checks; global numbering must not be inferred from per-packet Bates.
- Production rollout and post-deployment live tests have not been completed.

## Rollout and rollback

Deploy additive Convex schema/functions before the frontend. Set `EXHIBIT_STUDIO_ENABLED=true` only after the selected environment passes hosted verification. Never enable `EXHIBIT_STUDIO_QA_ENABLED` in production. Keep preview frontends connected to a development/preview backend, never production.

Rollback new generation by setting `EXHIBIT_STUDIO_ENABLED=false`; existing collection and finalized-artifact reads remain available. Source and output permission checks continue to apply. A saved finalized artifact does not imply its original source is still available or independently authenticated.

Reproduction: `npx vitest run src/lib/exhibit-packets/__tests__`, `node scripts/test-exhibit-live.mjs`, and `npx playwright test --config playwright.exhibits.config.ts`. Browser tests use the approved preview robot and the development-only QA helpers. Use `E2E_BASE_URL` for a hosted preview whose public Convex URL matches the fixture backend.
