const LEGACY_GENERIC_CANONICAL_PATTERNS = [
  /^here are the key provisions in the order\.?$/i,
  /^here is what the visible order language supports\.?$/i,
  /^the provision written specifically for this event applies/i,
  /^the signed order language should be followed as written/i,
  /^follow the order as written\.?$/i,
  /^the specific provision applies\.?$/i,
];

const GENERIC_SENTENCE_PATTERNS = [
  /^here are the key provisions in the order$/i,
  /^here is what the visible order language supports$/i,
  /^the provision written specifically for this event applies(?: here)?$/i,
  /^the signed order language should be followed as written$/i,
  /^follow the order as written$/i,
  /^the specific provision applies$/i,
  /^this (?:order|document) contains the following relevant provisions$/i,
  /^here (?:is|are) (?:the|some) relevant (?:information|details|provisions)$/i,
  /^i (?:can|will|would be happy to) help(?: you)? with that$/i,
  /^i can provide (?:general )?(?:guidance|information) (?:about|on) that$/i,
  /^based on the information available,? i can help(?: you)?(?: with that)?$/i,
];

const GENERIC_PADDING_PATTERNS = [
  /^(?:certainly|absolutely|of course|sure)$/i,
  /^i hope (?:that|this) helps$/i,
  /^(?:please )?let me know if you (?:have|need|want) anything else$/i,
  /^feel free to ask (?:any )?(?:other|additional|follow-up )?questions$/i,
];

const GENERIC_LIMITATION_PATTERNS = [
  /^(?:the )?(?:full|exhaustive|complete)(?:-document)? review (?:is|was) not (?:ready|available|complete),? but i can still (?:use|review|analy[sz]e) (?:the )?(?:available|extracted|visible) (?:text|pages?|content)(?: for focused work)?$/i,
  /^i (?:cannot|can't|could not|couldn't) verify (?:a )?complete answer,? but i can (?:still )?(?:help|provide|review) (?:the )?(?:available|visible|extracted) (?:information|text|content)$/i,
  /^the available (?:text|content|evidence) may be incomplete$/i,
];

export type GenericAnswerAssessment = {
  isGeneric: boolean;
  sentenceCount: number;
  genericSentenceCount: number;
  paddingSentenceCount: number;
  limitationSentenceCount: number;
  substantiveSentenceCount: number;
  reasonCodes: string[];
};

function normalizeSentence(value: string) {
  if (/^\s*#{1,6}\s+/.test(value)) return '';
  return value
    .replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+)/, '')
    .replace(/[.!?]+["')\]]*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split prose and markdown list items so one generic sentence cannot hide another. */
export function splitAnswerSentences(value: string) {
  return value
    .normalize('NFKC')
    .split(/(?:[.!?]+["')\]]*\s+)|\n+/)
    .map(normalizeSentence)
    .filter(Boolean);
}

export function assessGenericAnswer(value: string): GenericAnswerAssessment {
  const sentences = splitAnswerSentences(value);
  let genericSentenceCount = 0;
  let paddingSentenceCount = 0;
  let limitationSentenceCount = 0;

  for (const sentence of sentences) {
    if (GENERIC_SENTENCE_PATTERNS.some((pattern) => pattern.test(sentence))) {
      genericSentenceCount += 1;
    } else if (GENERIC_PADDING_PATTERNS.some((pattern) => pattern.test(sentence))) {
      paddingSentenceCount += 1;
    } else if (GENERIC_LIMITATION_PATTERNS.some((pattern) => pattern.test(sentence))) {
      limitationSentenceCount += 1;
    }
  }

  const substantiveSentenceCount = Math.max(
    0,
    sentences.length - genericSentenceCount - paddingSentenceCount - limitationSentenceCount,
  );
  const genericOnly = genericSentenceCount > 0 && substantiveSentenceCount === 0;
  const reasonCodes = [
    ...(genericSentenceCount > 1 ? ['multiple_generic_sentences'] : []),
    ...(genericSentenceCount > 0 && paddingSentenceCount > 0 ? ['generic_core_with_padding'] : []),
    ...(genericSentenceCount > 0 && limitationSentenceCount > 0 ? ['generic_core_with_limitation'] : []),
    ...(genericOnly ? ['no_substantive_sentence'] : []),
  ];

  return {
    isGeneric: genericOnly,
    sentenceCount: sentences.length,
    genericSentenceCount,
    paddingSentenceCount,
    limitationSentenceCount,
    substantiveSentenceCount,
    reasonCodes,
  };
}

export function isGenericCanonicalLegalAnswer(
  value: string,
  options?: { sentenceLevel?: boolean },
) {
  if (options?.sentenceLevel !== false) return assessGenericAnswer(value).isGeneric;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return LEGACY_GENERIC_CANONICAL_PATTERNS.some((pattern) => pattern.test(normalized));
}
