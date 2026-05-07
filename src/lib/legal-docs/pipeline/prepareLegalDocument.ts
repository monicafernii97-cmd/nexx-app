/**
 * Unified Legal Document Pipeline
 *
 * Two entry points:
 *
 *   prepareLegalDocument()       — Full pipeline with integrity assertion.
 *                                  For paths that produce a final, renderable
 *                                  court document (Quick Generate, Chat).
 *
 *   parseLegalDocumentDraft()    — Parsing-only (no integrity assertion).
 *                                  For paths that need structural extraction
 *                                  but handle resolution, repair, and final
 *                                  validation downstream (Export fast path).
 *
 * Pipeline stages (both functions share the first 5):
 *   normalizeLegalInput()
 *   → classifyLegalDocument()
 *   → parseLegalDocumentStructure()
 *   → validateParsedStructure()
 *   → buildLegalDocument()
 *   → assertLegalDocumentIntegrity()    ← prepareLegalDocument only
 *   → return LegalDocument
 *
 * 🔒 RULE: No final PDF export without integrity validation.
 *    But no pasted draft should be rejected before the system has
 *    attempted resolution and repair.
 */

import type { LegalDocument, LegalDocumentInput } from '../types';
import { normalizeLegalInput } from './normalizeLegalInput';
import { classifyLegalDocument } from './classifyLegalDocument';
import { parseLegalDocumentStructure } from './parseLegalDocumentStructure';
import { validateParsedStructure } from './validateParsedStructure';
import { buildLegalDocument } from './buildLegalDocument';
import { assertLegalDocumentIntegrity } from './assertLegalDocumentIntegrity';

// ═══════════════════════════════════════════════════════════════
// Shared pipeline core (stages 1–5)
// ═══════════════════════════════════════════════════════════════

/** Run the shared pipeline stages: normalize → classify → parse → validate → build. */
function runPipelineCore(input: LegalDocumentInput): LegalDocument {
  // 1. Normalize input
  const normalized = normalizeLegalInput(input.text);

  // 2. Classify document type
  const classification = classifyLegalDocument(normalized.cleanedText);

  // 3. Parse structure (deterministic regex)
  const parsed = parseLegalDocumentStructure(normalized.cleanedText, {
    documentFamily: classification.documentFamily,
    jurisdictionHint: input.jurisdictionHint,
  });

  // 4. Validate parsed structure
  validateParsedStructure(parsed);

  // 5. Build LegalDocument from parsed structure + overrides
  return buildLegalDocument({
    parsed,
    metadata: {
      ...input.metadata,
      jurisdiction: input.metadata?.jurisdiction ?? classification.jurisdictionLikely.state,
      county: input.metadata?.county ?? classification.jurisdictionLikely.county,
      court: input.metadata?.court ?? classification.jurisdictionLikely.court,
      district: input.metadata?.district ?? classification.jurisdictionLikely.district,
      documentType: input.metadata?.documentType ?? classification.pleadingType,
    },
    captionOverride: input.caption,
    titleOverride: input.title,
    subtitleOverride: input.subtitle,
  });
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Prepare a legal document through the FULL unified pipeline
 * (including integrity assertion).
 *
 * Use this for paths that produce a final, renderable court document
 * where no downstream resolution or repair will occur.
 *
 * @throws {ParseValidationError} if structure parsing fails
 * @throws {LegalDocumentIntegrityError} if integrity checks fail
 */
export function prepareLegalDocument(input: LegalDocumentInput): LegalDocument {
  const legalDocument = runPipelineCore(input);

  // 6. Assert integrity (throws on failure — never warns)
  assertLegalDocumentIntegrity(legalDocument);

  return legalDocument;
}

/**
 * Parse a pasted draft into a structured LegalDocument WITHOUT
 * running final integrity assertions.
 *
 * Use this for the export fast path where the caller's own pipeline
 * handles court identity resolution, SAPCR child-name recovery,
 * caption construction, and final integrity validation downstream.
 *
 * The returned document is structurally parsed but may have an
 * incomplete caption (e.g. "IN THE INTEREST OF" without a resolved
 * child name). The export pipeline repairs this before final PDF
 * generation.
 *
 * @throws {ParseValidationError} if structure parsing fails
 */
export function parseLegalDocumentDraft(input: LegalDocumentInput): LegalDocument {
  return runPipelineCore(input);
}

/**
 * Re-export pipeline components for direct use when needed.
 */
export { normalizeLegalInput } from './normalizeLegalInput';
export { classifyLegalDocument } from './classifyLegalDocument';
export { parseLegalDocumentStructure } from './parseLegalDocumentStructure';
export { validateParsedStructure } from './validateParsedStructure';
export { buildLegalDocument } from './buildLegalDocument';
export { assertLegalDocumentIntegrity } from './assertLegalDocumentIntegrity';
