import type {
  CapabilityDecision,
  CapabilityOperation,
  DocumentCapability,
  DocumentCapabilityInput,
  DocumentCapabilitySnapshot,
} from './types';

export const CAPABILITY_LEDGER_VERSION = 'document-capability-v1';

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`)
    .join(',')}}`;
}

export function stableCapabilityHash(value: unknown) {
  const input = stableSerialize(value);
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `cap_${(hash >>> 0).toString(36)}`;
}

function requestedPagesAvailable(ranges: Array<[number, number]>, pages: number[]) {
  return pages.length === 0 || pages.every((page) => ranges.some(([start, end]) => page >= start && page <= end));
}

export function buildDocumentCapability(input: DocumentCapabilityInput): DocumentCapability {
  const ranges = input.availablePageRanges ?? [];
  const textLength = Math.max(0, input.extractedTextLength ?? 0);
  const chunksAvailable = (input.chunkCount ?? 0) > 0;
  const textExtracted = textLength > 0 || chunksAvailable;
  const authorized = input.authorized && !['quarantined', 'deleted'].includes(input.status);
  const coverageStatus = input.coverageStatus ?? 'unverified';
  const fullDocumentReviewStatus = input.fullDocumentReviewStatus ?? 'not_started';
  const limitations: DocumentCapability['limitations'] = [];

  if (!authorized) limitations.push({ code: 'document_not_authorized', scope: 'all', userSafeText: 'I cannot use that file in this conversation.' });
  if (!textExtracted) limitations.push({ code: 'document_text_unavailable', scope: 'text', userSafeText: 'The readable text is not available yet.' });
  if (coverageStatus !== 'complete') limitations.push({ code: 'document_coverage_incomplete', scope: 'exhaustive_review', userSafeText: 'Page-by-page coverage is not fully verified yet.' });
  if (fullDocumentReviewStatus !== 'ready') limitations.push({
    code: 'full_review_not_ready',
    scope: 'exhaustive_review',
    userSafeText: textExtracted
      ? 'The exhaustive review is not ready, but I can still use the extracted text for focused work.'
      : 'The exhaustive review is not ready yet.',
  });

  return {
    uploadedFileId: input.uploadedFileId,
    filename: input.filename,
    status: input.status,
    authorized,
    binaryStored: Boolean(input.hasStorageId),
    metadataAvailable: Boolean(input.uploadedFileId && input.filename),
    textExtracted,
    extractedCharacterCount: textLength,
    pageCountKnown: typeof input.pagesTotal === 'number' && input.pagesTotal >= 0,
    pagesTotal: input.pagesTotal,
    availablePageRanges: ranges,
    requestedPagesAvailable: requestedPagesAvailable(ranges, input.requestedPages ?? []),
    chunksAvailable,
    activeMemoryAvailable: Boolean(input.hasActiveMemory),
    keywordSearchAvailable: authorized && textExtracted && (input.hasKeywordSearch ?? true),
    semanticSearchAvailable: authorized && Boolean(input.hasSemanticSearch && chunksAvailable),
    hostedFileSearchAvailable: authorized && Boolean(input.hasHostedFileSearch),
    citationAnchorsAvailable: authorized && Boolean(input.hasCitationAnchors || ranges.length > 0),
    coverageStatus,
    fullDocumentReviewStatus,
    limitations,
  };
}

export function buildCapabilitySnapshot(args: {
  turnId: string;
  documents: DocumentCapabilityInput[];
  tools?: Partial<DocumentCapabilitySnapshot['tools']>;
  computedAt?: number;
}): DocumentCapabilitySnapshot {
  const documents = args.documents.map(buildDocumentCapability);
  const tools = {
    webSearch: args.tools?.webSearch ?? false,
    fileSearch: args.tools?.fileSearch ?? false,
    outputContinuation: args.tools?.outputContinuation ?? false,
    deterministicTextSearch: args.tools?.deterministicTextSearch ?? true,
  };
  const core = { schemaVersion: 1 as const, turnId: args.turnId, documents, tools };
  return {
    ...core,
    computedAt: args.computedAt ?? Date.now(),
    snapshotHash: stableCapabilityHash(core),
  };
}

function supportsFocused(document: DocumentCapability) {
  return document.authorized && (document.textExtracted || document.chunksAvailable) &&
    (document.keywordSearchAvailable || document.semanticSearchAvailable || document.hostedFileSearchAvailable);
}

function supportsOperation(document: DocumentCapability, operation: CapabilityOperation) {
  switch (operation) {
    case 'identify_file': return document.authorized && document.metadataAvailable;
    case 'quote_requested_page': return document.authorized && document.requestedPagesAvailable && document.textExtracted && document.citationAnchorsAvailable;
    case 'answer_focused_question': return supportsFocused(document) && document.citationAnchorsAvailable;
    case 'scoped_summary': return document.authorized && document.textExtracted;
    case 'search_document': return supportsFocused(document);
    case 'exhaustive_review': return document.authorized && document.coverageStatus === 'complete' && document.fullDocumentReviewStatus === 'ready';
    case 'compare_documents': return document.authorized && document.textExtracted;
    case 'draft_from_order': return supportsFocused(document) && document.citationAnchorsAvailable;
  }
}

export function canPerformOperation(operation: CapabilityOperation, snapshot: DocumentCapabilitySnapshot): CapabilityDecision {
  const authorized = snapshot.documents.filter((document) => document.authorized);
  const usable = authorized.filter((document) => supportsOperation(document, operation));
  const compareComplete = operation !== 'compare_documents' || (authorized.length >= 2 && usable.length === authorized.length);
  const allowed = usable.length > 0 && compareComplete;
  const exhaustive = operation === 'exhaustive_review';
  const supportLevel: CapabilityDecision['supportLevel'] = !allowed
    ? usable.length > 0 ? 'partial' : 'none'
    : exhaustive || snapshot.documents.every((document) => document.coverageStatus === 'complete')
      ? 'complete'
      : 'scoped';
  const missingRequirements = allowed ? [] : [
    ...(authorized.length === 0 ? ['authorized_document'] : []),
    ...(authorized.some((document) => !document.textExtracted) ? ['extracted_text'] : []),
    ...(exhaustive && authorized.some((document) => document.coverageStatus !== 'complete') ? ['verified_page_coverage'] : []),
    ...(exhaustive && authorized.some((document) => document.fullDocumentReviewStatus !== 'ready') ? ['ready_full_document_review'] : []),
  ];
  const prohibitedClaims = [
    ...(snapshot.documents.some((document) => document.textExtracted || document.chunksAvailable) ? ['file_unreadable', 'no_readable_access'] : []),
    ...(snapshot.documents.some((document) => document.coverageStatus !== 'complete' || document.fullDocumentReviewStatus !== 'ready') ? ['exhaustive_review_complete', 'no_other_relevant_language'] : []),
  ];
  const limitations = snapshot.documents.flatMap((document) => document.limitations)
    .filter((item, index, values) => values.findIndex((candidate) => candidate.code === item.code) === index)
    .map((item) => ({ code: item.code, text: item.userSafeText }));
  const alternateOperations: CapabilityOperation[] = exhaustive && !allowed
    ? ['answer_focused_question', 'scoped_summary', 'search_document'].filter((candidate) => authorized.some((document) => supportsOperation(document, candidate as CapabilityOperation))) as CapabilityOperation[]
    : [];

  return {
    allowed,
    supportLevel,
    usableDocumentIds: usable.map((document) => document.uploadedFileId),
    missingRequirements,
    prohibitedClaims,
    userSafeLimitations: limitations,
    alternateOperations,
  };
}

