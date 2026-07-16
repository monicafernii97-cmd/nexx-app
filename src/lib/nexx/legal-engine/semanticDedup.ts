const CITATION_PATTERN = /\[(?:p\.|pp\.)\s*\d+(?:\s*-\s*\d+)?\]/gi;
const MARKDOWN_PATTERN = /[*_>`#"“”‘’]/g;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'because', 'by', 'for', 'from', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'under', 'with',
]);

export function normalizeLegalProposition(value: string) {
  return value
    .replace(CITATION_PATTERN, ' ')
    .replace(MARKDOWN_PATTERN, ' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function propositionTokens(value: string) {
  return new Set(
    normalizeLegalProposition(value)
      .split(' ')
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  );
}

export function legalPropositionSimilarity(left: string, right: string) {
  const a = propositionTokens(left);
  const b = propositionTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

export function semanticallyEquivalentLegalText(left: string, right: string, threshold = 0.82) {
  const normalizedLeft = normalizeLegalProposition(left);
  const normalizedRight = normalizeLegalProposition(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    const shorter = Math.min(normalizedLeft.length, normalizedRight.length);
    const longer = Math.max(normalizedLeft.length, normalizedRight.length);
    if (shorter / longer >= 0.68) return true;
  }
  return legalPropositionSimilarity(left, right) >= threshold;
}

export function uniqueLegalPropositions(values: Array<string | null | undefined>, threshold = 0.82) {
  const result: string[] = [];
  for (const value of values) {
    const clean = value?.trim();
    if (!clean) continue;
    if (result.some((existing) => semanticallyEquivalentLegalText(existing, clean, threshold))) continue;
    result.push(clean);
  }
  return result;
}

export function repeatedLegalPropositions(markdown: string, threshold = 0.82) {
  const analysisBody = markdown
    .split(/\n(?:You can say:|\*\*Suggested reply:\*\*|Neutral draft:|Firmer version:)/i)[0];
  const sentences = analysisBody
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((value) => value.replace(/^\s*(?:[-*]|\d+\.)\s*/, '').trim())
    .filter((value) => value.length >= 28 && !/^\*\*[^*]+:\*\*$/.test(value));
  const duplicates: Array<[string, string]> = [];
  for (let index = 0; index < sentences.length; index += 1) {
    for (let compare = index + 1; compare < sentences.length; compare += 1) {
      if (semanticallyEquivalentLegalText(sentences[index], sentences[compare], threshold)) {
        duplicates.push([sentences[index], sentences[compare]]);
      }
    }
  }
  return duplicates;
}
