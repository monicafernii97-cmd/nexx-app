import { describe, expect, it } from 'vitest';
import { reviewDepthChoiceMessage, shouldOfferReviewDepthChoices } from '../reviewDepthChoice';

describe('review depth choice', () => {
  it('answers an explicit attached-file choice request deterministically', () => {
    expect(shouldOfferReviewDepthChoices({
      message: 'Analyze this file. If more than one review depth is possible, offer the choices.',
      hasAvailableDocument: true,
    })).toBe(true);
    expect(reviewDepthChoiceMessage()).toContain('focused review');
    expect(reviewDepthChoiceMessage()).toContain('full-document review');
  });

  it('does not surface choices without a current attachment or during an explicit full review', () => {
    expect(shouldOfferReviewDepthChoices({
      message: 'What options do I have?',
      hasAvailableDocument: false,
    })).toBe(false);
    expect(shouldOfferReviewDepthChoices({
      message: 'Analyze the order and offer choices.',
      analysisMode: 'full_document_review',
      hasAvailableDocument: true,
    })).toBe(false);
  });

  it('offers the same deterministic choice for an already-stored active document', () => {
    expect(shouldOfferReviewDepthChoices({
      message: 'Analyze the signed order and offer the review choices.',
      hasAvailableDocument: true,
    })).toBe(true);
  });
});
