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
    pageStart?: number | null;
    pageEnd?: number | null;
    supports?: string | null;
    confidence?: 'high' | 'medium' | 'low' | null;
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

function sourceQuotePreview(sourceText: string) {
  const normalized = sourceText.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 500) return normalized;
  return `${normalized.slice(0, 497).trim()}...`;
}

type RenderableCitation = {
  sourceId: string;
  label: string;
};

function compactPageLabel(pageStart?: number | null, pageEnd?: number | null) {
  if (!pageStart) return 'source';
  return pageEnd && pageEnd !== pageStart
    ? `pp. ${pageStart}-${pageEnd}`
    : `p. ${pageStart}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanUserFacingDocumentText(value: string) {
  return value
    .replace(/\bSOURCE_ID\b:?/gi, 'source')
    .replace(/\bsourceId\b:?/g, 'source')
    .replace(/\bchunkId\b:?/g, 'source')
    .replace(/\bmemoryGenerationId\b:?/g, 'source')
    .replace(/\bblockIds\b:?/g, 'source')
    .replace(/\bquotedText\b:?/g, 'source quote')
    .replace(/\bsrc_\d+\b/gi, 'source')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

function citationMapForAnswer(answer: LegalDocumentAnswer, sourcePackets: LegalDocumentSourcePacket[]) {
  const sourcePages = new Map(
    sourcePackets.map((source) => [
      source.sourceId,
      compactPageLabel(source.pageStart, source.pageEnd),
    ])
  );

  return new Map<string, RenderableCitation>(
    answer.citations.map((citation) => {
      const sourcePage = sourcePages.get(citation.sourceId);
      const label = sourcePage && sourcePage !== 'source'
        ? sourcePage
        : compactPageLabel(citation.pageStart, citation.pageEnd);
      return [citation.sourceId, { sourceId: citation.sourceId, label }];
    })
  );
}

function labelsForSourceIds(sourceIds: string[], citationMap: Map<string, RenderableCitation>) {
  return uniqueValues(
    sourceIds
      .map((sourceId) => citationMap.get(sourceId)?.label)
      .filter((label): label is string => Boolean(label && label !== 'source'))
  ).slice(0, 3);
}

function firstCitationLabels(citationMap: Map<string, RenderableCitation>) {
  return uniqueValues(
    Array.from(citationMap.values())
      .map((citation) => citation.label)
      .filter((label) => label !== 'source')
  ).slice(0, 3);
}

function hasCompactCitation(value: string) {
  return /\[(?:p\.|pp\.)\s*\d+/i.test(value);
}

function appendCitationLabels(value: string, labels: string[]) {
  const clean = cleanUserFacingDocumentText(value);
  const usableLabels = uniqueValues(labels).filter((label) => label !== 'source').slice(0, 3);
  if (!clean || usableLabels.length === 0 || hasCompactCitation(clean)) return clean;
  return `${clean} ${usableLabels.map((label) => `[${label}]`).join(' ')}`;
}

function claimSortScore(claim: LegalDocumentAnswer['claims'][number]) {
  const text = claim.claim.toLowerCase();
  if (/\b(order|ordered|shall|required|must|exclusive|authority|deadline|within|pay|support|notice)\b/.test(text)) {
    return 0;
  }
  if (claim.claimType === 'document_fact') return 1;
  return 2;
}

function deadlineTimingFromClaim(value: string) {
  const patterns = [
    /\bwithin\s+\d+\s+(?:calendar\s+)?days?\b/i,
    /\bno later than\s+[^.;,]+/i,
    /\bmonthly\b/i,
    /\bevery\s+[^.;,]+/i,
    /\bby\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?\b/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[0]) return cleanUserFacingDocumentText(match[0]);
  }
  return 'Review exact timing';
}

function isDeadlineClaim(value: string) {
  return /\b(deadline|within|no later than|monthly|every|calendar|days?|notice|payment|support|pay|due)\b/i.test(value);
}

function formatMarkdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- No supported finding was extracted from the available text.';
}

function markdownTableCell(value: string) {
  return cleanUserFacingDocumentText(value)
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Render a citation-locked document answer into the product's stable court-order
 * analysis shape. The model may choose findings; this renderer owns the
 * user-facing structure and citation labels.
 */
export function renderCourtOrderAnalysisMarkdown(
  answer: LegalDocumentAnswer,
  sourcePackets: LegalDocumentSourcePacket[],
  fallbackMessage: string
) {
  const citationMap = citationMapForAnswer(answer, sourcePackets);
  const firstLabels = firstCitationLabels(citationMap);
  const cleanAnswer = cleanUserFacingDocumentText(answer.answer || fallbackMessage);
  const executiveSummary = appendCitationLabels(cleanAnswer, firstLabels);

  const supportedClaims = [...answer.claims]
    .filter((claim) => claim.claim.trim().length > 0)
    .sort((a, b) => claimSortScore(a) - claimSortScore(b))
    .slice(0, 8);

  const obligationItems = supportedClaims.length > 0
    ? supportedClaims.map((claim) => appendCitationLabels(
      claim.claim,
      labelsForSourceIds(claim.sourceIds, citationMap)
    ))
    : [appendCitationLabels(cleanAnswer, firstLabels)];

  const deadlineClaims = supportedClaims.filter((claim) => isDeadlineClaim(claim.claim)).slice(0, 6);
  const deadlineRows = deadlineClaims.length > 0
    ? deadlineClaims.map((claim) => {
      const labels = labelsForSourceIds(claim.sourceIds, citationMap);
      const source = labels.length > 0 ? labels.map((label) => `[${label}]`).join(' ') : 'Review source';
      return `| ${markdownTableCell(claim.claim)} | ${markdownTableCell(deadlineTimingFromClaim(claim.claim))} | ${source} |`;
    })
    : [`| ${markdownTableCell('No clear deadline found in the supported extracted text.')} | ${markdownTableCell('Review the order before calendaring.')} | Review source |`];

  const warnings = uniqueValues(answer.warnings.map(cleanUserFacingDocumentText).filter(Boolean)).slice(0, 5);
  const riskItems = warnings.length > 0
    ? warnings
    : ['Verify exact wording in the original order before enforcement, filing, or calendaring.'];

  return [
    '# Court Order Analysis',
    '## Executive Summary',
    executiveSummary || 'The available extracted text does not support a complete court-order analysis yet.',
    '## Key Obligations',
    formatMarkdownList(obligationItems),
    '## Deadlines',
    ['| Finding | Timing | Source |', '|---|---|---|', ...deadlineRows].join('\n'),
    '## Risks and Cautions',
    formatMarkdownList(riskItems),
    '## Recommended Next Steps',
    [
      '1. Verify the cited page text against the original PDF before relying on it.',
      '2. Calendar every supported deadline and recurring obligation.',
      '3. Draft required co-parenting or notice messages from the exact order language.',
      '4. Flag incomplete or ambiguous provisions for attorney review.',
    ].join('\n'),
    '## Source Details',
    'Source details are available below in the collapsed source panel. Use the page chips and quote previews to verify exact wording.',
  ].join('\n\n');
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
      citation.confidence === 'high' ||
      citation.confidence === 'medium' ||
      citation.confidence === 'low'
    ) &&
    (
      citation.supports === undefined ||
      citation.supports === null ||
      typeof citation.supports === 'string'
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
    const supportText = citation.supports?.trim();
    if (supportText && !fuzzyTextContains(source.text, supportText)) {
      errors.push(`Supporting text was not found in source ${citation.sourceId}.`);
      continue;
    }

    verifiedCitations.push({
      sourceId: citation.sourceId,
      chunkId: source.chunkId,
      quotedText: supportText || sourceQuotePreview(source.text),
      citationVerifierStatus: source.confidence !== undefined && source.confidence < 0.85 ? 'partial' : 'verified',
    });
  }

  return {
    passed: errors.length === 0,
    errors,
    verifiedCitations,
  };
}
