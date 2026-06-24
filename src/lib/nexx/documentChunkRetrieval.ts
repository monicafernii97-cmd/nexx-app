import type { DocumentReferenceDetection } from './documentReferenceDetection';

export type DocumentChunkRetrievalReason =
  | 'exact_term'
  | 'deadline_pattern'
  | 'holiday_possession'
  | 'heading_match'
  | 'page_match'
  | 'section_match'
  | 'neighbor_context'
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

const HOLIDAY_POSSESSION_KEYWORDS = [
  'father\'s day',
  'fathers day',
  'father s day',
  'mother\'s day',
  'mothers day',
  'mother s day',
  'holiday possession',
  'holiday schedule',
  'student holiday',
  'teacher in-service',
  'teacher in service',
  'spring break',
  'thanksgiving',
  'christmas',
  'summer possession',
  'extended summer',
  'weekend possession',
  'thursday',
  'friday',
  'saturday',
  'sunday',
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

function messageNeedsHolidayPossessionRetrieval(message: string, detection: DocumentReferenceDetection) {
  return [...detection.requestedTerms, message].some((value) =>
    /\b(?:father\s+s\s+day|fathers\s+day|father\s+day|mother\s+s\s+day|mothers\s+day|mother\s+day|holiday\s+(?:possession|schedule)|student\s+holiday|teacher\s+in\s+service|spring\s+break|thanksgiving|christmas|summer\s+possession|extended\s+summer)\b/i.test(normalizeText(value))
  );
}

function addNeighborChunks(args: {
  selected: RetrievedDocumentChunk[];
  ranked: RetrievedDocumentChunk[];
  maxChunks: number;
}) {
  if (args.selected.length >= args.maxChunks) return args.selected;

  const byFileAndIndex = new Map(
    args.ranked.map((chunk) => [`${chunk.uploadedFileId}:${chunk.chunkIndex}`, chunk])
  );
  const selectedIds = new Set(args.selected.map((chunk) => chunk.chunkId));
  const anchors = args.selected.filter((chunk) =>
    chunk.retrievalReasons.some((reason) =>
      reason === 'exact_term' ||
      reason === 'holiday_possession' ||
      reason === 'page_match' ||
      reason === 'section_match' ||
      reason === 'heading_match' ||
      reason === 'deadline_pattern'
    )
  );

  for (const anchor of anchors) {
    for (const neighborIndex of [anchor.chunkIndex - 1, anchor.chunkIndex + 1]) {
      if (args.selected.length >= args.maxChunks) return args.selected;
      const neighbor = byFileAndIndex.get(`${anchor.uploadedFileId}:${neighborIndex}`);
      if (!neighbor || selectedIds.has(neighbor.chunkId)) continue;
      selectedIds.add(neighbor.chunkId);
      args.selected.push({
        ...neighbor,
        retrievalReasons: Array.from(new Set([...neighbor.retrievalReasons, 'neighbor_context'])),
      });
    }
  }

  return args.selected;
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
  const needsHolidayPossession = messageNeedsHolidayPossessionRetrieval(args.message, args.detection);

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

    if (needsHolidayPossession) {
      const holidayHits = HOLIDAY_POSSESSION_KEYWORDS.filter((term) => textContainsTerm(normalizedChunkText, normalizeText(term)));
      if (holidayHits.length > 0) {
        retrievalScore += 120 + holidayHits.length * 18;
        retrievalReasons.push('holiday_possession');
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

  const shouldExpandWithNeighbors =
    needsExact || needsHolidayPossession || needsSection || needsDeadline || requestedPages.length > 0;
  const initialChunkLimit = shouldExpandWithNeighbors
    ? Math.max(1, args.maxChunks - 2)
    : args.maxChunks;
  const selected = ranked
    .filter((chunk, index) => index < args.maxChunks || chunk.retrievalScore > 40)
    .slice(0, initialChunkLimit);

  const expanded = shouldExpandWithNeighbors
    ? addNeighborChunks({ selected, ranked, maxChunks: args.maxChunks })
    : selected;

  return expanded
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}
