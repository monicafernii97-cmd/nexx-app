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

export type DocumentRepairCandidate = {
  uploadedFileId: string;
  eligible: boolean;
  storageSha256?: string;
  fullTextSha256?: string;
  sha256Hash?: string;
};

export type CanonicalDocumentSelection = {
  selectedDocumentIds: string[];
  rejected: Array<{
    uploadedFileId: string;
    reason: 'ineligible' | 'exact_duplicate';
    canonicalUploadedFileId?: string;
  }>;
};

function exactDocumentFingerprints(candidate: DocumentRepairCandidate) {
  return [
    candidate.fullTextSha256 ? `full:${candidate.fullTextSha256}` : undefined,
    candidate.storageSha256 ? `storage:${candidate.storageSha256}` : undefined,
    candidate.sha256Hash ? `sha:${candidate.sha256Hash}` : undefined,
  ].filter((value): value is string => Boolean(value));
}

/**
 * Preserve caller priority while excluding ineligible records and collapsing
 * only exact hash duplicates. Similar names or lengths are never sufficient.
 */
export function canonicalizeDocumentCandidates(candidates: DocumentRepairCandidate[]): CanonicalDocumentSelection {
  const selectedDocumentIds: string[] = [];
  const rejected: CanonicalDocumentSelection['rejected'] = [];
  const selectedIds = new Set<string>();
  const canonicalByFingerprint = new Map<string, string>();

  for (const candidate of candidates) {
    if (selectedIds.has(candidate.uploadedFileId)) continue;
    if (!candidate.eligible) {
      rejected.push({ uploadedFileId: candidate.uploadedFileId, reason: 'ineligible' });
      continue;
    }
    const fingerprints = exactDocumentFingerprints(candidate);
    const canonicalUploadedFileId = fingerprints
      .map((fingerprint) => canonicalByFingerprint.get(fingerprint))
      .find((value): value is string => Boolean(value));
    if (canonicalUploadedFileId) {
      rejected.push({
        uploadedFileId: candidate.uploadedFileId,
        reason: 'exact_duplicate',
        canonicalUploadedFileId,
      });
      continue;
    }
    selectedIds.add(candidate.uploadedFileId);
    selectedDocumentIds.push(candidate.uploadedFileId);
    fingerprints.forEach((fingerprint) => canonicalByFingerprint.set(fingerprint, candidate.uploadedFileId));
  }
  return { selectedDocumentIds, rejected };
}

export function canonicalDocumentIdsForRepair(args: {
  existingIds: string[];
  canonicalUploadedFileId: string;
  quarantinedUploadedFileIds: ReadonlySet<string>;
  duplicateUploadedFileIds: ReadonlySet<string>;
}) {
  const removed = new Set([
    ...args.quarantinedUploadedFileIds,
    ...args.duplicateUploadedFileIds,
  ]);
  return [
    args.canonicalUploadedFileId,
    ...args.existingIds.filter((id) => id !== args.canonicalUploadedFileId && !removed.has(id)),
  ].filter((id, index, values) => values.indexOf(id) === index);
}

/**
 * Remove adjudicated references and, when supplied, promote one genuine
 * canonical document. Cleanup-only runs deliberately do not invent a
 * replacement document for an unrelated conversation.
 */
export function documentIdsForDerivedRepair(args: {
  existingIds: string[];
  canonicalUploadedFileId?: string;
  removedUploadedFileIds: ReadonlySet<string>;
}) {
  const remaining = args.existingIds.filter((id) => !args.removedUploadedFileIds.has(id));
  return [
    ...(args.canonicalUploadedFileId ? [args.canonicalUploadedFileId] : []),
    ...remaining.filter((id) => id !== args.canonicalUploadedFileId),
  ].filter((id, index, values) => values.indexOf(id) === index);
}

export type DerivedDocumentReferenceRecord = {
  conversationId: string;
  category: string;
  documentIds?: string[];
  serializedState?: string;
};

/**
 * Locate future-facing derived references independently of the upload row's
 * original conversation. This closes the cross-conversation repair gap.
 */
export function findDerivedDocumentReferences(
  records: DerivedDocumentReferenceRecord[],
  targetUploadedFileIds: ReadonlySet<string>,
) {
  return records.filter((record) =>
    record.documentIds?.some((id) => targetUploadedFileIds.has(id)) ||
    containsAnyTarget(record.serializedState, targetUploadedFileIds)
  );
}
