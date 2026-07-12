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

const NOT_FOUND_PRACTICAL_MEANING =
  'I would not rely on a missing or unreadable clause for a filing without a clearer copy or the exact page language.';

const NEEDS_REVIEW_PRACTICAL_MEANING =
  'I can work from the visible language, but I would review the exact signed-order wording before using this for filing or enforcement.';

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
  'procedural',
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
    .replace(/\bextracted court-order text\b/gi, 'court-order language')
    .replace(/\bextracted order text\b/gi, 'visible order language')
    .replace(/\bextracted text\b/gi, 'visible order language')
    .replace(/\bextracted provisions\b/gi, 'visible provisions')
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

  const sourceIds = uniqueValues([
    ...answer.citations.map((citation) => citation.sourceId),
    ...answer.claims.flatMap((claim) => claim.sourceIds),
  ]);

  return new Map<string, RenderableCitation>(
    sourceIds.map((sourceId) => {
      const sourcePage = sourcePages.get(sourceId);
      const label = sourcePage && sourcePage !== 'source'
        ? sourcePage
        : compactPageLabel(
          answer.citations.find((citation) => citation.sourceId === sourceId)?.pageStart,
          answer.citations.find((citation) => citation.sourceId === sourceId)?.pageEnd
        );
      return [sourceId, { sourceId, label }];
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

function truncateUserFacingText(value: string, maxLength = 280) {
  const clean = cleanUserFacingDocumentText(value).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3).trim()}...`;
}

const LEGAL_SIGNAL_PATTERN = /\b(order|ordered|shall|must|required|deadline|within|notice|pay|support|possession|conservator|custody|school|medical|passport|exclusive|authority)\b/i;

function sourceTextToSupportedClaim(source: LegalDocumentSourcePacket) {
  const normalized = cleanUserFacingDocumentText(source.text).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [normalized];
  const candidate =
    sentences.find((sentence) => sentence.length >= 35 && LEGAL_SIGNAL_PATTERN.test(sentence)) ??
    sentences.find((sentence) => sentence.length >= 35) ??
    normalized;
  const heading = truncateUserFacingText(source.sectionHeading ?? '', 90);
  const claim = truncateUserFacingText(candidate, heading ? 230 : 260);

  return heading && !claim.toLowerCase().includes(heading.toLowerCase())
    ? `${heading}: ${claim}`
    : claim;
}

function confidenceLabel(confidence?: number): 'high' | 'medium' | 'low' {
  if (confidence === undefined) return 'low';
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.72) return 'medium';
  return 'low';
}

export function buildBestEffortLegalDocumentAnswerFromSources(
  sourcePackets: LegalDocumentSourcePacket[],
  fallbackMessage?: string,
  options: { isTargetedQuestion?: boolean } = {}
): LegalDocumentAnswer {
  const usableSources = sourcePackets
    .map((source) => ({ source, claim: sourceTextToSupportedClaim(source) }))
    .filter(({ claim }) => claim.length > 0)
    .slice(0, 8);

  if (usableSources.length === 0) {
    return {
      answerType: 'not_found',
      answer: cleanUserFacingDocumentText(
        fallbackMessage ||
        'I do not see usable order language for this upload yet. Upload a clearer copy and I can analyze it.'
      ),
      claims: [],
      citations: [],
      warnings: [],
      unsupportedClaims: [],
      notFoundReason: 'no_usable_extracted_text',
    };
  }

  const strongestSupportedClaim = [...usableSources]
    .sort((a, b) => {
      const aScore = claimSortScore({
        claim: a.claim,
        claimType: isDeadlineClaim(a.claim) ? 'procedural' : 'document_fact',
        sourceIds: [a.source.sourceId],
      });
      const bScore = claimSortScore({
        claim: b.claim,
        claimType: isDeadlineClaim(b.claim) ? 'procedural' : 'document_fact',
        sourceIds: [b.source.sourceId],
      });
      return aScore - bScore;
    })[0]?.claim;

  return {
    answerType: 'summary',
    answer: options.isTargetedQuestion && strongestSupportedClaim
      ? strongestSupportedClaim
      : 'Here are the key provisions in the order.',
    claims: usableSources.map(({ source, claim }) => ({
      claim,
      claimType: isDeadlineClaim(claim) ? 'procedural' : 'document_fact',
      sourceIds: [source.sourceId],
    })),
    citations: usableSources.map(({ source }) => ({
      sourceId: source.sourceId,
      pageStart: source.pageStart,
      pageEnd: source.pageEnd,
      supports: null,
      confidence: confidenceLabel(source.confidence),
    })),
    warnings: [],
    unsupportedClaims: [],
    notFoundReason: null,
  };
}

function claimSortScore(claim: LegalDocumentAnswer['claims'][number]) {
  const text = claim.claim.toLowerCase();
  if (/\b(order|ordered|shall|required|must|exclusive|authority|deadline|within|pay|support|notice)\b/.test(text)) {
    return 0;
  }
  if (claim.claimType === 'document_fact') return 1;
  return 2;
}

const DAY_COUNT_ONES = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
] as const;

const DAY_COUNT_TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
] as const;

const DAY_COUNT_TENS = [
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
] as const;

const DAY_COUNT_WORDS_BELOW_ONE_HUNDRED = [
  ...DAY_COUNT_ONES,
  ...DAY_COUNT_TEENS,
  ...DAY_COUNT_TENS.flatMap((ten) => [
    ten,
    ...DAY_COUNT_ONES.flatMap((unit) => [`${ten}-${unit}`, `${ten} ${unit}`]),
  ]),
];

const DAY_COUNT_WORDS = [
  ...DAY_COUNT_WORDS_BELOW_ONE_HUNDRED,
  'one hundred',
  ...DAY_COUNT_WORDS_BELOW_ONE_HUNDRED.flatMap((count) => [
    `one hundred ${count}`,
    `one hundred and ${count}`,
  ]),
].sort((a, b) => b.length - a.length);

const DAY_COUNT_PATTERN = `(?:\\d+|${DAY_COUNT_WORDS.join('|')})`;
const DAY_COUNT_TO_DAY_UNIT_PATTERN = `${DAY_COUNT_PATTERN}(?:\\s+|-)(?:(?:calendar|business)(?:\\s+|-))?days?`;
const WITHIN_DAYS_PATTERN = new RegExp(
  `\\bwithin\\s+${DAY_COUNT_TO_DAY_UNIT_PATTERN}\\b`,
  'i',
);
const DAY_COUNT_DEADLINE_PATTERN = new RegExp(
  `\\b${DAY_COUNT_TO_DAY_UNIT_PATTERN}\\b`,
  'i',
);

function deadlineTimingFromClaim(value: string) {
  const searchableValue = protectTimeAbbreviations(value);
  const patterns = [
    /\bfrom\s+[^.;]+?\s+(?:until|to|through)\s+[^.;]+/i,
    /\b(?:beginning|begins|starting|starts|running|runs)\s+(?:at|on|from)\s+[^.;]+?\s+(?:and\s+)?(?:ending|ends)\s+(?:at|on)\s+[^.;]+/i,
    /\b(?:period|possession|weekend)\b[^.;]{0,90}\b(?:begins|starts)\s+(?:at|on)\s+[^.;]+/i,
    /\b(?:begins|starts)\s+(?:at|on)\s+[^.;]+/i,
    WITHIN_DAYS_PATTERN,
    DAY_COUNT_DEADLINE_PATTERN,
    /\bno later than\s+[^.;,]+/i,
    /\bmonthly\b/i,
    /\bevery\s+[^.;,]+/i,
    /\bby\s+[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?\b/,
  ];
  for (const pattern of patterns) {
    const match = searchableValue.match(pattern);
    if (match?.[0]) return cleanUserFacingDocumentText(restoreTimeAbbreviations(match[0]));
  }
  return 'Not stated in the visible order language';
}

function isDeadlineClaim(value: string) {
  return (
    deadlineTimingFromClaim(value) !== 'Not stated in the visible order language' ||
    /\b(deadline|within|no later than|monthly|every|notice|payment|support|pay|due)\b/i.test(value) ||
    /\b(?:calendar|business)\s+days?\b/i.test(value) ||
    DAY_COUNT_DEADLINE_PATTERN.test(value)
  );
}

function protectTimeAbbreviations(value: string) {
  return value.replace(/\b([ap])\.m\./gi, (_match, meridiem: string) => `${meridiem.toLowerCase()}__m__`);
}

function restoreTimeAbbreviations(value: string) {
  return value.replace(/\b([ap])__m__/gi, (_match, meridiem: string) => `${meridiem.toLowerCase()}.m.`);
}

function formatMarkdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- No supported finding was identified in the visible order language.';
}

function markdownTableCell(value: string) {
  return cleanUserFacingDocumentText(value)
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Render a citation-locked whole-order answer into the product's stable
 * analysis shape. This is for broad "analyze/summarize the order" requests.
 * Internal caution, verifier, extraction, and source-detail diagnostics stay
 * out of the visible markdown by default.
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
  const priorityFindings = supportedClaims.length > 0
    ? supportedClaims.slice(0, 5).map((claim, index) => {
      const finding = appendCitationLabels(claim.claim, labelsForSourceIds(claim.sourceIds, citationMap));
      return `**Priority ${index + 1}.** ${finding}`;
    })
    : obligationItems.slice(0, 1).map((finding) => `**Priority 1.** ${finding}`);

  const deadlineClaims = supportedClaims.filter((claim) => isDeadlineClaim(claim.claim)).slice(0, 6);
  const deadlineRows = deadlineClaims.length > 0
    ? deadlineClaims.map((claim) => {
      const labels = labelsForSourceIds(claim.sourceIds, citationMap);
      const source = labels.length > 0 ? labels.map((label) => `[${label}]`).join(' ') : 'Order text';
      return `| ${markdownTableCell(claim.claim)} | ${markdownTableCell(deadlineTimingFromClaim(claim.claim))} | ${source} |`;
    })
    : [`| ${markdownTableCell('No specific deadline was identified in the visible provisions.')} | ${markdownTableCell('Not stated')} | - |`];

  return [
    '# Court Order Analysis',
    '## Executive Summary',
    executiveSummary || 'I found visible order language and organized the provisions below.',
    '## Highest-Priority Findings',
    formatMarkdownList(priorityFindings),
    '## Key Obligations',
    formatMarkdownList(obligationItems),
    '## Deadlines',
    ['| Finding | Timing | Source |', '|---|---|---|', ...deadlineRows].join('\n'),
    '## Recommended Next Steps',
    [
      '1. Create a deadline checklist from the cited provisions.',
      '2. Calendar every supported deadline and recurring obligation.',
      '3. Draft required co-parenting, AppClose, or notice messages from the exact order language.',
      '4. Prepare filing language from the supported facts and keep page citations attached.',
    ].join('\n'),
  ].join('\n\n');
}

/**
 * Render targeted document questions as a direct legal interpretation answer
 * instead of a report shell. The model owns the substantive answer; this
 * renderer preserves that answer, adds compact support, and keeps diagnostics
 * and source metadata out of visible text.
 */
export function renderTargetedLegalDocumentAnswerMarkdown(
  answer: LegalDocumentAnswer,
  sourcePackets: LegalDocumentSourcePacket[],
  fallbackMessage: string
) {
  const citationMap = citationMapForAnswer(answer, sourcePackets);
  const firstLabels = firstCitationLabels(citationMap);
  const cleanAnswer = cleanUserFacingDocumentText(answer.answer || fallbackMessage);
  const directAnswer = appendCitationLabels(cleanAnswer, firstLabels);
  const supportedClaims = [...answer.claims]
    .filter((claim) => claim.claim.trim().length > 0)
    .sort((a, b) => claimSortScore(a) - claimSortScore(b))
    .slice(0, 8);
  const findingItems = supportedClaims.length > 0
    ? supportedClaims.map((claim) => appendCitationLabels(
      claim.claim,
      labelsForSourceIds(claim.sourceIds, citationMap)
    ))
    : [];
  const practicalMeaning = answer.answerType === 'not_found'
    ? NOT_FOUND_PRACTICAL_MEANING
    : answer.answerType === 'needs_review'
      ? NEEDS_REVIEW_PRACTICAL_MEANING
      : undefined;

  return [
    directAnswer || 'I do not see enough visible order language to answer that directly.',
    findingItems.length > 0 ? `**Why:**\n${formatMarkdownList(findingItems)}` : undefined,
    practicalMeaning ? `**Practical meaning:** ${practicalMeaning}` : undefined,
  ].filter(Boolean).join('\n\n');
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
  const seenVerifiedCitationKeys = new Set<string>();

  const addVerifiedCitation = (
    sourceId: string,
    supportText?: string | null,
    forcePartial = false
  ) => {
    const source = packetsBySourceId.get(sourceId);
    if (!source) return;
    const key = `${source.sourceId}:${source.chunkId}`;
    if (seenVerifiedCitationKeys.has(key)) {
      const existing = verifiedCitations.find((citation) =>
        citation.sourceId === source.sourceId &&
        citation.chunkId === source.chunkId
      );
      if (forcePartial) {
        if (existing) existing.citationVerifierStatus = 'partial';
      } else if (supportText?.trim() && existing) {
        existing.quotedText = supportText.trim();
      }
      return;
    }
    seenVerifiedCitationKeys.add(key);
    verifiedCitations.push({
      sourceId,
      chunkId: source.chunkId,
      quotedText: supportText?.trim() || sourceQuotePreview(source.text),
      citationVerifierStatus: forcePartial || (source.confidence !== undefined && source.confidence < 0.85)
        ? 'partial'
        : 'verified',
    });
  };

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

  for (const claim of answer.claims) {
    if (DOCUMENT_FACT_CLAIM_TYPES.has(claim.claimType) && claim.sourceIds.length === 0) {
      errors.push(`Document claim is missing sources: ${claim.claim.slice(0, 120)}`);
    }
    for (const sourceId of claim.sourceIds) {
      if (!packetsBySourceId.has(sourceId)) {
        errors.push(`Claim cites unknown source_id: ${sourceId}`);
      } else {
        addVerifiedCitation(sourceId);
      }
    }
  }

  if (
    options.requiresCitation &&
    answer.answerType !== 'not_found' &&
    answer.citations.length === 0 &&
    verifiedCitations.length === 0
  ) {
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
      addVerifiedCitation(citation.sourceId, undefined, true);
      continue;
    }

    addVerifiedCitation(citation.sourceId, supportText, false);
  }

  return {
    passed: errors.length === 0,
    errors,
    verifiedCitations,
  };
}
