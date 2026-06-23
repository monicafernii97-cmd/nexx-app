const EXPLICIT_DOCUMENT_REFERENCE_PATTERNS = [
  /\b(this|that|the|uploaded|attached|shared|prior|previous)\s+(court\s+order|order|document|file|pdf|upload)\b/i,
  /\b(court\s+order|uploaded\s+(document|file|pdf)|attached\s+(document|file|pdf)|shared\s+(document|file|pdf))\b/i,
  /\b(refer\s+back|look\s+back|pull\s+up|open\s+(it|that|the\s+(file|document|order))|double[-\s]?check|verify|re-?read|review\s+again)\b/i,
  /\b(according\s+to|based\s+on|from|in)\s+(the\s+)?(court\s+order|order|document|file|pdf|upload)\b/i,
];

const DOCUMENT_FOLLOW_UP_PATTERNS = [
  /\b(deadline|due\s+date|obligation|requirement|custody|visitation|possession|conservatorship|injunction|restriction|clause|paragraph|section|page|signed|ordered)\b/i,
  /\b(what|when|where|who|does|did|can|should|must|shall).{0,80}\b(it|that|the\s+(order|document|file|pdf))\b/i,
  /\b(it|that|the\s+(order|document|file|pdf)).{0,80}\b(say|state|require|mean|allow|prohibit|mention|include)\b/i,
];

/** Return true when a later chat turn likely needs a stored uploaded document reloaded. */
export function messageReferencesStoredDocument(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return false;

  return (
    EXPLICIT_DOCUMENT_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    DOCUMENT_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
