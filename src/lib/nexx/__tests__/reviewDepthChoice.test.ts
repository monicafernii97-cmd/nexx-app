import { describe, expect, it } from 'vitest';
import { reviewDepthChoiceMessage, shouldOfferReviewDepthChoices } from '../reviewDepthChoice';

describe('review depth choice', () => {
  it('answers an explicit attached-file choice request deterministically', () => {
    expect(shouldOfferReviewDepthChoices({
      message: 'Analyze this file. If more than one review depth is possible, offer the choices.',
      hasCurrentAttachment: true,
    })).toBe(true);
    expect(reviewDepthChoiceMessage()).toContain('focused review');
    expect(reviewDepthChoiceMessage()).toContain('full-document review');
  });

  it('does not surface choices without a current attachment or during an explicit full review', () => {
    expect(shouldOfferReviewDepthChoices({
      message: 'What options do I have?',
      hasCurrentAttachment: false,
    })).toBe(false);
    expect(shouldOfferReviewDepthChoices({
      message: 'Analyze the order and offer choices.',
      analysisMode: 'full_document_review',
      hasCurrentAttachment: true,
    })).toBe(false);
  });
});
