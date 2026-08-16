# Legal Document Ingestion and Grounded Chat Hardening Specification

Status: authoritative implementation specification
Owner: NEXXproof engineering
Scope: chat uploads, court-order analysis, durable document memory, retrieval, grounded answers, conversation recall, and source UX

## 1. Purpose

This specification defines the end state required for NEXXproof to truthfully say that an uploaded document was received, read, analyzed, retained for the conversation, and used as evidence in later answers.

The system must never equate a successful upload, a non-empty extraction, a vector-store indexing result, or a handful of retrieved chunks with a complete document read. Completeness is a measured property backed by a coverage manifest.

The first target is the **Analyze Court Order** action. The same ingestion contract must ultimately support every accepted document type.

## 2. Non-negotiable product guarantees

1. The initial court-order review is a coverage operation over the complete canonical document, not a similarity-search operation.
2. A document is described as fully read only when every expected source unit is accounted for and no blocking extraction failure remains.
3. Page citations refer to real source pages. Slide, sheet, email-part, and attachment citations refer to real source units of their respective containers.
4. Every document-factual legal claim resolves to authorized, versioned, canonical evidence.
5. The uploaded document remains active in the conversation until the user switches or clears it.
6. Follow-up answers incorporate the active document and the current conversation unless the user explicitly excludes either.
7. Partial extraction is visible to the user and constrains the answer. It is never silently upgraded to a complete read.
8. Long analyses resume from persisted work rather than restarting or returning a clipped fragment.
9. Duplicate uploads are deduplicated by content hash or represented as explicit versions; they do not create ambiguous indistinguishable memories.
10. The original binary remains immutable. All derived artifacts are versioned and reproducible from the original plus processor configuration.

## 3. Terminology

- **Source unit**: a real page, slide, sheet/range, email part, text file, or embedded attachment.
- **Canonical block**: a source-aligned structural unit such as a paragraph, heading, table, signature, image, list, or form field.
- **Coverage manifest**: the authoritative accounting of expected, attempted, successful, failed, low-confidence, and omitted source units and embedded assets.
- **Canonical document version**: an immutable extraction/normalization generation selected as the active representation of one uploaded binary.
- **Document understanding record (DUR)**: persisted, citation-backed synthesis of the entire canonical document.
- **Full document review**: exhaustive traversal and hierarchical synthesis of every eligible canonical block.
- **Focused question**: retrieval-based answer to a bounded question after ingestion is complete enough to support it.
- **Evidence packet**: an authorized canonical block/chunk plus immutable provenance used by the answer verifier and source UI.

## 4. Current-state defects that this specification closes

| ID | Defect | Required correction |
|---|---|---|
| D-01 | The canned upload prompt contains “deadlines” and is classified as `deadline_lookup`. | Persist an explicit `analysisMode: full_document_review`; routing must not infer the upload workflow from prompt text. |
| D-02 | Initial analysis can use at most a small set of retrieved chunks. | Use exhaustive canonical coverage for the initial review. Retrieval is reserved for focused questions. |
| D-03 | Full extracted text is stored but not traversed as a complete document. | Build and traverse versioned canonical pages/blocks; retain full text only as a derivative/debug artifact. |
| D-04 | Native PDF extraction is accepted after a document-level 80-character threshold. | Evaluate every page independently and OCR image-dominant/low-text pages. |
| D-05 | Image OCR stops after eight pages. | Process every page in bounded durable batches with resumable progress. |
| D-06 | Mistral page/block output is flattened before indexing. | Persist page, block, table, bbox, confidence, header, and footer structures directly. |
| D-07 | Synthetic 12,000-character pages are shown as real page citations. | Synthetic offsets may support legacy search only and must never be labeled as source pages. |
| D-08 | Hosted file-search results and local `SOURCE_ID` citations are disconnected. | Normalize every answer-visible result into the canonical evidence-packet format, or remove it from the legal answer path. |
| D-09 | Court-order upload intent does not populate legal metadata. | Propagate type/analysis intent and build a DUR for court orders. |
| D-10 | Active-document recall depends too heavily on current-message keywords. | Consult persisted active-document state for ordinary follow-ups. |
| D-11 | The UI hides file identity and extraction completeness. | Persist and render filename, document state, page accounting, OCR use, and warnings. |
| D-12 | Provider timeout/incomplete events have no continuation. | Persist section checkpoints and continue until the requested review is complete or explicitly partial. |
| D-13 | DOCX native extraction misses embedded scans and richer structures. | Parse OOXML relationships/structures and OCR embedded visual assets. |
| D-14 | Accepted types are narrower than the intended “any document” experience. | Add capability-gated adapters with type-specific canonical source units. |
| D-15 | Duplicate copies produce ambiguous document selection. | Deduplicate by tenant-scoped SHA-256 and expose explicit versions/aliases. |

## 5. End-to-end state machine

```text
selected
  -> security_scanning
  -> stored
  -> enumerating
  -> extracting_native
  -> extracting_visual
  -> normalizing
  -> validating_coverage
  -> indexing
  -> understanding
  -> ready

Any processing state may become:
  -> partial (non-blocking gaps, disclosed)
  -> needs_password (encrypted document)
  -> rejected (unsafe/unsupported)
  -> failed_retryable (provider/runtime interruption)
  -> failed_final (corrupt or no recoverable content)
```

`ready` means the active canonical generation passed integrity and coverage gates. `partial` means the usable evidence and exact gaps are known. Chat may answer a focused question from a partial document only if the answer's cited evidence is available and the coverage limitation is disclosed.

## 6. API and domain contracts

### 6.1 Analysis mode

```ts
type DocumentAnalysisMode =
  | 'full_document_review'
  | 'obligations_and_deadlines'
  | 'custody_and_possession'
  | 'compare_with_conversation'
  | 'focused_question';
```

The mode is persisted on the chat turn and, for the current-turn upload, on the attachment receipt. The server derives/validates it from the authenticated upload session and explicit user selection. Prompt classification may refine a focused question but may not override `full_document_review`.

### 6.2 Coverage manifest

One manifest is stored per document-memory generation. Unbounded child details live in separate records.

```ts
type DocumentCoverageManifest = {
  uploadedFileId: Id<'uploadedFiles'>;
  memoryGenerationId: Id<'documentMemoryGenerations'>;
  containerType: 'pdf' | 'docx' | 'image' | 'pptx' | 'xlsx' | 'csv' | 'html' | 'rtf' | 'odt' | 'email' | 'txt';
  expectedUnitCount: number;
  attemptedUnitCount: number;
  succeededUnitCount: number;
  nativeUnitCount: number;
  ocrUnitCount: number;
  lowConfidenceUnitCount: number;
  failedUnitCount: number;
  embeddedAssetExpectedCount: number;
  embeddedAssetProcessedCount: number;
  completionStatus: 'complete' | 'partial' | 'failed';
  coveragePercent: number;
  processorVersion: string;
  sourceSha256: string;
  canonicalTextSha256: string;
  validatedAt: number;
};
```

Validation invariants:

- `expectedUnitCount > 0` for paginated/structured containers.
- `attemptedUnitCount === expectedUnitCount` before `complete`.
- `succeededUnitCount === expectedUnitCount` before `complete`.
- Every source-unit ordinal is present exactly once.
- Every canonical block belongs to a source unit and active generation.
- Canonical offsets are monotonic and cover the complete normalized canonical text.
- Embedded asset accounting is complete or the manifest is `partial`.
- The active generation's source hash matches the immutable original.
- A complete document has no blocking extraction warning.

### 6.3 Canonical source unit

Each source unit stores identity, provenance, methods attempted, selected canonical content, confidence, warnings, and dimensions. PDF page number comes from the parser/OCR provider and is never inferred from character count.

### 6.4 Canonical block

Required fields:

- document/generation/source-unit IDs
- stable block ID and reading order
- type and optional semantic subtype
- actual page/slide/sheet/part identity
- bounding box and dimensions when visual
- native text, OCR text, and chosen canonical text
- selection reason
- confidence granularity and value
- extraction warnings
- table/cell/parent/heading relationships
- canonical start/end offsets
- canonical text SHA-256

### 6.5 Document understanding record

The DUR is versioned, generated only after coverage validation, and decomposed into child facts so it cannot exceed Convex document limits. Every fact has evidence packet IDs.

Court-order DUR categories:

- identity: court, jurisdiction, cause number, caption, parties, judge
- lifecycle: signed, entered, effective, amended, superseded dates
- definitions
- orders: actor, required/prohibited action, object, trigger, deadline, recurrence, exceptions, consequence
- custody and possession schedules
- holidays and specific-over-general overrides
- exchanges, transportation, travel, passports, and notice
- communication and access
- education, medical, therapy, extracurricular, and records
- financial support, reimbursements, insurance, fees, and interest
- injunctions, restrictions, and enforcement warnings
- modification, conflict, severability, and controlling-version clauses
- ambiguity, unreadable evidence, missing pages, and unresolved conflicts
- complete coverage summary and source references

## 7. Ingestion adapters

### 7.1 Shared security envelope

Before provider submission:

- sniff magic bytes and compare with MIME/extension
- enforce byte, decompressed-size, page/unit, and nesting limits
- detect encrypted/password-protected containers
- detect malformed cross-reference/object streams and archive bombs
- reject active macros or quarantine them from rendering/execution
- sanitize filenames and metadata
- tenant-scope the SHA-256 deduplication key
- store the immutable original before derived processing
- enforce provider confidentiality/data-residency policy
- record provider request ID, model/version, cost, and retention mode without logging document text

### 7.2 PDF

1. Enumerate all real pages.
2. Extract native text per page, not only document-wide.
3. Compute per-page signals: text density, image coverage, glyph quality, corruption, rotation, and language.
4. OCR pages that are empty, image-dominant, low-density, or low-quality; allow policy to OCR all legal pages for layout consistency.
5. Preserve native and OCR alternatives and deterministically select canonical content.
6. Persist actual provider page index, dimensions, blocks, tables, headers, footers, signatures, and confidence.
7. Validate page ordinals against the container page count.

### 7.3 DOCX

- parse paragraphs, headings, numbered lists, tables, headers, footers, footnotes/endnotes, comments, hyperlinks, and relationships
- surface tracked changes according to a declared policy (`final`, `original`, or `both`)
- enumerate and OCR embedded images/scans
- warn on macros, unsupported SmartArt, corrupted relationships, and omitted objects
- preserve section and table hierarchy rather than returning only Mammoth raw text

### 7.4 Images

- support PNG, JPEG, WebP, TIFF, and HEIC where the runtime supports decoding
- correct orientation, rotation, skew, contrast, and language hints
- preserve image dimensions, blocks, bbox, and confidence
- process multi-frame images as real source units

### 7.5 PPTX

- one source unit per slide
- extract title/body text, speaker notes, tables, chart data when accessible, and embedded-image OCR
- preserve slide ordering and hidden-slide warnings

### 7.6 XLSX/CSV

- one structured source unit per sheet or bounded sheet range
- preserve cells, formulas, cached values, merged ranges, tables, hidden rows/columns/sheets, and date/number formats
- answer from structured coordinates, not a flattened prose dump

### 7.7 HTML/RTF/ODT/email/text

- preserve headings, lists, tables, links, quoted email levels, headers, body alternatives, and attachment relationships
- ingest supported email attachments as linked child documents
- sanitize active HTML and never execute document-provided scripts or macros

## 8. Full-document understanding workflow

The initial review is a durable workflow:

1. Wait for coverage validation.
2. Partition all canonical blocks by real source unit and semantic section.
3. Map every partition into structured candidate facts with evidence IDs.
4. Verify each candidate quote against canonical block text.
5. Merge duplicate/overlapping facts while retaining all supporting evidence.
6. Resolve specific-over-general and later-amendment relationships without discarding either provision.
7. Reduce facts into the DUR and section summaries.
8. Run a coverage reconciliation proving every substantive block was visited.
9. Generate the user-facing review from the DUR, not directly from a similarity search.
10. Persist section checkpoints and final response metadata.

The response begins with an ingestion receipt, for example:

> I received and processed **Signed Final Order 2-25-22.pdf**. I read 62 of 62 pages. OCR was used on 11 pages. Two passages on pages 18 and 41 have low confidence and are flagged below.

If coverage is incomplete, the first sentence says what is missing and the answer avoids a complete-read claim.

## 9. Retrieval and conversation grounding

### 9.1 Focused retrieval

Focused questions use a hybrid candidate set:

- exact phrase/full-text search
- keyword/BM25-style search
- vector similarity
- document metadata and DUR facts
- section/page constraints
- adjacent blocks and table continuations
- conversation-aware query expansion

Results are reranked, authorization is rechecked after retrieval, and every result becomes a canonical evidence packet.

### 9.2 Active document

- Uploading a document makes it active for that conversation.
- The active document remains active until switch/clear.
- Ordinary anaphoric follow-ups consult active state even when the message lacks “order,” “document,” or “file.”
- Explicitly named documents override active state.
- Ambiguity is raised only when multiple materially different candidates remain after hash/version resolution.
- The conversation UI always shows the active document and offers switch/clear controls.

### 9.3 Conversation relationship

Unless excluded by the user, `compare_with_conversation` and ordinary follow-ups combine:

- recent committed turns
- durable conversation summary
- current case context
- active DUR facts
- newly retrieved evidence packets

Conversation statements are not document evidence. Prompts and answer schemas keep these provenance classes separate.

## 10. Citation and source contract

Every document-factual claim contains one or more canonical evidence IDs. Verification requires:

- active generation
- authorized user/case/conversation scope
- quoted text is an exact or normalized-exact substring of the cited canonical block
- real source-unit location
- claim type compatible with available evidence
- disclosed confidence/warning when below threshold

Hosted retrieval may remain only if results are returned to the application, matched to the canonical document version, normalized into evidence packets, and verified identically. Otherwise hosted file search is excluded from legal document answers.

The source UI uses a short-lived authenticated route and displays the original page/slide/sheet with the cited block highlighted. It never exposes permanent storage URLs or storage keys.

## 11. Streaming and resumability

- Full reviews are sectioned jobs, not one provider call.
- Each map/reduce section has an idempotency key, input hash, status, attempt count, and persisted output.
- The final response has an explicit output budget and a continuation cursor.
- `response.incomplete`, provider timeout, and worker interruption schedule continuation from the last committed checkpoint.
- Raw structured JSON is never rendered as an assistant answer.
- A partial user-visible draft is labeled as processing and is replaced only by a verified final or explicitly partial result.

## 12. UX requirements

### 12.1 Composer

Selecting **Analyze Court Order** opens a file-first flow. After upload, show:

- filename, size, detected type, and duplicate/version status
- processing state
- real source-unit count
- OCR count and low-confidence count
- exact failure or partial warning

Then offer:

- Full order summary
- Obligations and deadlines
- Custody/possession schedule
- Compare with current conversation
- Ask a specific question

The initial action defaults to Full order summary but does not hide the mode from the persisted turn.

### 12.2 Message receipt

The persisted user message renders an attachment receipt with filename, final processing state, analysis mode, page/unit accounting, OCR use, and warnings. The assistant receipt repeats the critical coverage facts.

### 12.3 Source and warning UI

- real location label
- section heading
- verified excerpt
- confidence indicator using plain language
- clickable authorized preview
- incomplete-document banner whenever coverage is not complete
- reprocess action for retryable extraction gaps

The UI may not display “fully read,” “complete,” or equivalent unless the stored manifest is complete.

## 13. Observability, privacy, and operations

Record without document content:

- state transitions and durations
- processor/model versions
- page/unit accounting
- confidence distribution
- provider request IDs, tokens/pages, and estimated cost
- retry/timeout/incomplete reason
- retrieval candidate counts and methods
- citation verification outcomes
- active-document selection reasons
- deployment version used for ingestion and answer generation

Alerts:

- complete status with less than 100% accounting
- citations pointing to inactive generations
- answers with document claims and no verified evidence
- OCR/provider error-rate spikes
- duplicate ambiguity rate
- full-review workflow timeout/retry exhaustion

Confidentiality requirements:

- no document text in logs or analytics
- no public provider URL for confidential documents
- explicit retention/deletion propagation for provider files/vector stores
- tenant/case authorization at upload, retrieval, source preview, and deletion
- prompt-injection defenses treat all document content as untrusted evidence

## 14. Delivery phases and PR gates

Each phase lands as a focused ready-for-review PR, receives CI and CodeRabbit review, resolves all current actionable critical/major comments in a batched update, merges to the default branch, deploys, and passes its production smoke gate before the next phase.

### Phase A — P0 intent and truthfulness

- explicit `full_document_review` mode end to end
- no deadline-lookup override for the initial upload
- persisted filename/processing receipt
- full-review prompt behavior separated from focused retrieval
- tests proving the automatic court-order action cannot take the deadline route

### Phase B — Coverage and real-page canonical PDF pipeline

- coverage manifest and child issue records
- per-page native/visual extraction
- no eight-page ceiling
- preserved Mistral pages/blocks/tables/confidence
- real-page chunking and citations
- coverage-gated ready/partial state

### Phase C — Durable court-order understanding

- map/reduce workflow over every canonical block
- DUR facts and citations
- coverage reconciliation
- full-order response generated from DUR
- explicit receipt and limitations

### Phase D — Unified retrieval, sticky memory, and citations

- hybrid canonical retrieval and neighbors
- active-document follow-ups
- hosted retrieval normalization or removal
- authenticated source preview
- duplicate/version resolution

### Phase E — Universal format adapters and security

- DOCX rich structures and embedded-image OCR
- image, PPTX, XLSX/CSV, HTML/RTF/ODT/email adapters
- magic-byte/container security and resource limits
- adapter-specific manifests and citations

### Phase F — Resumability, UX, and operations

- checkpointed generation continuation
- file-first analysis choices
- progress/coverage/source UX
- audit, cost, privacy, and operational alerts

### Phase G — Production acceptance

- complete regression corpus
- cross-tenant/case authorization tests
- production deployment
- live selectable/scanned/mixed court-order tests
- requirement-by-requirement completion audit

## 15. Acceptance matrix

| Requirement | Automated evidence | Production evidence |
|---|---|---|
| Selectable PDF page accounting | Fixture asserts expected/attempted/succeeded and real page IDs | UI receipt matches test upload page count |
| Scanned PDF page accounting | All pages OCRed; no fixed ceiling | Upload >8-page scan and verify all pages |
| Mixed PDF | Native and OCR method distribution asserted by page | Clauses on image-only pages are cited |
| Correct page citations | Planted clause resolves to source page and bbox | Source preview opens matching page/highlight |
| Full-summary coverage | Beginning/middle/end planted facts exist in DUR and answer | Live review includes all planted provisions |
| DOCX images/tables | Embedded image OCR and table relations asserted | Receipt accounts for embedded assets |
| >60k characters | DUR coverage remains 100%; no middle omission | Live summary cites middle-document clause |
| Sticky active order | “What next?” and “How does that affect the call issue?” select active file | Follow-up works without re-upload |
| Duplicate handling | Same hash dedupes or versions deterministically | UI does not show indistinguishable choices |
| Interrupted generation | Injected timeout resumes from checkpoint | Forced retry completes without duplicate sections |
| Truthful UI | Incomplete manifest forbids complete-read language | Missing-page fixture shows visible warning |
| Citation lock | Unsupported document claim is rejected/rewritten | Every displayed claim opens verified evidence |
| Authorization | Cross-user/case source/retrieval tests deny access | Signed source route rejects wrong account |
| Prompt injection | Malicious document instructions remain inert | Answer treats injected text only as quoted evidence |

## 16. Definition of done

The program is complete only when every acceptance row has authoritative passing evidence, all staged PRs are merged, the production deployment contains the merged commits, and live behavior demonstrates a complete court-order read with real citations and durable follow-up recall. A passing unit-test subset, a successful upload, or an apparently good sample answer is not sufficient by itself.
