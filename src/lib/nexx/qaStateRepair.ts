export type RepairCandidateClassification =
  | 'confirmed_qa'
  | 'confirmed_synthetic'
  | 'unclassified'
  | 'production';

export function classifyRepairCandidate(input: {
  dataProvenance?: 'production' | 'qa' | 'synthetic';
  creatorIsRobot: boolean;
  filenameHasSyntheticPrefix: boolean;
  qaRunId?: string;
  sessionDataProvenance?: 'production' | 'qa' | 'synthetic';
}) {
  if (input.dataProvenance === 'synthetic' || input.sessionDataProvenance === 'synthetic') {
    return {
      classification: 'confirmed_synthetic' as const,
      confidence: 'high' as const,
      reasons: ['explicit_synthetic_provenance'],
    };
  }
  if (input.dataProvenance === 'qa' || input.sessionDataProvenance === 'qa') {
    return {
      classification: 'confirmed_qa' as const,
      confidence: 'high' as const,
      reasons: ['explicit_qa_provenance'],
    };
  }
  if (input.creatorIsRobot && (input.qaRunId || input.filenameHasSyntheticPrefix)) {
    return {
      classification: 'confirmed_synthetic' as const,
      confidence: 'high' as const,
      reasons: ['robot_creator', input.qaRunId ? 'registered_qa_run' : 'synthetic_filename_pattern'],
    };
  }
  if (input.creatorIsRobot) {
    return {
      classification: 'confirmed_qa' as const,
      confidence: 'high' as const,
      reasons: ['robot_creator'],
    };
  }
  if (!input.dataProvenance || input.filenameHasSyntheticPrefix) {
    return {
      classification: 'unclassified' as const,
      confidence: input.filenameHasSyntheticPrefix ? 'medium' as const : 'low' as const,
      reasons: [input.filenameHasSyntheticPrefix ? 'filename_pattern_without_identity_evidence' : 'missing_provenance'],
    };
  }
  return { classification: 'production' as const, confidence: 'high' as const, reasons: ['explicit_production_provenance'] };
}

export function withoutTargets<T extends string>(values: T[], targets: ReadonlySet<string>) {
  return values.filter((value) => !targets.has(value));
}

export function containsAnyTarget(value: string | undefined, targets: ReadonlySet<string>) {
  if (!value) return false;
  for (const target of targets) {
    if (value.includes(target)) return true;
  }
  return false;
}

export function stableRepairHash(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
