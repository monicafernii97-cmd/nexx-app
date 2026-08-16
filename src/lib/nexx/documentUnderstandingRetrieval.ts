import { understandingSourceIndex, type DocumentUnderstandingPayload } from './documentUnderstanding';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being',
  'can', 'could', 'document', 'does', 'from', 'have', 'into', 'just', 'order', 'should',
  'that', 'the', 'their', 'then', 'there', 'they', 'this', 'what', 'when', 'where', 'which',
  'with', 'would', 'your',
]);

function terms(value: string) {
  return Array.from(new Set(value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9$]+/g) ?? []))
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

/** Parse only the bounded DUR fields needed for retrieval; malformed records are ignored. */
export function parseUnderstandingForRetrieval(value?: string): DocumentUnderstandingPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DocumentUnderstandingPayload>;
    if (typeof parsed.overview !== 'string' || !Array.isArray(parsed.findings) || !Array.isArray(parsed.uncertainties)) return null;
    if (!parsed.findings.every((finding) => finding && typeof finding.category === 'string' &&
      typeof finding.title === 'string' && typeof finding.detail === 'string' &&
      typeof finding.quote === 'string' && Array.isArray(finding.sourceIds) &&
      finding.sourceIds.every((sourceId) => typeof sourceId === 'string'))) return null;
    return parsed as DocumentUnderstandingPayload;
  } catch {
    return null;
  }
}

/**
 * Use the verified whole-document map as a semantic bridge into canonical chunks.
 * The returned indexes are still resolved to original chunks before prompting, so
 * the DUR never becomes an uncited alternate source of truth.
 */
export function selectUnderstandingSourceIndexes(args: {
  payload: DocumentUnderstandingPayload;
  message: string;
  maxFindings?: number;
  maxSourceIndexes?: number;
}) {
  const queryTerms = terms(args.message);
  const ranked = args.payload.findings.map((finding, index) => {
    const titleTerms = new Set(terms(`${finding.category} ${finding.title}`));
    const detailTerms = new Set(terms(`${finding.detail} ${finding.quote}`));
    const titleOverlap = queryTerms.filter((term) => titleTerms.has(term)).length;
    const detailOverlap = queryTerms.filter((term) => detailTerms.has(term)).length;
    return { finding, index, score: titleOverlap * 12 + detailOverlap * 5 };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const positive = ranked.filter((item) => item.score > 0);
  const selected = (positive.length > 0 ? positive : ranked).slice(0, args.maxFindings ?? 8);
  const indexes: number[] = [];
  const seen = new Set<number>();
  for (const { finding } of selected) {
    for (const sourceId of finding.sourceIds) {
      const index = understandingSourceIndex(sourceId);
      if (index === null || seen.has(index)) continue;
      seen.add(index);
      indexes.push(index);
      if (indexes.length >= (args.maxSourceIndexes ?? 10)) return indexes;
    }
  }
  return indexes;
}
