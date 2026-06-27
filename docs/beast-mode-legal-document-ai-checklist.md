# Beast Mode Legal Document AI Checklist

This checklist tracks the phased implementation of the legal-document evidence engine. Each phase should land as a focused PR, pass local validation, receive CodeRabbit review, resolve actionable PR comments, merge to `main`, and deploy before the next phase starts.

## Phase 1: Schema Foundation

- [x] Add staged document memory generation records.
- [x] Add extraction attempt records.
- [x] Add file access grant records.
- [x] Add page, block, table, chunk, and legal metadata evidence fields.
- [x] Add answer source, retrieval run, audit event, provider usage, and review flag tables.
- [x] Keep all new generation fields backward-compatible with existing uploaded files.
- [x] Add generation-aware indexes for file, case, user, and status lookup.

## Phase 2: Generation-Aware Processing

- [ ] Create generation creation and validation mutations.
- [ ] Write pages/chunks into hidden building generations.
- [ ] Activate a validated generation atomically.
- [ ] Keep the old active generation live if reprocessing fails.
- [ ] Add migration/backfill support for current documents.
- [ ] Add cleanup for retired generations.

## Phase 3: Mistral OCR 4 Adapter

- [ ] Add Mistral OCR 4 client behind feature flags.
- [ ] Use pinned OCR model configuration.
- [ ] Use stateless/base64 OCR for confidential documents.
- [ ] Capture include_blocks output.
- [ ] Capture table format, headers, footers, and confidence scores.
- [ ] Log provider usage and estimated cost.
- [ ] Enforce confidentiality and ZDR policy gates.

## Phase 4: Normalization and Legal-Aware Chunking

- [ ] Normalize native/OCR output into pages.
- [ ] Store blocks with type, text, bbox, confidence, and source.
- [ ] Store tables separately without flattening them blindly.
- [ ] Preserve section headings, paragraph numbers, page ranges, and block IDs in chunks.
- [ ] Add legal retrieval metadata flags.
- [ ] Down-rank headers and footers without deleting them.

## Phase 5: Hybrid Retrieval

- [ ] Use active memory generations only.
- [ ] Add full-text search and exact phrase search paths.
- [ ] Add vector search when embeddings are stored.
- [ ] Merge and rerank vector, keyword, exact, metadata, and page matches.
- [ ] Re-check authorization after retrieval.
- [ ] Log retrieval runs.

## Phase 6: Citation-Locked Answer Layer

- [ ] Add structured legal document answer schema.
- [ ] Build source packets with file, generation, page, block, and chunk IDs.
- [ ] Require citations for document-factual claims.
- [ ] Add deterministic citation verifier.
- [ ] Add repair flow for failed citation verification.
- [ ] Write chat answer sources for every cited answer.

## Phase 7: Secure Source UI and Routes

- [ ] Add authenticated source-file route.
- [ ] Never expose raw storage keys or permanent direct file URLs.
- [ ] Add citation source viewer with page/block highlighting.
- [ ] Show OCR confidence and warnings near citations.
- [ ] Add user-facing document status and generation details.

## Phase 8: Security, Audit, Cost, and Evals

- [ ] Add tenant/user access test suite.
- [ ] Add prompt-injection document tests.
- [ ] Add OCR regression fixtures.
- [ ] Add citation accuracy evals.
- [ ] Add audit and provider-cost dashboard hooks.
- [ ] Add admin controls for OCR limits and confidentiality policies.

## Completion Criteria

- [ ] Every shown document-factual claim has a verifiable citation.
- [ ] Every citation resolves to an authorized active-generation source.
- [ ] Failed reprocessing never destroys old working memory.
- [ ] Sensitive files avoid public URLs.
- [ ] Provider costs can be traced by file and generation.
- [ ] Cross-user and cross-case leakage tests pass.
