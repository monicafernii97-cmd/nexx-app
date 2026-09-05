import { describe, expect, it } from 'vitest';
import { verifyCompleteSourceCoverage } from '../sourceCoverageVerification';

function manifest(expectedUnits = 3) {
  return {
    status: 'complete' as const,
    expectedUnits,
    succeededUnits: expectedUnits,
    lowConfidenceUnits: 0,
    verifiedBlankUnits: 0,
    failedUnits: 0,
    omittedUnits: 0,
  };
}

describe('complete source coverage verification', () => {
  it('accepts one readable row for every zero-based source unit', () => {
    expect(verifyCompleteSourceCoverage({
      manifest: manifest(),
      units: [0, 1, 2].map((unitIndex) => ({ unitIndex, status: 'succeeded' as const })),
    })).toMatchObject({ passed: true, unitsRead: 3, unitsExpected: 3 });
  });

  it('rejects duplicate, missing, failed, and omitted unit coverage', () => {
    expect(verifyCompleteSourceCoverage({
      manifest: manifest(),
      units: [
        { unitIndex: 0, status: 'succeeded' },
        { unitIndex: 0, status: 'succeeded' },
        { unitIndex: 2, status: 'failed' },
      ],
    })).toMatchObject({
      passed: false,
      errors: expect.arrayContaining(['coverage_unit_indexes_not_contiguous', 'coverage_has_unread_unit_rows']),
    });
  });

  it('rejects a complete label whose aggregate counts do not prove full coverage', () => {
    expect(verifyCompleteSourceCoverage({
      manifest: { ...manifest(), succeededUnits: 2, omittedUnits: 1 },
      units: [
        { unitIndex: 0, status: 'succeeded' },
        { unitIndex: 1, status: 'succeeded' },
        { unitIndex: 2, status: 'omitted' },
      ],
    })).toMatchObject({
      passed: false,
      errors: expect.arrayContaining(['coverage_contains_omitted_units', 'coverage_counts_do_not_match_expected_units']),
    });
  });
});
