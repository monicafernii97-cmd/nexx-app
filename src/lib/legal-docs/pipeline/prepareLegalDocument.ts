/**
 * Unified Legal Document Pipeline
 *
 * THE SINGLE ENTRY POINT for all court/legal document processing.
 * Every entry point (DocuVault, Chat, ReviewHub, Export) calls this.
 * No exceptions. No alternate paths. No fast paths.
 *
 * Pipeline:
 *   normalizeLegalInput()
 *   → classifyLegalDocument()
 *   → parseLegalDocumentStructure()
 *   → validateParsedStructure()
 *   → buildLegalDocument()
 *   → assertLegalDocumentIntegrity()
 *   → return LegalDocument
 *
 * 🔒 RULE: Court documents may NOT bypass this pipeline.
 */

import type { LegalDocument, LegalDocumentInput } from '../types';
import { normalizeLegalInput } from './normalizeLegalInput';
import { classifyLegalDocument } from './classifyLegalDocument';
import { parseLegalDocumentStructure } from './parseLegalDocumentStructure';
import { validateParsedStructure } from './validateParsedStructure';
import { buildLegalDocument } from './buildLegalDocument';
import { assertLegalDocumentIntegrity } from './assertLegalDocumentIntegrity';

/**
 * Prepare a legal document from raw input through the full unified pipeline.
 *
 * Returns a validated, structured LegalDocument ready for ReviewHub
 * and ultimately for renderLegalDocumentHTML().
 *
 * @throws {ParseValidationError} if structure parsing fails
 * @throws {LegalDocumentIntegrityError} if integrity checks fail
 */
export function prepareLegalDocument(input: LegalDocumentInput): LegalDocument {
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
  const legalDocument = buildLegalDocument({
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

  // 6. Assert integrity (throws on failure — never warns)
  assertLegalDocumentIntegrity(legalDocument);

  return legalDocument;
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
