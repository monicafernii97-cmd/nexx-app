export type DocumentCanonicalSource = 'native' | 'ocr' | 'hybrid';

export type DocumentSourceUnitStatus =
  | 'succeeded'
  | 'low_confidence'
  | 'verified_blank'
  | 'failed'
  | 'omitted';

/**
 * A source-aligned PDF page. Page numbers are one-based for citations while
 * sourcePageIndex remains zero-based for parser/provider round trips.
 */
export type CanonicalExtractedPage = {
  pageNumber: number;
  sourcePageIndex: number;
  nativeText?: string;
  ocrMarkdown?: string;
  canonicalText: string;
  canonicalSource: DocumentCanonicalSource;
  status: DocumentSourceUnitStatus;
  confidence?: {
    average?: number;
    minimum?: number;
  };
  dimensions?: {
    width: number;
    height: number;
    dpi?: number;
  };
  warnings: string[];
};

export type DocumentCoverageReceipt = {
  unitKind: 'page' | 'text';
  expectedUnits: number;
  attemptedUnits: number;
  succeededUnits: number;
  lowConfidenceUnits: number;
  verifiedBlankUnits: number;
  failedUnits: number;
  omittedUnits: number;
  status: 'complete' | 'partial' | 'failed' | 'unverified';
  warnings: string[];
};

export type CanonicalExtractedTextUnit = {
  unitIndex: number;
  unitLabel: string;
  text: string;
  status: DocumentSourceUnitStatus;
  nativeTextChars: number;
  canonicalTextChars: number;
  ocrApplied: boolean;
  warnings: string[];
};

export function buildTextCoverageReceipt(units: CanonicalExtractedTextUnit[]): DocumentCoverageReceipt {
  const succeededUnits = units.filter((unit) => unit.status === 'succeeded').length;
  const lowConfidenceUnits = units.filter((unit) => unit.status === 'low_confidence').length;
  const verifiedBlankUnits = units.filter((unit) => unit.status === 'verified_blank').length;
  const failedUnits = units.filter((unit) => unit.status === 'failed').length;
  const omittedUnits = units.filter((unit) => unit.status === 'omitted').length;
  const complete = units.length > 0 && failedUnits === 0 && lowConfidenceUnits === 0 && omittedUnits === 0;
  return {
    unitKind: 'text', expectedUnits: units.length, attemptedUnits: units.length,
    succeededUnits, lowConfidenceUnits, verifiedBlankUnits, failedUnits, omittedUnits,
    status: complete ? 'complete' : units.length > 0 ? 'partial' : 'failed',
    warnings: Array.from(new Set(units.flatMap((unit) => unit.warnings))),
  };
}

export function buildPageCoverageReceipt(
  pages: CanonicalExtractedPage[] | undefined,
  pagesTotal: number | undefined,
): DocumentCoverageReceipt {
  const expectedUnits = pagesTotal ?? pages?.length ?? 0;
  if (!pages || expectedUnits <= 0) {
    return {
      unitKind: 'page',
      expectedUnits,
      attemptedUnits: 0,
      succeededUnits: 0,
      lowConfidenceUnits: 0,
      verifiedBlankUnits: 0,
      failedUnits: 0,
      omittedUnits: expectedUnits,
      status: 'unverified',
      warnings: ['SOURCE_PAGE_COVERAGE_UNAVAILABLE'],
    };
  }

  const pageNumbers = new Set(pages.map((page) => page.pageNumber));
  const hasContiguousCoverage = pageNumbers.size === expectedUnits &&
    Array.from({ length: expectedUnits }, (_, index) => index + 1).every((pageNumber) => pageNumbers.has(pageNumber));
  const succeededUnits = pages.filter((page) => page.status === 'succeeded').length;
  const lowConfidenceUnits = pages.filter((page) => page.status === 'low_confidence').length;
  const verifiedBlankUnits = pages.filter((page) => page.status === 'verified_blank').length;
  const failedUnits = pages.filter((page) => page.status === 'failed').length;
  const explicitOmittedUnits = pages.filter((page) => page.status === 'omitted').length;
  const missingUnits = Math.max(0, expectedUnits - pageNumbers.size);
  const omittedUnits = explicitOmittedUnits + missingUnits;
  const complete = hasContiguousCoverage && failedUnits === 0 && lowConfidenceUnits === 0 && omittedUnits === 0;
  const warnings = Array.from(new Set([
    ...pages.flatMap((page) => page.warnings),
    ...(!hasContiguousCoverage ? ['NON_CONTIGUOUS_SOURCE_PAGE_COVERAGE'] : []),
  ]));

  return {
    unitKind: 'page',
    expectedUnits,
    attemptedUnits: pages.length,
    succeededUnits,
    lowConfidenceUnits,
    verifiedBlankUnits,
    failedUnits,
    omittedUnits,
    status: complete ? 'complete' : pages.length > 0 ? 'partial' : 'failed',
    warnings,
  };
}
