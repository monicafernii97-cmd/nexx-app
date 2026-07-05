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
  if (hasInternalKeyAssignment(trimmed)) return true;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;

  try {
    return valueContainsInternalKey(JSON.parse(trimmed));
  } catch {
    return false;
  }
}
