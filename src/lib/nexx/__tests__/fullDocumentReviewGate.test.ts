import { describe, expect, it } from 'vitest';
import { buildFileFallbackMessage } from '@/components/chat/ChatInput';
import { analysisModeForUploadIntent } from '@/lib/chat/documentAnalysisMode';
import { detectDocumentReference } from '../documentReferenceDetection';
import { buildCoverageGateMessage, requiresVerifiedCoverage } from '../fullDocumentReviewGate';

describe('full court-order review intent and coverage gate', () => {
  it('uses explicit full review intent without accidentally creating a deadline lookup', () => {
    const prompt = buildFileFallbackMessage('court_order', 'Signed Final Order.pdf');
    const detection = detectDocumentReference(prompt);

    expect(analysisModeForUploadIntent('court_order')).toBe('full_document_review');
    expect(detection.referencesDocument).toBe(true);
    expect(detection.referenceType).not.toBe('deadline_lookup');
  });

  it('blocks a full review until every attachment has verified complete coverage', () => {
    expect(requiresVerifiedCoverage('full_document_review', [{
      filename: 'order.pdf',
      status: 'ready',
      coverageStatus: 'unverified',
    }])).toBe(true);

    expect(requiresVerifiedCoverage('full_document_review', [{
      filename: 'order.pdf',
      status: 'ready',
      coverageStatus: 'complete',
      pagesProcessed: 62,
      pagesTotal: 62,
    }])).toBe(false);

    expect(requiresVerifiedCoverage('focused_question', [{
      filename: 'order.pdf',
      status: 'partial',
      coverageStatus: 'partial',
    }])).toBe(false);
  });

  it('produces a filename-specific and truthful gate receipt', () => {
    const message = buildCoverageGateMessage([{
      filename: 'Signed Final Order.pdf',
      status: 'partial',
      coverageStatus: 'partial',
      pagesProcessed: 8,
      pagesTotal: 62,
    }]);

    expect(message).toContain('Signed Final Order.pdf');
    expect(message).toContain('8 of 62 pages explicitly accounted for');
    expect(message).toContain('not presenting a full court-order analysis yet');
    expect(message).not.toMatch(/fully read|complete review is ready/i);
  });
});
