const GENERIC_CANONICAL_PATTERNS = [
  /^here are the key provisions in the order\.?$/i,
  /^here is what the visible order language supports\.?$/i,
  /^the provision written specifically for this event applies/i,
  /^the signed order language should be followed as written/i,
  /^follow the order as written\.?$/i,
  /^the specific provision applies\.?$/i,
];

export function isGenericCanonicalLegalAnswer(value: string) {
  const text = value.replace(/\s+/g, ' ').trim();
  return GENERIC_CANONICAL_PATTERNS.some((pattern) => pattern.test(text));
}
