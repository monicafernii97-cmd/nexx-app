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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    const escapedKey = escapeRegExp(key);
    const assignmentPattern = new RegExp(`(?:^|[\\s,{\\[])(?:"${escapedKey}"|${escapedKey})\\s*:`);
    return assignmentPattern.test(content);
  });
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
