import { describe, expect, it } from 'vitest';
import type { DocumentReferenceDetection } from '../documentReferenceDetection';
import {
  documentEvidenceBudgetForTurn,
  fallbackDocumentContextForPrompt,
  takeEvidenceWithinBudget,
} from '../documentEvidenceBudget';

function detection(
  overrides: Partial<DocumentReferenceDetection> = {},
): DocumentReferenceDetection {
  return {
    referencesDocument: true,
    confidence: 'high',
    referenceType: 'explicit_prior_upload',
    documentHints: [],
    requestedTerms: [],
    requestedSections: [],
    requestedDates: [],
    requestedDocumentTypes: [],
    requiresExactText: false,
    requiresPageOrSectionCitation: false,
    mayNeedClarification: false,
    ...overrides,
  };
}

describe('document evidence budgets', () => {
  it('loads no interactive chunks or fallback text for a durable full review', () => {
    const budget = documentEvidenceBudgetForTurn({
      analysisMode: 'full_document_review',
      detection: detection({ requiresExactText: true }),
    });
    expect(budget).toEqual({
      maxChunksPerFile: 0,
      maxChunkCharactersPerFile: 0,
      maxFallbackContextCharactersPerFile: 0,
    });
  });

  it('uses a small ordinary budget and a larger targeted budget', () => {
    const ordinary = documentEvidenceBudgetForTurn({ detection: detection() });
    const targeted = documentEvidenceBudgetForTurn({
      detection: detection({ requiresPageOrSectionCitation: true }),
    });
    expect(ordinary.maxChunksPerFile).toBe(6);
    expect(targeted.maxChunksPerFile).toBe(12);
    expect(targeted.maxChunkCharactersPerFile).toBeGreaterThan(ordinary.maxChunkCharactersPerFile);
  });

  it('stops chunk selection at both count and character limits', () => {
    const chunks = [{ text: 'a'.repeat(7) }, { text: 'b'.repeat(7) }, { text: 'c' }];
    expect(takeEvidenceWithinBudget(chunks, {
      maxChunksPerFile: 3,
      maxChunkCharactersPerFile: 10,
    })).toEqual([chunks[0]]);
    expect(takeEvidenceWithinBudget(chunks, {
      maxChunksPerFile: 2,
      maxChunkCharactersPerFile: 100,
    })).toEqual(chunks.slice(0, 2));
  });

  it('never double-loads fallback full text beside retrieved chunks', () => {
    expect(fallbackDocumentContextForPrompt({
      retrievedChunkCount: 1,
      text: 'full document text',
      maxCharacters: 100,
    })).toBe('');
    expect(fallbackDocumentContextForPrompt({
      analysisMode: 'full_document_review',
      retrievedChunkCount: 0,
      text: 'full document text',
      maxCharacters: 100,
    })).toBe('');
    expect(fallbackDocumentContextForPrompt({
      retrievedChunkCount: 0,
      text: 'x'.repeat(200),
      maxCharacters: 20,
    })).toHaveLength(20);
  });
});
