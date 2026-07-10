export type LocalLegalResourceLookup = {
  jurisdiction: {
    state: string | null;
    county: string | null;
    courtName: string | null;
  };
  feeSources: Array<{
    sourceId: string;
    title: string;
    sourceType: 'official_court' | 'district_clerk' | 'efiling' | 'legal_aid' | 'bar_referral' | 'law_library' | 'other';
    summary: string;
    url: string | null;
    retrievedAt: string;
  }>;
  resources: Array<{
    name: string;
    type:
      | 'legal_aid'
      | 'lawyer_referral'
      | 'limited_scope'
      | 'district_clerk'
      | 'official_fee_schedule'
      | 'bar_referral'
      | 'court_forms'
      | 'fee_waiver'
      | 'law_library'
      | 'self_help'
      | 'efiling';
    summary: string;
    url: string | null;
    retrievedAt: string;
  }>;
  exactFeeFindings: Array<{
    feeType: string;
    amount: string;
    sourceId: string;
    sourceTitle: string;
    retrievedAt: string;
  }>;
  warnings: string[];
};

const OFFICIAL_FEE_SOURCE_TYPES = new Set<LocalLegalResourceLookup['feeSources'][number]['sourceType']>([
  'official_court',
  'district_clerk',
  'efiling',
]);

export function emptyLocalLegalResourceLookup(
  jurisdiction: LocalLegalResourceLookup['jurisdiction']
): LocalLegalResourceLookup {
  return {
    jurisdiction,
    feeSources: [],
    resources: [],
    exactFeeFindings: [],
    warnings: [
      'Exact local fees should be shown only after checking an official court, district clerk, or e-filing source.',
    ],
  };
}

export function canDisplayExactFeeFinding(
  lookup: LocalLegalResourceLookup,
  finding: LocalLegalResourceLookup['exactFeeFindings'][number]
) {
  return lookup.feeSources.some((source) =>
    source.sourceId === finding.sourceId &&
    OFFICIAL_FEE_SOURCE_TYPES.has(source.sourceType)
  );
}
