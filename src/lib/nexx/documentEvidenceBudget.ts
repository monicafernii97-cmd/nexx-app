import type { DocumentAnalysisMode } from '../chat/documentAnalysisMode';
import type { DocumentReferenceDetection } from './documentReferenceDetection';

export type DocumentEvidenceBudget = {
  maxChunksPerFile: number;
  maxChunkCharactersPerFile: number;
  maxFallbackContextCharactersPerFile: number;
};

const DURABLE_REVIEW_BUDGET: DocumentEvidenceBudget = {
  maxChunksPerFile: 0,
  maxChunkCharactersPerFile: 0,
  maxFallbackContextCharactersPerFile: 0,
};

const TARGETED_EVIDENCE_BUDGET: DocumentEvidenceBudget = {
  maxChunksPerFile: 12,
  maxChunkCharactersPerFile: 32_000,
  maxFallbackContextCharactersPerFile: 20_000,
};

const COMPARISON_EVIDENCE_BUDGET: DocumentEvidenceBudget = {
  maxChunksPerFile: 8,
  maxChunkCharactersPerFile: 24_000,
  maxFallbackContextCharactersPerFile: 16_000,
};

const ORDINARY_EVIDENCE_BUDGET: DocumentEvidenceBudget = {
  maxChunksPerFile: 6,
  maxChunkCharactersPerFile: 18_000,
  maxFallbackContextCharactersPerFile: 12_000,
};

/**
 * Bound interactive evidence by the user's current request. Exhaustive reviews are
 * rendered from the separately verified durable-review record and therefore must
 * never load bulk document text into the ordinary generation prompt.
 */
export function documentEvidenceBudgetForTurn(args: {
  analysisMode?: DocumentAnalysisMode;
  detection: DocumentReferenceDetection;
}): DocumentEvidenceBudget {
  if (args.analysisMode === 'full_document_review') return DURABLE_REVIEW_BUDGET;

  if (
    args.detection.requiresExactText ||
    args.detection.requiresPageOrSectionCitation ||
    args.detection.referenceType === 'deadline_lookup' ||
    args.detection.referenceType === 'section_lookup' ||
    args.detection.referenceType === 'source_location_request' ||
    args.detection.referenceType === 'possession_schedule_interpretation' ||
    args.detection.referenceType === 'clause_conflict_interpretation'
  ) {
    return TARGETED_EVIDENCE_BUDGET;
  }

  if (
    args.analysisMode === 'compare_with_conversation' ||
    args.detection.referenceType === 'comparison_request'
  ) {
    return COMPARISON_EVIDENCE_BUDGET;
  }

  return ORDINARY_EVIDENCE_BUDGET;
}

export function takeEvidenceWithinBudget<T extends { text: string }>(
  values: T[],
  budget: Pick<DocumentEvidenceBudget, 'maxChunksPerFile' | 'maxChunkCharactersPerFile'>,
) {
  if (budget.maxChunksPerFile <= 0 || budget.maxChunkCharactersPerFile <= 0) return [];

  const selected: T[] = [];
  let usedCharacters = 0;
  for (const value of values) {
    if (selected.length >= budget.maxChunksPerFile) break;
    const textLength = value.text.trim().length;
    if (selected.length > 0 && usedCharacters + textLength > budget.maxChunkCharactersPerFile) break;
    selected.push(value);
    usedCharacters += textLength;
  }
  return selected;
}

export function fallbackDocumentContextForPrompt(args: {
  analysisMode?: DocumentAnalysisMode;
  retrievedChunkCount: number;
  text?: string;
  maxCharacters: number;
}) {
  if (
    args.analysisMode === 'full_document_review' ||
    args.retrievedChunkCount > 0 ||
    !args.text?.trim() ||
    args.maxCharacters <= 0
  ) {
    return '';
  }
  return args.text.trim().slice(0, args.maxCharacters);
}
