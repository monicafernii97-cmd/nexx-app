import type { DocumentReferenceDetection, DocumentType } from './documentReferenceDetection';
import type { DocumentMemorySource } from './documentAccess';

/**
 * Provenance for aliases used during stored document recall.
 * The document_type and assistant_reference sources are reserved for metadata and user naming passes.
 */
export type DocumentAliasSource =
  | 'filename'
  | 'document_type'
  | 'assistant_reference'
  | 'system_generated';

export type StoredDocumentCandidateInput = {
  uploadedFileId: string;
  filename: string;
  createdAt: number;
  detectedType?: string;
  aliases?: string[];
  memorySource?: DocumentMemorySource;
  isActiveDocument?: boolean;
  recentReferenceRank?: number;
};

export type StoredDocumentSelectionReason =
  | 'explicit_filename_match'
  | 'explicit_alias_match'
  | 'active_document'
  | 'recently_referenced'
  | 'same_conversation'
  | 'same_case'
  | 'user_private_memory'
  | 'document_type_match'
  | 'recency';

export type StoredDocumentSelection = {
  uploadedFileId: string;
  score: number;
  reasons: StoredDocumentSelectionReason[];
};

export type StoredDocumentAmbiguity = {
  requiresClarification: true;
  reason: 'multiple_matching_documents';
  options: Array<{
    uploadedFileId: string;
    label: string;
    filename: string;
    createdAt: number;
    memorySource?: DocumentMemorySource;
    score: number;
    reasons: StoredDocumentSelectionReason[];
  }>;
};

const GENERIC_ORDER_ALIASES = ['the order', 'court order', 'uploaded order', 'uploaded court order'];
const GENERIC_DOCUMENT_ALIASES = ['the document', 'uploaded document', 'the file', 'uploaded file', 'the pdf'];
const AMBIGUITY_SCORE_MARGIN = 50;

/** Normalize filenames, aliases, and user references into a comparable lowercase search key. */
export function normalizeDocumentAlias(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{1,8}$/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove a trailing filename extension while preserving the rest of the user-visible name. */
function withoutExtension(filename: string) {
  return filename.replace(/\.[a-z0-9]{1,8}$/i, '').trim();
}

/** Deduplicate aliases after applying the same normalization used for lookup. */
function uniqueAliases(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(normalizeDocumentAlias)
    .filter((alias) => {
      if (!alias || seen.has(alias)) return false;
      seen.add(alias);
      return true;
  });
}

/** Build durable recall aliases from the original filename and detected document type. */
export function buildDocumentAliases(args: {
  filename: string;
  detectedType?: string;
}): Array<{ alias: string; normalizedAlias: string; source: DocumentAliasSource }> {
  const baseName = withoutExtension(args.filename);
  const aliases = [args.filename, baseName];
  const lower = `${args.filename} ${args.detectedType ?? ''}`.toLowerCase();

  if (/\border\b|court_order|temporary_order|final_order|amended_order/.test(lower)) {
    aliases.push(...GENERIC_ORDER_ALIASES);
  } else {
    aliases.push(...GENERIC_DOCUMENT_ALIASES);
  }

  return uniqueAliases(aliases).map((normalizedAlias) => ({
    alias: normalizedAlias,
    normalizedAlias,
    source: normalizedAlias === normalizeDocumentAlias(args.filename) || normalizedAlias === normalizeDocumentAlias(baseName)
      ? 'filename'
      : 'system_generated',
  }));
}

/** Check whether classifier metadata matches the document types requested by the user turn. */
function requestedDocumentTypeMatches(candidate: StoredDocumentCandidateInput, requestedTypes: DocumentType[]) {
  if (!candidate.detectedType || requestedTypes.length === 0) return false;
  const detectedType = candidate.detectedType.toLowerCase();
  return requestedTypes.some((type) => detectedType === type || detectedType.includes(type.replace(/_/g, ' ')));
}

/** Test whether a normalized message explicitly contains a normalized document alias. */
function messageContainsAlias(normalizedMessage: string, alias: string) {
  if (!alias || alias.length < 3) return false;
  return normalizedMessage === alias || normalizedMessage.includes(alias);
}

/** Score and rank stored document candidates for a document-related chat turn. */
export function selectStoredDocumentCandidates(args: {
  message: string;
  detection: DocumentReferenceDetection;
  candidates: StoredDocumentCandidateInput[];
  maxDocuments: number;
}) {
  const normalizedMessage = normalizeDocumentAlias(args.message);
  const ranked = args.candidates.map((candidate, index): StoredDocumentSelection => {
    let score = Math.max(0, 30 - index);
    const reasons: StoredDocumentSelectionReason[] = ['recency'];
    const filenameAlias = normalizeDocumentAlias(candidate.filename);
    const baseFilenameAlias = normalizeDocumentAlias(withoutExtension(candidate.filename));

    if (candidate.isActiveDocument) {
      score += 120;
      reasons.push('active_document');
    }

    if (candidate.recentReferenceRank !== undefined) {
      score += Math.max(0, 80 - candidate.recentReferenceRank * 10);
      reasons.push('recently_referenced');
    }

    if (candidate.memorySource === 'conversation_memory') {
      score += 45;
      reasons.push('same_conversation');
    } else if (candidate.memorySource === 'case_memory') {
      score += 30;
      reasons.push('same_case');
    } else if (candidate.memorySource === 'user_private_memory') {
      score += 5;
      reasons.push('user_private_memory');
    }

    if (messageContainsAlias(normalizedMessage, filenameAlias) || messageContainsAlias(normalizedMessage, baseFilenameAlias)) {
      score += 180;
      reasons.push('explicit_filename_match');
    }

    if ((candidate.aliases ?? []).some((alias) => messageContainsAlias(normalizedMessage, normalizeDocumentAlias(alias)))) {
      score += 120;
      reasons.push('explicit_alias_match');
    }

    if (requestedDocumentTypeMatches(candidate, args.detection.requestedDocumentTypes)) {
      score += 55;
      reasons.push('document_type_match');
    }

    return {
      uploadedFileId: candidate.uploadedFileId,
      score,
      reasons: Array.from(new Set(reasons)),
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  return {
    selected: ranked.slice(0, args.maxDocuments),
    ranked,
  };
}

/** Return true when ranking found a high-confidence document that should not trigger clarification. */
function hasStrongSingleDocumentSignal(selection: StoredDocumentSelection) {
  return selection.reasons.includes('active_document') || selection.reasons.includes('explicit_filename_match');
}

/** Return true for document references where choosing the wrong stored file would be risky. */
function isClarificationSensitiveReference(detection: DocumentReferenceDetection) {
  return detection.mayNeedClarification ||
    detection.referenceType === 'explicit_prior_upload' ||
    detection.referenceType === 'implicit_followup' ||
    detection.referenceType === 'active_document_followup' ||
    detection.referenceType === 'deadline_lookup' ||
    detection.referenceType === 'section_lookup' ||
    detection.referenceType === 'terminology_check' ||
    detection.referenceType === 'quote_request' ||
    detection.referenceType === 'source_location_request';
}

/** Identify when stored document recall should ask the user which document to use. */
export function detectStoredDocumentAmbiguity(args: {
  detection: DocumentReferenceDetection;
  ranked: StoredDocumentSelection[];
  candidates: StoredDocumentCandidateInput[];
  maxOptions?: number;
}): StoredDocumentAmbiguity | null {
  if (!args.detection.referencesDocument || !isClarificationSensitiveReference(args.detection)) {
    return null;
  }

  const [top, second] = args.ranked;
  if (!top || !second) return null;
  if (hasStrongSingleDocumentSignal(top)) return null;
  if (top.score - second.score > AMBIGUITY_SCORE_MARGIN) return null;

  const byId = new Map(args.candidates.map((candidate) => [candidate.uploadedFileId, candidate]));
  const options = args.ranked
    .filter((selection) => top.score - selection.score <= AMBIGUITY_SCORE_MARGIN)
    .slice(0, args.maxOptions ?? 4)
    .map((selection, index) => {
      const candidate = byId.get(selection.uploadedFileId);
      return {
      uploadedFileId: selection.uploadedFileId,
      label: `Document ${index + 1}`,
      filename: candidate?.filename ?? 'Uploaded document',
      createdAt: candidate?.createdAt ?? 0,
      memorySource: candidate?.memorySource,
      score: selection.score,
      reasons: selection.reasons,
      };
    });

  if (options.length < 2) return null;

  return {
    requiresClarification: true,
    reason: 'multiple_matching_documents',
    options,
  };
}
