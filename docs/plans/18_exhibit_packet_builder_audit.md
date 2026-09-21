# Nexproof exhibit packet builder: code audit and completion specification

Audit date: September 20, 2026. Repository HEAD: `bd432bf`, plus the existing working tree.

## 1. Executive assessment

**The exhibit builder is not currently a complete evidence-packet product.** The dedicated builder is a staging interface with a placeholder generation action. A separate, connected export system can generate exhibit-shaped PDFs, but it primarily renders drafted text and summaries. It does not provide the original-document assembly, reliable page mapping, complete indexing, numbering, and final-artifact verification needed for professional packets.

The highest priority is evidence fidelity and deterministic assembly. Cosmetic improvements alone would make the output appear more finished without resolving its underlying correctness problems.

This audit inspected the dedicated builder, shared export UI/context, assembly queries and selection, mappers, drafting bridge, canonical adapter, renderers, validators, storage/job infrastructure, and relevant tests. Findings below distinguish confirmed code behavior from capabilities not found in the inspected exhibit path. This is a repository audit, not a live deployment or jurisdictional compliance certification. No production packet was generated or visually inspected.

## 2. Current workflows

### A. Dedicated Exhibit Packet Builder

`/docuvault/exhibits` → `ExhibitPacketBuilder` → query case pins and case memory → add text items to local state → show letter labels and configuration → click Generate Final Packet → wait two seconds → stop spinner.

There is no generation request, saved artifact, download, preview, or error lifecycle in that action.

### B. Shared structured export workflow

Create export → load case workspace inputs → classify and map nodes → review/override content → draft sections → optionally draft exhibit covers → adapt to canonical exhibit sections → HTML → Puppeteer PDF → validate basic buffer properties → store artifact and export metadata.

This is real infrastructure, but the content path is a document drafting workflow rather than an original-evidence assembly workflow.

### C. Additional components and helpers

`ExhibitExportModal` defines a richer option set, but repository reference search found no importing consumer. `buildExhibitsFromWorkspace` and `buildImageExhibits` provide useful primitives; no production callers were found for those helpers. Their existence does not establish user-accessible functionality.

## 3. What exists and can be reused

| Capability | Current implementation | Practical limit |
|---|---|---|
| Dedicated exhibit workspace | Add/remove case pins and exhibit notes; A/B/C labels; source-link auto-staging | Local state; text-only source population; generation stub |
| Case-scoped assembly | Authenticated queries for memories, pins, patterns, confirmed incidents, timeline events | Does not resolve and assemble uploaded evidence files |
| Organization | Mapper sorts by chronology, issue, witness, or source and constructs groups | Group structure is discarded by the canonical exhibit adapter |
| Label formats | Shared helpers support alphabetic, numeric, party-based labels | Multiple label implementations; source-to-content identity is inconsistent |
| Covers and summaries | Mapped covers and AI drafting with fallback behavior | Covers depend on summary length and are capped at 20 |
| Exhibit rendering | Title page, simple index, cover, text, image/chart renderer primitives | Connected adapter generates text sections; renderer rearranges sections by type |
| Page numbering | Shared PDF renderer supports ordinary page numbers and Page X of Y | Separate from Bates and exhibit-local numbering |
| Bates formatting | Prefix/start formatter and HTML stamp elements | Section-based rather than physical-page-based; missing route wiring |
| Review/recovery | Shared review items, locks/overrides, export sessions, autosave foundations | Not wired to the dedicated builder; not a versioned packet manifest |
| Artifact infrastructure | Export lifecycle, concurrency admission, idempotency, storage, checksum metadata | Inline request execution; no durable packet assembly/page checkpoint engine |
| Reference matching | Exhibit mention/candidate matching with ambiguity handling | Does not create final PDF destinations or validate final page references |
| Upload foundations | Uploaded-file hashes and document-memory page records elsewhere in the application | Must be connected explicitly to exhibit source resolution |

## 4. Confirmed defects and implementation gaps

Priority definitions: **P0** blocks a usable or trustworthy packet; **P1** blocks dependable professional operation; **P2** improves advanced handling and presentation.

### F01 — P0: final generation is a placeholder

Evidence: `src/components/pipelines/exhibits/ExhibitPacketBuilder.tsx:155`.

The handler contains a TODO to call generation and only runs a timer. Every configuration toggle in this screen currently affects local display only.

Required: connect this screen to one authoritative packet service with persisted draft ID/revision, validated settings, progress, explicit failure, completed artifact, preview, and download.

### F02 — P0: original evidence is absent from the connected assembly path

Evidence: `src/lib/export-assembly/services/getAssemblyInputs.ts:164`, `convex/assemblyQueries.ts`, `src/lib/export-assembly/pipelineBridge.ts`, and `src/lib/exports/adaptDraftedToCanonicalExport.ts:235`.

Assembly loads text records, not uploaded-file bytes and selected pages. The drafting bridge generates unlocked sections with AI. The exhibit adapter uses their bodies as exhibit content. `linkedEvidenceId` in mapped entries does not cause the original document to be fetched or embedded. The auto-builder similarly falls back from raw text to summary.

Consequence: the PDF may be a narrative about evidence instead of the evidence itself. Original PDF layout, signatures, complete message context, source pagination, and visual details are not preserved by this path.

Required: immutable original assets plus explicitly derived representations; page selection and original PDF page assembly; image normalization; deterministic document conversion where needed. AI may suggest descriptions and cover summaries, but must never silently replace evidence pages. A user-authored narrative must be identified as its own document type.

### F03 — P0: selected evidence IDs do not control shared assembly inclusion

Evidence: `src/lib/export-assembly/index.ts:87`; `src/app/(app)/docuvault/context/ExportContext.tsx:851`.

The context populates `selectedEvidenceIds`, but `assembleExportInput` filters only selected node IDs and timeline IDs. An empty node selection means all nodes. The mapper then includes nodes using relevance/type rules. Repository searches found no assembly consumption of the evidence-ID selection field.

Consequence: a selected-evidence request does not reliably mean only those exhibits. Notes can be promoted into exhibit candidates through heuristic filtering.

Required: resolve explicit selections server-side; distinguish select-all from empty selection; show omitted/unavailable evidence; assemble only the approved source manifest. Relevance can suggest candidates, not override the user's inclusion decision.

### F04 — P0: covers and contents are separated; labels lack authoritative identity

Evidence: `src/lib/exports/renderers/renderExhibitPacketHTML.ts:50`, `:94`; `src/lib/exports/adaptDraftedToCanonicalExport.ts:295`.

The renderer outputs title, index, all covers, all text, then all visual content. A correctly ordered source array still becomes Cover A → Cover B → Content A → Content B. The adapter assigns content labels from drafting section IDs rather than linking each content section to a mapped exhibit entry.

Required: one ordered exhibit tree with stable exhibit IDs. Render Cover A → all A pages → Cover B → all B pages. Index, labels, covers, bookmarks, citations, and page ranges must derive from that tree.

### F05 — P0: Bates numbering is neither connected nor page-accurate

Evidence: `src/app/api/documents/export/stream/route.ts:1054`; `src/lib/exports/renderers/renderExhibitPacketHTML.ts:61`; `src/lib/exports/bates/applyBatesNumbering.ts`.

The route constructs packet settings without Bates configuration. Even when a caller supplies it directly, the renderer increments once per content/cover section and places a number inside normal HTML flow. Long text can span multiple physical pages with only one Bates element. The dedicated screen previews four digits while the shared formatter pads to five.

Required: count and map actual assembled pages, then stamp each eligible physical page. Configure prefix, start, padding, placement, and cover/front-matter inclusion. Validate nonnegative/integer bounds, uniqueness and continuity; preserve or reconcile pre-existing source stamps. Reserve ranges transactionally when numbering must remain unique across concurrent productions.

### F06 — P1: the index is not a navigable packet index

Evidence: `src/lib/exports/renderers/renderExhibitPacketHTML.ts:129` and canonical index construction in the adapter.

Only exhibit label and description are displayed. No physical page start/end, page count, Bates range, internal link, PDF bookmark, or final-destination reconciliation is implemented here.

Required: final-page-derived index with label, descriptive title, date/date range, page range, and optional Bates range/source columns. Long indexes need repeated headers, safe row breaks, and correct continuation pages. Generate clickable links and PDF outline entries from actual page destinations.

### F07 — P1: advertised options are not implemented end to end

Evidence: `src/components/export/ExhibitExportModal.tsx`, `src/lib/export-assembly/utils/exportRequestBuilder.ts`, `src/app/(app)/docuvault/context/ExportContext.tsx:864`, route `:1054`, and canonical adapter `:235`.

The rich modal offers six packet types, dividers, merged output, confidential notes, and Bates settings, but has no discovered consumer. The connected context uses fixed exhibit defaults. The route resets the packet title and organization metadata to generic values and does not carry Bates configuration. Grouping exists in the mapper but is not rendered. The adapter always adds an index when entries exist; packet-type behavior is not its input. The renderer always adds a title page.

Nuance: mapper sorting and labels can still reflect request settings; the route's fixed metadata does not prove all sorting/labels are ignored. The configuration contract is inconsistent across layers.

Required: a single validated settings schema used by UI, persistence, server plan, and renderer. Each setting must change the final artifact or be removed from the UI. Explicitly implement index-only, packet-only, packet-with-index, covers, binders, dividers, and separate/merged delivery. Distinguish a packet title sheet from individual exhibit covers.

### F08 — P1: draft editing and persistence are incomplete

Evidence: builder `:64`, `:68`, `:206`.

The dedicated queue/configuration is React state with no save/resume integration. Drag handles and a move cursor have no reorder handlers. Titles, source pages, and labels are not editable there. State does not reset or rebind on active-case change within a mounted builder; previously staged items can remain visible under the new case context. This is a UI state-contamination risk, not evidence of a server authorization bypass.

Required: persisted case-bound packet drafts; explicit revision/concurrency control; keyboard-accessible reordering; autosave/recovery; editable descriptions/dates; rename/duplicate; page selection; manual ordering; frozen issued labels and separately managed amendments. Case changes must switch drafts safely.

### F09 — P1: covers can disappear and content can be truncated

Evidence: mapper `:140`, `:262`, `:263`; builder `:91` and `:105`.

Mapper summaries are capped at 200 characters. Covers require summaries over 50 characters and are limited to the first 20 eligible entries. Turning summaries off can therefore remove covers even when cover sheets are on. Builder items retain only 120-character previews plus a source ID, so generation cannot safely use the staged preview as evidence content.

Required: one cover per requested exhibit independent of AI/summary availability; no silent caps. Keep preview text separate from complete source content. Show explicit truncation or conversion failures, never silently incomplete evidence.

### F10 — P1: validators check structure, not packet correctness

Evidence: `src/lib/export-assembly/validation/preflightValidator.ts:304`; `src/lib/exports/validateExportDocument.ts:350`; `src/lib/exports/assertRenderedExportStructure.ts:147`; `src/lib/pdf/validatePdf.ts`.

Preflight marks Bates as passing because the setting is enabled. Exhibit validation requires a content section, but does not reconcile each index entry with actual evidence pages. HTML validation accepts an exhibit container. PDF validation checks size/header and computes a hash; it does not parse all pages or validate their completeness. The no-content rule also needs mode awareness for legitimate index-only output.

Required: source accessibility, ownership, page availability, one-to-one manifest reconciliation, unique labels, accurate page/Bates ranges, valid destinations, image load verification, and a parseable final PDF. Make checks mode-specific. A checksum establishes a file's identity; it does not establish that its contents are correct.

### F11 — P1: no packet-specific confidentiality/redaction workflow

The inspected exhibit path does not implement page-region redaction, privileged-source exclusion, separate public/confidential variants, or a final content review for these transformations. A confidential-notes boolean exists without identified downstream enforcement. Logging/chat redaction elsewhere is unrelated to evidence-PDF redaction.

Required: access-controlled source classifications and deliberate inclusion rules; original preservation; separate reviewed derivatives; actual content removal from redacted pixels/text layers; verification that hidden text or annotations cannot reveal removed content. Mark versions clearly and retain a transformation history. Any filing-specific rules require separate current verification.

### F12 — P1: execution and versioning are not ready for large packets

Evidence: `convex/exportJobs.ts` explicitly describes admission control with inline SSE execution; `generateExhibitCoverDrafts.ts` processes covers sequentially.

Existing lifecycle, timeout, idempotency, and export sessions are valuable, but are not durable page-processing checkpoints or immutable packet releases. Long document conversions, many covers, and large merge operations need recoverable execution.

Required: background assembly worker; bounded parallel asset preparation; durable steps, cancellation, retries, quotas, temporary-file cleanup, and source-specific errors. Hash the approved manifest/settings/source versions for idempotency. Pin source versions and renderer/template versions so later changes cannot silently alter an issued packet.

### F13 — P2: professional presentation is only basic

Evidence: title/index/content renderers and their CSS.

The title sheet uses title, cause number, and county/state. It does not render a full packet-specific presentation model for parties, preparer, purpose, hearing date, revision, or confidentiality. Internal source descriptions can contain raw document/message IDs. Group dividers, exhibit-local page indicators, long-title handling, searchable scanned pages, accessible document structure, and branded/internal versus filing-oriented templates need a deliberate implementation and visual verification.

Required: restrained typography, consistent spacing, legible stamps, print-safe layouts, source orientation preservation, readable image scaling, clean metadata, and configurable templates. Do not claim general court compliance from a state-level formatting profile.

## 5. Required end-to-end product workflow

1. **Create packet:** case, purpose, title, audience, template, numbering policy; save a draft immediately.
2. **Choose evidence:** case file library/upload, original thumbnails, source dates, file/page counts, processing status; batch selection and duplicate warnings.
3. **Define exhibits:** one or several sources per exhibit, exact page ranges, stable IDs, editable description, optional witness/issues, and explicit missing-source resolution.
4. **Organize:** manual ordering or reviewed chronology/issue/witness/source grouping; accessible reorder; deliberate label assignment; dividers and tabs.
5. **Prepare pages:** retain originals, normalize images/documents, preserve orientation and searchable text where possible, apply reviewed redactions to derivatives.
6. **Configure packet:** title sheet, exhibit covers, summaries, index columns, page labels, Bates policy, templates, and delivery format.
7. **Review:** source-to-packet side-by-side preview, complete pages and page counts, disclosed AI descriptions, confidentiality checks, unresolved issues, approval of a particular revision.
8. **Generate:** freeze manifest, prepare assets, render front matter/covers, assemble evidence, resolve final pages, generate index, stamp numbers, add destinations/bookmarks, validate.
9. **Deliver:** preview/download the exact validated PDF; optional individual exhibits, index, volume set, or ZIP; clear artifact metadata and no silent missing items.
10. **Revise:** duplicate/amend a previous version, record changes, preserve issued artifacts, and explicitly choose whether labels/Bates continue or restart.

## 6. Target packet structure and numbering

Recommended default order:

```text
Packet title sheet
Exhibit index (one or more pages)
Optional group divider
  Exhibit A cover
  Exhibit A source pages in approved order
  Exhibit B cover
  Exhibit B source pages in approved order
Optional next group divider
  Exhibit C cover
  Exhibit C source pages in approved order
```

Maintain distinct fields for physical PDF page index, displayed packet page number, exhibit-local page number, original source page, and Bates identifier. These are related but not interchangeable. A cover or divider can occupy a physical page without consuming a Bates number, depending on policy.

The index must be derived from the final page map. For example, if Exhibit A's cover is physical page 4 and its three source pages occupy pages 5–7, store all those facts explicitly and define whether the displayed range includes the cover. Never assume one HTML section equals one PDF page.

Index pagination changes downstream destinations. Use measured front-matter rendering with a stable pagination pass (or a bounded convergence process), then recompute ranges and destinations before final verification.

## 7. Missing data contracts and code modules

Names below are proposed; they are not existing implementations.

| Proposed entity/module | Responsibility |
|---|---|
| `packetDrafts` | Case/owner, purpose, title, status, settings, revision, timestamps |
| `packetExhibits` | Stable exhibit ID, order, label, description, dates, grouping, reviewed cover text |
| `packetSources` | Original file/version/storage ID, selected pages, source hash, transformation instructions |
| `packetVersions` | Immutable approved manifest, source versions, generation/template version, artifacts and validation result |
| `packetPageMap` | Output page → exhibit → source page; page labels, Bates values, bookmark targets |
| `resolvePacketSources` | Server authorization, immutable source lookup, type/size/page validation |
| `buildPacketPlan` | Deterministic ordering, label assignment, inclusion policies and expected page inventory |
| `preparePacketAssets` | Original-page extraction, image/document conversion, OCR derivatives, redaction derivatives |
| `assemblePacketPdf` | Combine actual source PDF pages and rendered front matter/covers in approved order |
| `paginatePacket` | Resolve final ranges and index pagination without guessed offsets |
| `stampPacketPages` | Page labels, exhibit labels, Bates stamps with consistent positions |
| `addPacketNavigation` | Index links, exhibit/group bookmarks, optional return-to-index links |
| `validatePacketArtifact` | Parse PDF, reconcile every expected page, labels, ranges, links and source inventory |
| `packetGenerationWorker` | Durable progress, retries, cancellation, quotas, cleanup and artifact publication |

Extend the existing upload, storage, sessions, export-job, and artifact infrastructure where appropriate. Avoid creating a second unrelated evidence repository. Introduce PDF page composition/stamping capability explicitly; the currently inspected HTML renderer is not an original-PDF merge engine.

## 8. Delivery order and acceptance criteria

### Phase 1 — Make evidence assembly real

Implement persisted case-bound drafts, explicit evidence selection, source resolution, stable exhibit identities, actual page assembly, working generation/download, and interleaved covers/content. Preserve AI summaries as optional separate material.

**Acceptance:** select PDF pages 2–4 and two images; the artifact includes exactly those five source pages in the approved exhibit order, with optional covers, and no unrelated workspace notes. Refresh restores the draft. Switching cases cannot carry staged items into another case's packet. Inaccessible sources block finalization with actionable errors.

### Phase 2 — Make packets correctly indexed and numbered

Implement physical page maps, full setting propagation, actual Bates stamping, index page ranges, clickable links, bookmarks, group dividers, and label reconciliation.

**Acceptance:** a packet with a multi-page index and mixed-size sources has exact ranges; every index link/bookmark lands correctly; Bates numbers occur once per eligible page; no duplicates/gaps; all settings have asserted artifact-level effects. More than 20 exhibits receive requested covers.

### Phase 3 — Make review and output professionally dependable

Add final-PDF preview, side-by-side evidence review, edited descriptions, optional OCR, confidentiality/redaction derivatives, templates, immutable revisions, and downloadable source/index manifests.

**Acceptance:** reviewer previews the exact PDF later downloaded; changing any source/configuration invalidates previous approval; redacted content is absent from extracted text and rendered pixels; page stamps never cover evidence; titles and tables remain readable across long packets.

### Phase 4 — Scale and advanced delivery

Add durable workers, large-packet profiling, volume splitting, individual exhibit/ZIP output, production-range allocation, amendments and audit history.

**Acceptance:** interrupted jobs resume without duplicated exhibits or Bates allocation; concurrent generation cannot collide; volume indexes point to the correct volume/page; missing assets are never silently skipped. Set tested size/page/time limits based on representative fixtures rather than promising unlimited output.

## 9. Verification performed and missing test coverage

Executed `npm test -- src/lib/exports/__tests__ src/lib/export-assembly/__tests__` against the existing working tree: **32 test files and 354 tests passed**. Vitest reported a worker shutdown timeout for `exportPathMatrix.regression.test.ts`; the process subsequently exited with code 0. This warning should be investigated separately; it is not evidence of a failing exhibit assertion.

Existing renderer checks include HTML markers, labels, covers, and Bates text presence. They do not demonstrate final source fidelity, multi-page Bates correctness, or a full user journey.

Required additional verification:

- Dedicated builder → persisted draft → real job → validated PDF → preview/download.
- Explicit selection versus select-all and empty selection; excluded evidence; case switching and unauthorized source IDs.
- Mixed PDF/image/text sources; page subsets; rotated, landscape, scanned, long, encrypted, corrupt, and unavailable files.
- Cover A followed by all A pages; label/index/content identity; more than 26 labels and more than 20 covers.
- Physical-page counts and Bates uniqueness/continuity across overflow pages, front matter, covers, and volumes.
- Packet-only/index-only and every option's effect in actual output, including summaries disabled with covers enabled.
- Long indexes with final destinations; no clipped stamps, missing images, blank accidental pages, or unreadable scaling.
- Draft recovery, concurrent edits, source-version drift, idempotent retries, cancellation, failure cleanup and immutable issued artifacts.
- Redaction verification in both rendered pages and PDF text layers; confidentiality exclusions.

## 10. Decision

Retain the existing case data, review, rendering-template, and artifact infrastructure. Build a dedicated, deterministic packet assembly core around original evidence and a final page manifest. Connect the exhibit UI to that core and make every advertised control part of a tested contract.

The release gate should be: **the approved evidence is present, complete, correctly ordered, correctly labeled, accurately indexed and numbered, navigable, visually professional, and reproducible as a specific saved version.** A PDF that merely renders successfully does not meet that standard.
