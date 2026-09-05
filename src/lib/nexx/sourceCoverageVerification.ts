export type SourceCoverageUnit = {
  unitIndex: number;
  status: 'succeeded' | 'low_confidence' | 'verified_blank' | 'failed' | 'omitted';
};

export type SourceCoverageManifest = {
  status: 'complete' | 'partial' | 'failed' | 'unverified';
  expectedUnits: number;
  succeededUnits: number;
  lowConfidenceUnits: number;
  verifiedBlankUnits: number;
  failedUnits: number;
  omittedUnits: number;
};

export function verifyCompleteSourceCoverage(args: {
  manifest: SourceCoverageManifest;
  units: SourceCoverageUnit[];
}) {
  const errors: string[] = [];
  const expectedIndexes = Array.from({ length: args.manifest.expectedUnits }, (_, index) => index);
  const actualIndexes = args.units.map((unit) => unit.unitIndex).sort((a, b) => a - b);
  const countedReadableUnits =
    args.manifest.succeededUnits +
    args.manifest.lowConfidenceUnits +
    args.manifest.verifiedBlankUnits;

  if (args.manifest.status !== 'complete') errors.push('coverage_manifest_not_complete');
  if (args.manifest.failedUnits !== 0) errors.push('coverage_contains_failed_units');
  if (args.manifest.omittedUnits !== 0) errors.push('coverage_contains_omitted_units');
  if (countedReadableUnits !== args.manifest.expectedUnits) errors.push('coverage_counts_do_not_match_expected_units');
  if (actualIndexes.length !== expectedIndexes.length) errors.push('coverage_unit_count_mismatch');
  if (actualIndexes.some((value, index) => value !== expectedIndexes[index])) errors.push('coverage_unit_indexes_not_contiguous');
  if (args.units.some((unit) => unit.status === 'failed' || unit.status === 'omitted')) errors.push('coverage_has_unread_unit_rows');

  return {
    passed: errors.length === 0,
    errors: Array.from(new Set(errors)),
    unitsRead: args.units.filter((unit) =>
      unit.status === 'succeeded' || unit.status === 'low_confidence' || unit.status === 'verified_blank'
    ).length,
    unitsExpected: args.manifest.expectedUnits,
  };
}
