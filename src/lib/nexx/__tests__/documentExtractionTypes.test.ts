import { describe, expect, it } from 'vitest';
import { buildPageCoverageReceipt, type CanonicalExtractedPage } from '../documentExtractionTypes';

function page(pageNumber: number, status: CanonicalExtractedPage['status'] = 'succeeded'): CanonicalExtractedPage {
  return {
    pageNumber,
    sourcePageIndex: pageNumber - 1,
    canonicalText: status === 'verified_blank' ? '' : `Page ${pageNumber} text`,
    canonicalSource: 'native',
    status,
    warnings: [],
  };
}

describe('buildPageCoverageReceipt', () => {
  it('marks only contiguous, fully successful source-page accounting complete', () => {
    expect(buildPageCoverageReceipt([page(1), page(2), page(3)], 3)).toMatchObject({
      expectedUnits: 3,
      attemptedUnits: 3,
      succeededUnits: 3,
      omittedUnits: 0,
      status: 'complete',
    });
  });

  it('detects a missing middle page even when beginning and ending pages exist', () => {
    const receipt = buildPageCoverageReceipt([page(1), page(3)], 3);

    expect(receipt.status).toBe('partial');
    expect(receipt.omittedUnits).toBe(1);
    expect(receipt.warnings).toContain('NON_CONTIGUOUS_SOURCE_PAGE_COVERAGE');
  });

  it('keeps low-confidence and failed pages from being called complete', () => {
    expect(buildPageCoverageReceipt([page(1), page(2, 'low_confidence')], 2)).toMatchObject({
      lowConfidenceUnits: 1,
      status: 'partial',
    });
    expect(buildPageCoverageReceipt([page(1), page(2, 'failed')], 2)).toMatchObject({
      failedUnits: 1,
      status: 'partial',
    });
  });

  it('allows a visually verified blank page to remain fully accounted for', () => {
    expect(buildPageCoverageReceipt([page(1), page(2, 'verified_blank')], 2)).toMatchObject({
      verifiedBlankUnits: 1,
      status: 'complete',
    });
  });
});
