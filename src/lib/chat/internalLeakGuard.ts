export const INTERNAL_LEAK_KEYS = [
  'sourceId',
  'fileId',
  'fileName',
  'memoryGenerationId',
  'chunkId',
  'pageStart',
  'pageEnd',
  'blockIds',
  'quotedText',
  'documentAnswer',
] as const;

const INTERNAL_LEAK_KEY_SET = new Set<string>(INTERNAL_LEAK_KEYS);
const LEGACY_SOURCE_ID_PATTERN = /\bsrc_\d{3,}\b/i;
const LEGACY_SOURCE_ID_TOKEN_PATTERN = /\bsrc_\d{3,}\b/gi;
const LEGACY_SOURCE_LINE_PATTERN = /^\s*src_\d{3,}\s*:\s*.*$/gim;
const LEGACY_SOURCE_PAREN_PATTERN = /\s*\(\s*src_\d{3,}\s*\)/gi;
const SOURCE_SECTION_PATTERN = /(?:^|\n)(?:#{1,6}\s*)?Sources:?\s*\n/i;
const PDF_FILENAME_PATTERN = /\.pdf\b/i;
const PAGE_LOCATION_PATTERN = /,\s*p{1,2}\.\s*\d+/i;
const SOURCE_ID_PREFIX_PATTERN = /\bsrc_\d{3,}\s*:/i;
const SOURCE_ID_PAREN_PREFIX_PATTERN = /\(src_\d{3,}\)\s*:/i;
const BARE_INTERNAL_KEY_ASSIGNMENT_PATTERNS = INTERNAL_LEAK_KEYS.map(
  (key) => new RegExp(`(?:^|[\\s{\\[,])${key}\\s*:`)
);
const JSON_INTERNAL_KEY_MARKER_PATTERNS = INTERNAL_LEAK_KEYS.map(
  (key) => new RegExp(`"${key}"\\s*:`)
);

function valueContainsInternalKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(valueContainsInternalKey);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (INTERNAL_LEAK_KEY_SET.has(key) || valueContainsInternalKey(nestedValue)) {
      return true;
    }
  }

  return false;
}

function hasInternalKeyAssignment(content: string) {
  return INTERNAL_LEAK_KEYS.some((key) => {
    const quotedKey = `"${key}"`;
    let index = content.indexOf(quotedKey);
    while (index >= 0) {
      const afterKey = content.slice(index + quotedKey.length).trimStart();
      if (afterKey.startsWith(':') && hasJsonKeyContext(content, index) && startsWithJsonValue(afterKey.slice(1))) {
        return true;
      }
      index = content.indexOf(quotedKey, index + quotedKey.length);
    }
    return false;
  });
}

function hasBareInternalKeyAssignment(content: string) {
  return BARE_INTERNAL_KEY_ASSIGNMENT_PATTERNS.some((pattern) => pattern.test(content));
}

function hasJsonInternalKeyMarker(content: string) {
  return JSON_INTERNAL_KEY_MARKER_PATTERNS.some((pattern) => pattern.test(content));
}

function looksStructuredForBareKeys(content: string) {
  return content.startsWith('{')
    || content.startsWith('[')
    || content.startsWith('```')
    || content.includes('\n')
    || content.includes('","')
    || /[{}[\]",]/.test(content);
}

function stripSourceSection(content: string) {
  const sourceSectionMatch = content.match(SOURCE_SECTION_PATTERN);
  if (sourceSectionMatch?.index === undefined) return content;
  return content.slice(0, sourceSectionMatch.index).trimEnd();
}

function dropLegacySourceCitationLines(content: string) {
  return content
    .split('\n')
    .filter((line) => {
      if (!LEGACY_SOURCE_ID_PATTERN.test(line)) return true;
      return !(
        PDF_FILENAME_PATTERN.test(line)
        || PAGE_LOCATION_PATTERN.test(line)
        || SOURCE_ID_PREFIX_PATTERN.test(line)
        || SOURCE_ID_PAREN_PREFIX_PATTERN.test(line)
      );
    })
    .join('\n');
}

function hasJsonKeyContext(content: string, keyIndex: number) {
  for (let index = keyIndex - 1; index >= 0; index -= 1) {
    const char = content[index];
    if (!isWhitespace(char)) {
      return char === '{' || char === '[' || char === ',';
    }
  }

  return true;
}

function startsWithJsonValue(value: string) {
  const trimmed = value.trimStart();
  if (!trimmed) return false;

  const first = trimmed[0];
  if (first === '"' || first === '{' || first === '[') {
    return true;
  }

  if (first === '-' || isDigit(first)) {
    return startsWithJsonNumber(trimmed);
  }

  return startsWithJsonLiteral(trimmed, 'true')
    || startsWithJsonLiteral(trimmed, 'false')
    || startsWithJsonLiteral(trimmed, 'null');
}

function startsWithJsonLiteral(value: string, literal: string) {
  return value.startsWith(literal) && hasJsonValueBoundary(value, literal.length);
}

function startsWithJsonNumber(value: string) {
  let index = 0;

  if (value[index] === '-') index += 1;
  if (!isDigit(value[index])) return false;

  if (value[index] === '0') {
    index += 1;
  } else {
    while (isDigit(value[index])) index += 1;
  }

  if (value[index] === '.') {
    index += 1;
    if (!isDigit(value[index])) return false;
    while (isDigit(value[index])) index += 1;
  }

  if (value[index] === 'e' || value[index] === 'E') {
    index += 1;
    if (value[index] === '+' || value[index] === '-') index += 1;
    if (!isDigit(value[index])) return false;
    while (isDigit(value[index])) index += 1;
  }

  return hasJsonValueBoundary(value, index);
}

function hasJsonValueBoundary(value: string, index: number) {
  if (index >= value.length) return true;
  const char = value[index];
  return isWhitespace(char) || char === ',' || char === '}' || char === ']';
}

function isDigit(char: string | undefined) {
  return char !== undefined && char >= '0' && char <= '9';
}

function isWhitespace(char: string) {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}

export function looksLikeInternalStructuredPayload(content: string) {
  if (!content) return false;

  const trimmed = content.trim();
  if (!trimmed) return false;
  if (LEGACY_SOURCE_ID_PATTERN.test(trimmed)) return true;
  if (looksStructuredForBareKeys(trimmed) && hasBareInternalKeyAssignment(trimmed)) return true;
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && hasJsonInternalKeyMarker(trimmed)) return true;
  if (hasInternalKeyAssignment(trimmed)) return true;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;

  try {
    return valueContainsInternalKey(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

export function sanitizeVisibleAssistantContent(content: string): string | null {
  if (!content) return '';

  const trimmed = content.trim();
  if (!trimmed) return '';

  const sourceStripped = stripSourceSection(trimmed);
  const hadSourceSection = sourceStripped !== trimmed;
  const hasLegacySourceId = LEGACY_SOURCE_ID_PATTERN.test(trimmed);

  if (!hadSourceSection && !hasLegacySourceId) {
    return looksLikeInternalStructuredPayload(trimmed) ? null : content;
  }

  const sanitized = dropLegacySourceCitationLines(sourceStripped)
    .replace(LEGACY_SOURCE_LINE_PATTERN, '')
    .replace(LEGACY_SOURCE_PAREN_PATTERN, '')
    .replace(LEGACY_SOURCE_ID_TOKEN_PATTERN, 'source reference')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!sanitized) return null;
  return looksLikeInternalStructuredPayload(sanitized) ? null : sanitized;
}
