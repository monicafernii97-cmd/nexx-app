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

- [x] Create generation creation and validation mutations.
- [x] Write pages/chunks into hidden building generations.
- [x] Activate a validated generation atomically.
- [x] Keep the old active generation live if reprocessing fails.
- [x] Add migration/backfill support for current documents.
- [x] Add cleanup for retired generations.

## Phase 3: Mistral OCR 4 Adapter

- [x] Add Mistral OCR 4 client behind feature flags.
- [x] Use pinned OCR model configuration.
- [x] Use stateless/base64 OCR for confidential documents.
- [x] Capture include_blocks output.
- [x] Capture table format, headers, footers, and confidence scores.
- [x] Log provider usage and estimated cost.
- [x] Enforce confidentiality and ZDR policy gates (sensitive orders fail closed when no approved OCR route is available).

## Phase 4: Normalization and Legal-Aware Chunking

- [x] Normalize native/OCR output into pages.
- [x] Store blocks with type, text, bbox, confidence, and source.
- [x] Store tables separately without flattening them blindly.
- [x] Preserve section headings, paragraph numbers, page ranges, and block IDs in chunks.
- [x] Add legal retrieval metadata flags.
- [x] Down-rank headers and footers without deleting them.

## Phase 5: Hybrid Retrieval

- [x] Use active memory generations only.
- [x] Add full-text search and exact phrase search paths.
- [x] Add vector search when embeddings are stored.
- [x] Merge and rerank vector, keyword, exact, metadata, and page matches.
- [x] Re-check authorization after retrieval.
- [x] Log retrieval runs.

## Phase 6: Citation-Locked Answer Layer

- [x] Add structured legal document answer schema.
- [x] Build source packets with file, generation, page, block, and chunk IDs.
- [x] Require citations for document-factual claims.
- [x] Add deterministic citation verifier.
- [x] Add repair flow for failed citation verification.
- [x] Write chat answer sources for every cited answer.

## Phase 7: Secure Source UI and Routes

- [x] Add authenticated source-file route.
- [x] Never expose raw storage keys or permanent direct file URLs.
- [x] Add citation source viewer with page/quote highlighting.
- [x] Show OCR confidence and warnings near citations.
- [x] Add user-facing document status and generation details.

## Phase 8: Security, Audit, Cost, and Evals

- [x] Add tenant/user access test suite.
- [x] Add prompt-injection document tests.
- [x] Add OCR regression fixtures.
- [x] Add citation accuracy evals.
- [x] Add audit and provider-cost dashboard hooks.
- [x] Add deployment-admin controls for OCR limits and confidentiality policies.

## Completion Criteria

- [x] Every shown document-factual claim has a verifiable citation or the answer fails closed.
- [x] Every citation resolves to an authorized active-generation source.
- [x] Failed reprocessing never destroys old working memory.
- [x] Sensitive files avoid public URLs.
- [x] Provider costs can be traced by file and generation.
- [x] Cross-user and cross-case leakage tests pass.
