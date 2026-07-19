const EXTRACTION_DEBRIS_PATTERNS = [
  /--\s*\d+\s+of\s+\d+\s*--/i,
  /\b(?:page|pg\.?|p\.)\s*\d+\s+of\s+\d+\b/i,
  /\b(?:sourceId|chunkId|memoryGenerationId|blockIds|retrievalBuckets|documentAnswer|legalInterpretation)\b/i,
  /(?:^|\n)\s*\d+\.\s+[^\n]{0,80}(?:--|—\s*—)/,
  /\bas follows\s*:\s*\d+\.?\s*$/i,
];

const RAW_FRAGMENT_END_PATTERN = /(?:\b(?:and|or|the|a|an|of|to|by|for|with|beginning|ending|provided that)\b|[,;:])\s*$/i;

export function containsUserFacingExtractionDebris(value: string) {
  const text = value.trim();
  if (!text) return false;
  return EXTRACTION_DEBRIS_PATTERNS.some((pattern) => pattern.test(text));
}
export function isCompleteUserFacingLegalText(value: string, minimumLength = 12) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < minimumLength) return false;
  if (containsUserFacingExtractionDebris(text)) return false;
  if (RAW_FRAGMENT_END_PATTERN.test(text)) return false;
  if (/\.\.\.$/.test(text) || /…$/.test(text)) return false;
  return true;
}

export function isSafeCommunicationDraft(value: string) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!isCompleteUserFacingLegalText(text, 24)) return false;
  if (/\[(?:p\.|pp\.)\s*\d+/i.test(text)) return false;
  if (/\b[A-Z][A-Z'’-]{2,}(?:\s+[A-Z][A-Z'’-]{2,})+\b/.test(text)) return false;
  return true;
}
