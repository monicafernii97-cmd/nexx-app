const normalize = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '')
  .replace(/[-_]+/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const CONTINUATION_PATTERNS = [
  /\bwhat\s+if\s+(?:he|she|they|the other parent)\b/i,
  /\b(?:he|she|they|the other parent)\s+(?:fights?\s+back|keeps?\s+(?:saying|arguing)|says?|argues?|claims?|insists?)\b/i,
  /\b(?:but|okay,?\s+but|so)\b.{0,120}\b(?:order|clause|provision|paragraph|that|it)\b/i,
  /\bdoes\s+(?:that|this|his|her|their)\s+(?:change|mean|affect)\b/i,
  /\b(?:are\s+you\s+sure|what\s+(?:is|are)\s+(?:he|she|they)\s+(?:missing|leaving\s+out))\b/i,
  /\bwhat\s+should\s+i\s+(?:say|do|respond)\b/i,
];

const EXPLICIT_NEW_ISSUE_PATTERNS = [
  /\b(?:separate|different|new|another)\s+(?:question|issue|topic)\b/i,
  /\b(?:deadline|hearing|service|filing|response)\b.{0,40}\b(?:new|another|different)\s+(?:motion|petition|case|filing)\b/i,
  /\b(?:new|another|different)\s+(?:motion|petition|case|filing)\b/i,
  /\b(?:switching|change|moving)\s+(?:topics?|issues?)\b/i,
  /\bnow\s+(?:i\s+need|about|help\s+me\s+with)\b/i,
];

export const HOLIDAY_SIGNAL_TERMS = [
  "father's day", 'fathers day', "mother's day", 'mothers day', 'juneteenth',
  'federal holiday', 'state holiday', 'local holiday', 'friday holiday',
  'holiday possession', 'holiday schedule', 'student holiday', 'teacher in service',
  'teacher in-service', 'summer possession', 'extended summer', 'weekend possession',
  'school not in session', 'summer months',
];

export const PRIORITY_SIGNAL_TERMS = [
  'except as otherwise expressly provided', 'except as otherwise provided',
  'notwithstanding', 'subject to', 'unless otherwise provided', 'specific provision',
  'general provision', 'later order', 'modified order', 'amended order', 'supersedes',
];

export function hasConversationalContinuationSignal(value: string) {
  return CONTINUATION_PATTERNS.some((pattern) => pattern.test(value));
}

export function hasExplicitNewIssueSignal(value: string) {
  return EXPLICIT_NEW_ISSUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function extractSharedLegalTerms(value: string) {
  const text = normalize(value);
  const candidates = [
    ...HOLIDAY_SIGNAL_TERMS,
    ...PRIORITY_SIGNAL_TERMS,
    'thursday', 'friday', 'saturday', 'sunday', 'monday', 'possession', 'schedule',
    'pickup', 'exchange', 'start', 'starts', 'begin', 'begins', 'end', 'ends',
    'court order', 'order', 'clause', 'provision', 'paragraph', 'weekend',
  ];
  return Array.from(new Set(candidates.filter((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm && new RegExp(`\\b${normalizedTerm.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text);
  })));
}

export function containsNamedOrQualifyingHoliday(value: string) {
  return extractSharedLegalTerms(value).some((term) => HOLIDAY_SIGNAL_TERMS.includes(term));
}
