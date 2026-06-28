export type LegalDocumentAnswerType =
  | 'direct_quote'
  | 'summary'
  | 'comparison'
  | 'interpretation'
  | 'timeline'
  | 'metadata'
  | 'not_found'
  | 'needs_review';

export type LegalDocumentClaimType =
  | 'document_fact'
  | 'quote'
  | 'summary'
  | 'comparison'
  | 'interpretation'
  | 'procedural';

export type LegalDocumentAnswer = {
  answerType: LegalDocumentAnswerType;
  answer: string;
  claims: Array<{
    claim: string;
    claimType: LegalDocumentClaimType;
    sourceIds: string[];
  }>;
  citations: Array<{
    sourceId: string;
    fileId: string;
    fileName: string;
    memoryGenerationId?: string | null;
    chunkId: string;
    pageStart?: number | null;
    pageEnd?: number | null;
    blockIds: string[];
    quotedText: string;
    confidence?: number | null;
    warning?: string | null;
  }>;
  warnings: string[];
  unsupportedClaims: string[];
  notFoundReason?: string | null;
};

export type LegalDocumentSourcePacket = {
  sourceId: string;
  fileId: string;
  fileName: string;
  memoryGenerationId?: string;
  chunkId: string;
  pageStart?: number;
  pageEnd?: number;
  blockIds: string[];
  sectionHeading?: string;
  text: string;
  confidence?: number;
  warning?: string;
};

const LEGAL_DOCUMENT_ANSWER_TYPES = new Set<LegalDocumentAnswerType>([
  'direct_quote',
  'summary',
  'comparison',
  'interpretation',
  'timeline',
  'metadata',
  'not_found',
  'needs_review',
]);

const LEGAL_DOCUMENT_CLAIM_TYPES = new Set<LegalDocumentClaimType>([
  'document_fact',
  'quote',
  'summary',
  'comparison',
  'interpretation',
  'procedural',
]);

export type LegalDocumentAnswerVerification = {
  passed: boolean;
  errors: string[];
  verifiedCitations: Array<{
    sourceId: string;
    chunkId: string;
    quotedText: string;
    citationVerifierStatus: 'verified' | 'partial';
  }>;
};

const DOCUMENT_FACT_CLAIM_TYPES = new Set<LegalDocumentClaimType>([
  'document_fact',
  'quote',
  'summary',
  'comparison',
  'interpretation',
]);

function normalizeForFuzzyMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWordsForCitation(value: string) {
  return normalizeForFuzzyMatch(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function contiguousWindowCoverage(sourceWords: string[], quoteWords: string[]) {
  if (quoteWords.length === 0 || quoteWords.length > sourceWords.length) return 0;

  let bestCoverage = 0;
  for (let index = 0; index <= sourceWords.length - quoteWords.length; index += 1) {
    const window = sourceWords.slice(index, index + quoteWords.length);
    const matchedWords = quoteWords.filter((word, wordIndex) => window[wordIndex] === word).length;
    bestCoverage = Math.max(bestCoverage, matchedWords / quoteWords.length);
  }
  return bestCoverage;
}

export function fuzzyTextContains(sourceText: string, quotedText: string) {
  const quote = normalizeForFuzzyMatch(quotedText);
  if (!quote || quote.length < 8) return false;

  const source = normalizeForFuzzyMatch(sourceText);
  if (source.includes(quote)) return true;

  const quoteWords = quote.split(/\s+/).filter(Boolean);
  if (quoteWords.length < 5) return false;

  const sourceWords = source.split(/\s+/).filter(Boolean);
  if (quoteWords.length > sourceWords.length) return false;

  for (let index = 0; index <= sourceWords.length - quoteWords.length; index += 1) {
    const window = sourceWords.slice(index, index + quoteWords.length);
    const matchedWords = quoteWords.filter((word, wordIndex) => window[wordIndex] === word).length;
    if (matchedWords / quoteWords.length >= 0.92) return true;
  }

  const looseQuoteWords = normalizeWordsForCitation(quotedText);
  if (looseQuoteWords.length >= 5) {
    const looseSourceWords = normalizeWordsForCitation(sourceText);
    if (contiguousWindowCoverage(looseSourceWords, looseQuoteWords) >= 0.92) return true;
  }

  return false;
}

export function validateLegalDocumentAnswerShape(value: unknown): value is LegalDocumentAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const answer = value as Partial<LegalDocumentAnswer>;
  if (typeof answer.answerType !== 'string' || !LEGAL_DOCUMENT_ANSWER_TYPES.has(answer.answerType as LegalDocumentAnswerType)) return false;
  if (typeof answer.answer !== 'string') return false;
  if (!Array.isArray(answer.claims)) return false;
  if (!Array.isArray(answer.citations)) return false;
  if (!Array.isArray(answer.warnings)) return false;
  if (!Array.isArray(answer.unsupportedClaims)) return false;
  if (!answer.warnings.every((warning) => typeof warning === 'string')) return false;
  if (!answer.unsupportedClaims.every((claim) => typeof claim === 'string')) return false;
  if (
    answer.notFoundReason !== undefined &&
    answer.notFoundReason !== null &&
    typeof answer.notFoundReason !== 'string'
  ) {
    return false;
  }

  return answer.claims.every((claim) =>
    claim &&
    typeof claim === 'object' &&
    typeof claim.claim === 'string' &&
    typeof claim.claimType === 'string' &&
    LEGAL_DOCUMENT_CLAIM_TYPES.has(claim.claimType as LegalDocumentClaimType) &&
    Array.isArray(claim.sourceIds) &&
    claim.sourceIds.every((sourceId) => typeof sourceId === 'string')
  ) && answer.citations.every((citation) =>
    citation &&
    typeof citation === 'object' &&
    typeof citation.sourceId === 'string' &&
    typeof citation.fileId === 'string' &&
    typeof citation.fileName === 'string' &&
    typeof citation.chunkId === 'string' &&
    Array.isArray(citation.blockIds) &&
    citation.blockIds.every((blockId) => typeof blockId === 'string') &&
    typeof citation.quotedText === 'string' &&
    (
      citation.memoryGenerationId === undefined ||
      citation.memoryGenerationId === null ||
      typeof citation.memoryGenerationId === 'string'
    ) &&
    (
      citation.pageStart === undefined ||
      citation.pageStart === null ||
      typeof citation.pageStart === 'number'
    ) &&
    (
      citation.pageEnd === undefined ||
      citation.pageEnd === null ||
      typeof citation.pageEnd === 'number'
    ) &&
    (
      citation.confidence === undefined ||
      citation.confidence === null ||
      typeof citation.confidence === 'number'
    ) &&
    (
      citation.warning === undefined ||
      citation.warning === null ||
      typeof citation.warning === 'string'
    )
  );
}

export function verifyLegalDocumentAnswer(
  answer: LegalDocumentAnswer | null | undefined,
  sourcePackets: LegalDocumentSourcePacket[],
  options: {
    requiresDocumentAnswer: boolean;
    requiresCitation: boolean;
  }
): LegalDocumentAnswerVerification {
  const errors: string[] = [];
  const packetsBySourceId = new Map(sourcePackets.map((packet) => [packet.sourceId, packet]));
  const verifiedCitations: LegalDocumentAnswerVerification['verifiedCitations'] = [];

  if (!options.requiresDocumentAnswer) {
    return { passed: true, errors, verifiedCitations };
  }

  if (!answer) {
    return {
      passed: false,
      errors: ['Document context was used, but the response did not include documentAnswer.'],
      verifiedCitations,
    };
  }

  if (answer.unsupportedClaims.length > 0) {
    errors.push('Document answer contains unsupportedClaims.');
  }

  for (const claim of answer.claims) {
    if (DOCUMENT_FACT_CLAIM_TYPES.has(claim.claimType) && claim.sourceIds.length === 0) {
      errors.push(`Document claim is missing sources: ${claim.claim.slice(0, 120)}`);
    }
    for (const sourceId of claim.sourceIds) {
      if (!packetsBySourceId.has(sourceId)) {
        errors.push(`Claim cites unknown source_id: ${sourceId}`);
      }
    }
  }

  if (options.requiresCitation && answer.answerType !== 'not_found' && answer.citations.length === 0) {
    errors.push('Document answer requires at least one verified citation.');
  }

  for (const citation of answer.citations) {
    const source = packetsBySourceId.get(citation.sourceId);
    if (!source) {
      errors.push(`Citation source does not exist: ${citation.sourceId}`);
      continue;
    }
    if (source.fileId !== citation.fileId) {
      errors.push(`Citation file mismatch for ${citation.sourceId}.`);
    }
    if (source.chunkId !== citation.chunkId) {
      errors.push(`Citation chunk mismatch for ${citation.sourceId}.`);
    }
    if (source.memoryGenerationId && !citation.memoryGenerationId) {
      errors.push(`Citation generation missing for ${citation.sourceId}.`);
    } else if (citation.memoryGenerationId && source.memoryGenerationId && citation.memoryGenerationId !== source.memoryGenerationId) {
      errors.push(`Citation generation mismatch for ${citation.sourceId}.`);
    }
    if (!fuzzyTextContains(source.text, citation.quotedText)) {
      errors.push(`Quoted text was not found in source ${citation.sourceId}.`);
      continue;
    }

    verifiedCitations.push({
      sourceId: citation.sourceId,
      chunkId: citation.chunkId,
      quotedText: citation.quotedText,
      citationVerifierStatus: source.confidence !== undefined && source.confidence < 0.85 ? 'partial' : 'verified',
    });
  }

  return {
    passed: errors.length === 0,
    errors,
    verifiedCitations,
  };
}
