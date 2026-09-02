export type CapabilityLimitation = {
  code: string;
  scope: string;
  userSafeText: string;
};

export type DocumentCapability = {
  uploadedFileId: string;
  filename: string;
  status: 'uploaded' | 'processing' | 'ready' | 'partial' | 'failed' | 'quarantined' | 'deleted';
  authorized: boolean;
  binaryStored: boolean;
  metadataAvailable: boolean;
  textExtracted: boolean;
  extractedCharacterCount: number;
  pageCountKnown: boolean;
  pagesTotal?: number;
  availablePageRanges: Array<[number, number]>;
  requestedPagesAvailable: boolean;
  chunksAvailable: boolean;
  activeMemoryAvailable: boolean;
  keywordSearchAvailable: boolean;
  semanticSearchAvailable: boolean;
  hostedFileSearchAvailable: boolean;
  citationAnchorsAvailable: boolean;
  coverageStatus: 'complete' | 'partial' | 'failed' | 'unverified';
  fullDocumentReviewStatus: 'not_started' | 'building' | 'ready' | 'partial' | 'failed';
  limitations: CapabilityLimitation[];
};

export type DocumentCapabilitySnapshot = {
  schemaVersion: 1;
  turnId: string;
  computedAt: number;
  documents: DocumentCapability[];
  tools: {
    webSearch: boolean;
    fileSearch: boolean;
    outputContinuation: boolean;
    deterministicTextSearch: boolean;
  };
  snapshotHash: string;
};

export type CapabilityOperation =
  | 'identify_file'
  | 'quote_requested_page'
  | 'answer_focused_question'
  | 'scoped_summary'
  | 'search_document'
  | 'exhaustive_review'
  | 'compare_documents'
  | 'draft_from_order';

export type CapabilityDecision = {
  allowed: boolean;
  supportLevel: 'complete' | 'scoped' | 'partial' | 'none';
  usableDocumentIds: string[];
  missingRequirements: string[];
  prohibitedClaims: string[];
  userSafeLimitations: Array<{ code: string; text: string }>;
  alternateOperations: CapabilityOperation[];
};

export type DocumentCapabilityInput = {
  uploadedFileId: string;
  filename: string;
  status: DocumentCapability['status'];
  authorized: boolean;
  hasStorageId?: boolean;
  extractedTextLength?: number;
  pagesTotal?: number;
  availablePageRanges?: Array<[number, number]>;
  requestedPages?: number[];
  chunkCount?: number;
  hasActiveMemory?: boolean;
  hasKeywordSearch?: boolean;
  hasSemanticSearch?: boolean;
  hasHostedFileSearch?: boolean;
  hasCitationAnchors?: boolean;
  coverageStatus?: DocumentCapability['coverageStatus'];
  fullDocumentReviewStatus?: DocumentCapability['fullDocumentReviewStatus'];
};

