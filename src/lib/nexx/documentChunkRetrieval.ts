import type { DocumentReferenceDetection } from './documentReferenceDetection';

export type DocumentChunkRetrievalReason =
  | 'exact_term'
  | 'deadline_pattern'
  | 'heading_match'
  | 'page_match'
  | 'section_match'
  | 'keyword_overlap'
  | 'early_context';

export type DocumentChunkRetrievalCandidate = {
  chunkId: string;
  uploadedFileId: string;
  chunkIndex: number;
  text: string;
  textLength: number;
  pageStart?: number;
  pageEnd?: number;
  sectionHeading?: string;
  paragraphNumber?: string;
  extractionMethod?: string;
  ocrConfidence?: number;
  warnings?: string[];
};

export type RetrievedDocumentChunk = DocumentChunkRetrievalCandidate & {
  retrievalScore: number;
  retrievalReasons: DocumentChunkRetrievalReason[];
};

const DEADLINE_KEYWORDS = [
  'deadline',
  'due',
  'within',
  'no later than',
  'on or before',
  'before',
  'after',
  'days',
  'business days',
  'calendar days',
  'hearing',
  'file',
  'serve',
  'respond',
  'exchange',
  'payment',
];

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'back',
  'can',
  'check',
  'court',
  'did',
  'doc',
  'document',
  'does',
  'file',
  'for',
  'from',
  'have',
  'into',
  'look',
  'order',
  'pdf',
  'pull',
  'say',
  'says',
  'section',
  'that',
  'the',
  'this',
  'uploaded',
  'what',
  'when',
  'where',
  'with',
]);

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function normalizeTerms(terms: string[]) {
  return unique(
    terms
      .flatMap((term) => {
        const normalized = normalizeText(term);
        return normalized.includes(' ') ? [normalized, ...words(normalized)] : [normalized];
      })
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
  );
}

function extractRequestedPages(sections: string[]) {
  return unique(
    sections
      .map((section) => section.match(/\bpage\s+(\d+)\b/i)?.[1])
      .filter((page): page is string => Boolean(page))
      .map((page) => Number.parseInt(page, 10))
      .filter(Number.isFinite)
  );
}

function extractSectionTerms(sections: string[]) {
  return normalizeTerms(
    sections.map((section) =>
      section
        .replace(/\b(?:section|paragraph|page|clause)\b/gi, '')
        .trim()
    )
  );
}

function textContainsTerm(normalizedTextValue: string, normalizedTerm: string) {
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedTextValue);
}

function pageRangeContains(chunk: DocumentChunkRetrievalCandidate, page: number) {
  if (chunk.pageStart === undefined && chunk.pageEnd === undefined) return false;
  const pageStart = chunk.pageStart ?? chunk.pageEnd ?? 0;
  const pageEnd = chunk.pageEnd ?? chunk.pageStart ?? pageStart;
  return page >= pageStart && page <= pageEnd;
}

function buildSearchTerms(message: string, detection: DocumentReferenceDetection) {
  const messageTerms = words(message).slice(0, 16);
  const requestedTerms = normalizeTerms(detection.requestedTerms);
  const requestedDates = normalizeTerms(detection.requestedDates);
  const sectionTerms = extractSectionTerms(detection.requestedSections);

  if (detection.referenceType === 'deadline_lookup') {
    return unique([...requestedTerms, ...requestedDates, ...sectionTerms, ...DEADLINE_KEYWORDS, ...messageTerms]);
  }

  return unique([...requestedTerms, ...requestedDates, ...sectionTerms, ...messageTerms]);
}

/** Rank stored document chunks for exact wording, deadline, section, page, and follow-up retrieval. */
export function retrieveRelevantDocumentChunks(args: {
  message: string;
  detection: DocumentReferenceDetection;
  chunks: DocumentChunkRetrievalCandidate[];
  maxChunks: number;
}): RetrievedDocumentChunk[] {
  if (args.maxChunks <= 0 || args.chunks.length === 0) return [];

  const searchTerms = buildSearchTerms(args.message, args.detection);
  const requestedPages = extractRequestedPages(args.detection.requestedSections);
  const sectionTerms = extractSectionTerms(args.detection.requestedSections);
  const needsDeadline = args.detection.referenceType === 'deadline_lookup';
  const needsExact = args.detection.requiresExactText;
  const needsSection = args.detection.referenceType === 'section_lookup';

  const ranked = args.chunks.map((chunk): RetrievedDocumentChunk => {
    const normalizedChunkText = normalizeText(chunk.text);
    const normalizedHeading = normalizeText(chunk.sectionHeading ?? '');
    let retrievalScore = Math.max(0, 20 - chunk.chunkIndex);
    const retrievalReasons: DocumentChunkRetrievalReason[] = ['early_context'];

    for (const page of requestedPages) {
      if (pageRangeContains(chunk, page)) {
        retrievalScore += 120;
        retrievalReasons.push('page_match');
      }
    }

    for (const term of sectionTerms) {
      if (textContainsTerm(normalizedHeading, term) || textContainsTerm(normalizedChunkText, term)) {
        retrievalScore += needsSection ? 95 : 55;
        retrievalReasons.push(textContainsTerm(normalizedHeading, term) ? 'heading_match' : 'section_match');
      }
    }

    for (const term of searchTerms) {
      if (!textContainsTerm(normalizedChunkText, term)) continue;
      retrievalScore += needsExact ? 80 : 28;
      retrievalReasons.push(needsExact ? 'exact_term' : 'keyword_overlap');
    }

    if (needsDeadline) {
      const deadlineHits = DEADLINE_KEYWORDS.filter((term) => textContainsTerm(normalizedChunkText, normalizeText(term)));
      if (deadlineHits.length > 0) {
        retrievalScore += 80 + deadlineHits.length * 12;
        retrievalReasons.push('deadline_pattern');
      }
    }

    return {
      ...chunk,
      retrievalScore,
      retrievalReasons: unique(retrievalReasons),
    };
  });

  ranked.sort((a, b) => {
    if (b.retrievalScore !== a.retrievalScore) return b.retrievalScore - a.retrievalScore;
    return a.chunkIndex - b.chunkIndex;
  });

  return ranked
    .filter((chunk, index) => index < args.maxChunks || chunk.retrievalScore > 40)
    .slice(0, args.maxChunks)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}
