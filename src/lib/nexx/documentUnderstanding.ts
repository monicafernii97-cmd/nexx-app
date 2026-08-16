export type DocumentUnderstandingFinding = {
  category: string;
  title: string;
  detail: string;
  quote: string;
  sourceIds: string[];
};

export type DocumentUnderstandingPayload = {
  overview: string;
  findings: DocumentUnderstandingFinding[];
  uncertainties: string[];
};

export type UnderstandingSourceChunk = {
  chunkIndex: number;
  text: string;
  pageStart?: number;
  pageEnd?: number;
};

export function understandingSourceIndex(sourceId: string) {
  const match = /^SOURCE_CHUNK_(\d+)$/.exec(sourceId);
  return match ? Number(match[1]) : null;
}

function normalizeEvidence(value: string) {
  return value.toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
}

export function verifyDocumentUnderstanding(args: {
  payload: DocumentUnderstandingPayload;
  chunks: UnderstandingSourceChunk[];
  provenance: { sourceChunkStart: number; sourceChunkEnd: number; sourceChunkCount: number };
}) {
  const errors: string[] = [];
  const expectedIndexes = args.chunks.map((chunk) => chunk.chunkIndex).sort((a, b) => a - b);
  const contiguous = expectedIndexes.every((index, position) => index === position);
  if (!contiguous || args.provenance.sourceChunkStart !== 0 ||
      args.provenance.sourceChunkEnd !== args.chunks.length - 1 ||
      args.provenance.sourceChunkCount !== args.chunks.length) {
    errors.push('Understanding provenance does not cover every canonical chunk contiguously.');
  }
  const chunksByIndex = new Map(args.chunks.map((chunk) => [chunk.chunkIndex, chunk]));
  for (const finding of args.payload.findings) {
    const indexes = finding.sourceIds.map(understandingSourceIndex);
    if (indexes.length === 0 || indexes.some((index) => index === null || !chunksByIndex.has(index))) {
      errors.push(`Finding has an invalid source ID: ${finding.title}`);
      continue;
    }
    const quote = normalizeEvidence(finding.quote);
    if (quote.length < 8 || !indexes.some((index) => normalizeEvidence(chunksByIndex.get(index!)!.text).includes(quote))) {
      errors.push(`Finding quote is not present in its cited source: ${finding.title}`);
    }
  }
  return {
    passed: errors.length === 0,
    errors,
    checks: errors.length === 0
      ? ['contiguous_chunk_provenance', 'all_source_ids_valid', 'all_finding_quotes_verified']
      : [],
  };
}

function pageCitation(pageStart?: number, pageEnd?: number) {
  if (!pageStart) return '[source location unavailable]';
  return pageEnd && pageEnd !== pageStart ? `[pp. ${pageStart}-${pageEnd}]` : `[p. ${pageStart}]`;
}

export function renderVerifiedDocumentReview(args: {
  filename: string;
  payload: DocumentUnderstandingPayload;
  chunks: UnderstandingSourceChunk[];
}) {
  const byIndex = new Map(args.chunks.map((chunk) => [chunk.chunkIndex, chunk]));
  const sections = new Map<string, DocumentUnderstandingFinding[]>();
  for (const finding of args.payload.findings) {
    const key = finding.category.trim() || 'Other provisions';
    sections.set(key, [...(sections.get(key) ?? []), finding]);
  }
  const lines = [`# Full-document review: ${args.filename}`, '', args.payload.overview.trim(), ''];
  for (const [category, findings] of sections) {
    lines.push(`## ${category}`, '');
    for (const finding of findings) {
      const pages = finding.sourceIds
        .map(understandingSourceIndex)
        .filter((index): index is number => index !== null)
        .map((index) => byIndex.get(index))
        .filter((chunk): chunk is UnderstandingSourceChunk => Boolean(chunk));
      const pageStart = pages.reduce<number | undefined>((min, chunk) =>
        chunk.pageStart === undefined ? min : min === undefined ? chunk.pageStart : Math.min(min, chunk.pageStart), undefined);
      const pageEnd = pages.reduce<number | undefined>((max, chunk) => {
        const end = chunk.pageEnd ?? chunk.pageStart;
        return end === undefined ? max : max === undefined ? end : Math.max(max, end);
      }, undefined);
      lines.push(`### ${finding.title} ${pageCitation(pageStart, pageEnd)}`, '', finding.detail.trim(), '', `> ${finding.quote.trim()}`, '');
    }
  }
  if (args.payload.uncertainties.length > 0) {
    lines.push('## Uncertainties and items to verify', '', ...args.payload.uncertainties.map((item) => `- ${item}`), '');
  }
  lines.push('---', `Coverage: all ${args.chunks.length} canonical document chunks were included in this review. Page citations refer to the extracted document.`);
  return lines.join('\n').trim();
}
