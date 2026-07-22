export type DocumentType =
  | 'court_order'
  | 'temporary_order'
  | 'amended_order'
  | 'final_order'
  | 'proposed_order'
  | 'motion'
  | 'petition'
  | 'exhibit'
  | 'notice'
  | 'docket_sheet'
  | 'parenting_plan'
  | 'financial_document'
  | 'email'
  | 'letter'
  | 'unknown';

export type DocumentReferenceDetection = {
  referencesDocument: boolean;
  confidence: 'none' | 'low' | 'medium' | 'high';
  referenceType:
    | 'none'
    | 'explicit_prior_upload'
    | 'explicit_current_attachment'
    | 'implicit_followup'
    | 'active_document_followup'
    | 'deadline_lookup'
    | 'section_lookup'
    | 'terminology_check'
    | 'quote_request'
    | 'comparison_request'
    | 'metadata_lookup'
    | 'source_location_request'
    | 'possession_schedule_interpretation'
    | 'clause_conflict_interpretation';
  documentHints: string[];
  requestedTerms: string[];
  requestedSections: string[];
  requestedDates: string[];
  requestedDocumentTypes: DocumentType[];
  requiresExactText: boolean;
  requiresPageOrSectionCitation: boolean;
  mayNeedClarification: boolean;
};

const DOCUMENT_HINT_PATTERNS = [
  /\b((?:uploaded|attached|shared|prior|previous|current|this|that|the|my|our)\s+(?:court\s+order|order|document|file|pdf|upload))\b/gi,
  /\b(court\s+order|temporary\s+order|temporary\s+orders|amended\s+order|amended\s+temporary\s+order|final\s+order|parenting\s+plan|docket\s+sheet|exhibit|notice|motion|petition)\b/gi,
  /\b(?:refer\s+back|look\s+back|pull\s+up|open\s+(?:it|that|the\s+(?:file|document|order))|double[-\s]?check|verify|re-?read|review\s+again)\b/gi,
];

const IMPLICIT_FOLLOW_UP_PATTERNS = [
  /\b(?:what|when|where|who|does|did|can|should|must|shall).{0,80}\b(?:it|that|(?:the|my|our)\s+(?:order|document|file|pdf))\b/i,
  /\b(?:it|that|(?:the|my|our)\s+(?:order|document|file|pdf)).{0,80}\b(?:say|state|require|mean|allow|prohibit|mention|include)\b/i,
];

const DEADLINE_TERMS = [
  'deadline',
  'deadlines',
  'due date',
  'due dates',
  'within',
  'no later than',
  'on or before',
  'calendar days',
  'business days',
];

const EXACT_TERMS = [
  'shall',
  'may',
  'must',
  'immediately',
  'supervised visitation',
  'conservatorship',
  'custody',
  'possession',
  'injunction',
];

const HOLIDAY_POSSESSION_TERMS = [
  'father\'s day',
  'fathers day',
  'mother\'s day',
  'mothers day',
  'thanksgiving',
  'christmas',
  'spring break',
  'student holiday',
  'teacher in-service',
  'teacher in service',
  'holiday possession',
  'holiday schedule',
  'extended summer',
  'summer possession',
  'weekend possession',
  'federal holiday',
  'state holiday',
  'local holiday',
  'friday holiday',
  'juneteenth',
  'summer months',
  'school not in session',
];

const CLAUSE_CONFLICT_TERMS = [
  'controls',
  'control',
  'conflict',
  'conflicts',
  'overlap',
  'overlaps',
  'exception',
  'except as otherwise',
  'notwithstanding',
  'specific provision',
  'general provision',
  'which clause',
  'which provision',
  'supersede',
  'supersedes',
  'later order',
  'modified order',
];

const CLAUSE_PRIORITY_SEARCH_TERMS = [
  'except as otherwise expressly provided',
  'except as otherwise provided',
  'notwithstanding',
  'specific provision',
  'general provision',
  'supersede',
  'supersedes',
  'modified order',
  'amended order',
  'later order',
];

const SECTION_PATTERN = /\b(?:section|paragraph|page|clause)\s+([0-9]+|[ivxlcdm]+|[a-z])\b/gi;
const DATE_PATTERN = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?)\b/gi;
const GENERIC_LEGAL_QUESTION_PATTERN =
  /\b(?:how\s+do\s+i\s+file|what\s+is\s+(?:a|an|the)?|what\s+are|how\s+long\s+does|what\s+does.+mean\s+generally)\b/i;
const EXPLICIT_STORED_DOCUMENT_SIGNAL_PATTERN =
  /\b(?:uploaded|attached|shared|prior|previous|refer\s+back|look\s+back|pull\s+up|open\s+(?:it|that|the\s+(?:file|document|order))|double[-\s]?check|verify|re-?read|review\s+again|according\s+to|based\s+on|from\s+the)\b/i;

/** True when the user is asking whether a document is available, not asking to analyze it. */
export function isDocumentAvailabilityQuestion(message: string) {
  return /\b(?:do|does|did|can)\s+you\s+(?:still\s+)?(?:have|keep|save|store|remember|see|access)\b.{0,80}\b(?:court\s+order|order|document|file|pdf|upload)\b/i.test(message) ||
    /\b(?:court\s+order|order|document|file|pdf|upload)\b.{0,80}\b(?:saved|stored|available|on\s+file|in\s+(?:the\s+)?case)\b/i.test(message);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeTermSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAnyTerm(text: string, terms: string[]) {
  const normalizedText = normalizeTermSearch(text);
  return terms.filter((term) => {
    const normalizedTerm = normalizeTermSearch(term);
    if (!normalizedTerm) return false;
    return new RegExp(`\\b${normalizedTerm.replace(/\s+/g, '\\s+')}\\b`, 'i').test(normalizedText);
  });
}

function detectDocumentTypes(text: string): DocumentType[] {
  const types: DocumentType[] = [];
  if (/\bamended\s+(temporary\s+)?order\b/i.test(text)) types.push('amended_order');
  if (/\btemporary\s+orders?\b/i.test(text)) types.push('temporary_order');
  if (/\bfinal\s+order\b/i.test(text)) types.push('final_order');
  if (/\bproposed\s+order\b/i.test(text)) types.push('proposed_order');
  if (/\bcourt\s+order\b|\bthe\s+order\b/i.test(text)) types.push('court_order');
  if (/\bparenting\s+plan\b/i.test(text)) types.push('parenting_plan');
  if (/\bdocket\s+sheet\b/i.test(text)) types.push('docket_sheet');
  if (/\bexhibit\b/i.test(text)) types.push('exhibit');
  if (/\bnotice\b/i.test(text)) types.push('notice');
  if (/\bmotion\b/i.test(text)) types.push('motion');
  if (/\bpetition\b/i.test(text)) types.push('petition');
  return unique(types) as DocumentType[];
}

function collectPatternMatches(text: string, patterns: RegExp[]) {
  const matches: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      matches.push(match[1] ?? match[0]);
    }
  }
  return unique(matches);
}

function getBaseDetection(): DocumentReferenceDetection {
  return {
    referencesDocument: false,
    confidence: 'none',
    referenceType: 'none',
    documentHints: [],
    requestedTerms: [],
    requestedSections: [],
    requestedDates: [],
    requestedDocumentTypes: [],
    requiresExactText: false,
    requiresPageOrSectionCitation: false,
    mayNeedClarification: false,
  };
}

/** Detect whether a user turn is asking to re-pull or verify stored uploaded document text. */
export function detectDocumentReference(message: string): DocumentReferenceDetection {
  const text = message.trim();
  if (!text) return getBaseDetection();

  const lower = text.toLowerCase();
  if (isDocumentAvailabilityQuestion(text)) {
    return {
      ...getBaseDetection(),
      referenceType: 'metadata_lookup',
      requestedDocumentTypes: detectDocumentTypes(text),
    };
  }
  const documentHints = collectPatternMatches(text, DOCUMENT_HINT_PATTERNS);
  const requestedSections = unique(Array.from(text.matchAll(SECTION_PATTERN)).map((match) => match[0]));
  const requestedDates = unique(Array.from(text.matchAll(DATE_PATTERN)).map((match) => match[0]));
  const requestedDocumentTypes = detectDocumentTypes(text);
  const deadlineTerms = matchesAnyTerm(lower, DEADLINE_TERMS);
  const exactTerms = matchesAnyTerm(lower, EXACT_TERMS);
  const holidayTerms = matchesAnyTerm(lower, HOLIDAY_POSSESSION_TERMS);
  const clauseConflictTerms = matchesAnyTerm(lower, CLAUSE_CONFLICT_TERMS);
  const hasImplicitFollowUp = IMPLICIT_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text));
  const asksForQuote = /\b(?:quote|exact\s+(?:wording|words|language)|what\s+exact\s+words|word\s+for\s+word)\b/i.test(text);
  const asksForSource = /\b(?:where\s+(?:does|did)\s+it\s+say|where\s+exactly|what\s+page|show\s+me\s+where|cite)\b/i.test(text);
  const asksForComparison = /\b(?:compare|difference|different|amended|prior|previous|original)\b/i.test(text) && documentHints.length > 0;
  const asksForSpecificLocation = /\b(?:section|paragraph|page|clause)\s+([0-9]+|[ivxlcdm]+|[a-z])\b/i.test(text);
  const documentObjectPattern = /\b(?:it|that|(?:the|my|our)\s+(?:order|document|file|pdf))\b/i;
  const asksIfDocumentSays = /\b(?:does|did|is)\s+(?:it|that|(?:the|my|our)\s+(?:order|document|file|pdf)).{0,80}\b(?:say|use|mention|include)\b/i.test(text);
  const hasHolidayPossessionSignal =
    holidayTerms.length > 0 &&
    /\b(?:possession|schedule|start|starts|begin|begins|end|ends|pickup|exchange|weekend|thursday|friday|saturday|sunday|provision|clause|paragraph)\b/i.test(text);
  const hasClauseConflictSignal =
    hasHolidayPossessionSignal &&
    (
      clauseConflictTerms.length > 0 ||
      /\b(?:which|what)\s+(?:clause|provision|rule)\s+controls\b/i.test(text) ||
      /\b(?:general|regular)\s+(?:weekend|possession|provision|clause|rule)\b/i.test(text) ||
      /\b(?:specific|holiday|father'?s\s+day|mother'?s\s+day)\s+(?:provision|clause|rule)\b/i.test(text) ||
      /\b(?:something different|other|different)\b.{0,80}\b(?:order|paragraph|provision|clause|rule)\b/i.test(text) ||
      /\b(?:order|paragraph|provision|clause|rule)\b.{0,80}\b(?:different|other|instead|thursday|friday)\b/i.test(text)
    );
  const hasDocumentSignal = documentHints.length > 0 || requestedDocumentTypes.length > 0;
  const hasSectionSignal = requestedSections.length > 0 && (hasDocumentSignal || hasImplicitFollowUp || asksForSpecificLocation);
  const hasDeadlineSignal = deadlineTerms.length > 0 && (hasDocumentSignal || hasImplicitFollowUp);
  const hasExactSignal = (asksForQuote || asksIfDocumentSays) &&
    (hasDocumentSignal || hasImplicitFollowUp || exactTerms.length > 0 || hasHolidayPossessionSignal);
  const isGenericLegalQuestion =
    GENERIC_LEGAL_QUESTION_PATTERN.test(text) &&
    !EXPLICIT_STORED_DOCUMENT_SIGNAL_PATTERN.test(text);

  if (
    isGenericLegalQuestion &&
    !hasImplicitFollowUp &&
    !hasSectionSignal &&
    !hasDeadlineSignal &&
    !hasExactSignal &&
    !hasHolidayPossessionSignal &&
    !asksForSource
  ) {
    return getBaseDetection();
  }

  if (!(hasDocumentSignal || hasImplicitFollowUp || hasSectionSignal || hasDeadlineSignal || hasExactSignal || hasHolidayPossessionSignal || asksForSource)) {
    return getBaseDetection();
  }

  let referenceType: DocumentReferenceDetection['referenceType'] = 'implicit_followup';
  if (hasClauseConflictSignal) referenceType = 'clause_conflict_interpretation';
  else if (asksForComparison) referenceType = 'comparison_request';
  else if (asksForSource) referenceType = 'source_location_request';
  else if (hasExactSignal || asksForQuote) referenceType = asksForQuote ? 'quote_request' : 'terminology_check';
  else if (hasSectionSignal) referenceType = 'section_lookup';
  else if (hasDeadlineSignal) referenceType = 'deadline_lookup';
  else if (hasHolidayPossessionSignal) referenceType = 'possession_schedule_interpretation';
  else if (documentHints.some((hint) => /\b(uploaded|attached|shared|prior|previous)\b/i.test(hint))) referenceType = 'explicit_prior_upload';
  else if (documentHints.length > 0) referenceType = 'active_document_followup';

  const requiresExactText =
    referenceType === 'terminology_check' ||
    referenceType === 'quote_request' ||
    referenceType === 'source_location_request';

  return {
    referencesDocument: true,
    confidence: hasDocumentSignal || requiresExactText ? 'high' : 'medium',
    referenceType,
    documentHints,
    requestedTerms: unique([
      ...deadlineTerms,
      ...exactTerms,
      ...holidayTerms,
      ...clauseConflictTerms,
      ...(hasClauseConflictSignal ? CLAUSE_PRIORITY_SEARCH_TERMS : []),
    ]),
    requestedSections,
    requestedDates,
    requestedDocumentTypes,
    requiresExactText,
    requiresPageOrSectionCitation:
      requiresExactText ||
      hasSectionSignal ||
      asksForSource ||
      referenceType === 'possession_schedule_interpretation' ||
      referenceType === 'clause_conflict_interpretation',
    mayNeedClarification: asksForComparison || (documentObjectPattern.test(text) && !hasImplicitFollowUp && documentHints.length === 0),
  };
}
