import { describe, expect, it } from 'vitest';
import {
  mergeDocumentUnderstandingPayloads,
  renderVerifiedDocumentReview,
  verifyDocumentUnderstanding,
  verifyDocumentUnderstandingNode,
} from '../documentUnderstanding';

const chunks = [
  { chunkIndex: 0, text: 'The Court ORDERS Mother to deliver the child on Friday.', pageStart: 1, pageEnd: 1 },
  { chunkIndex: 1, text: 'Father shall pay $250 no later than June 4, 2026.', pageStart: 2, pageEnd: 2 },
  { chunkIndex: 2, text: 'All other relief is denied. SIGNED May 1, 2026.', pageStart: 3, pageEnd: 3 },
];

const payload = {
  overview: 'The order governs possession, payment, and remaining relief.',
  findings: [
    { category: 'Payment', title: 'Payment deadline', detail: 'Father must pay $250 by June 4, 2026.', quote: 'shall pay $250 no later than June 4, 2026', sourceIds: ['SOURCE_CHUNK_1'] },
  ],
  uncertainties: [],
};

describe('document understanding verification', () => {
  it('deterministically preserves distinct findings and collapses only exact duplicates', () => {
    const secondFinding = {
      category: 'Relief',
      title: 'Remaining relief',
      detail: 'The court denied all other relief.',
      quote: 'All other relief is denied',
      sourceIds: ['SOURCE_CHUNK_2'],
    };
    const merged = mergeDocumentUnderstandingPayloads([
      { ...payload, uncertainties: ['Check the signed original.'] },
      { overview: 'Second node.', findings: [payload.findings[0], secondFinding], uncertainties: ['Check the signed original.'] },
    ]);
    expect(merged.findings).toEqual([payload.findings[0], secondFinding]);
    expect(merged.uncertainties).toEqual(['Check the signed original.']);
    expect(merged.overview).toContain('2 distinct source-verified findings');
  });

  it('accepts complete provenance and exact source evidence', () => {
    expect(verifyDocumentUnderstanding({
      payload, chunks, provenance: { sourceChunkStart: 0, sourceChunkEnd: 2, sourceChunkCount: 3 },
    })).toMatchObject({ passed: true, errors: [] });
  });

  it('fails closed for a missing source unit', () => {
    const result = verifyDocumentUnderstanding({
      payload, chunks: [chunks[0], chunks[2]],
      provenance: { sourceChunkStart: 0, sourceChunkEnd: 2, sourceChunkCount: 2 },
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('contiguously');
  });

  it('rejects invented quotations and invalid source IDs', () => {
    const result = verifyDocumentUnderstanding({
      payload: { ...payload, findings: [{ ...payload.findings[0], quote: 'an invented requirement', sourceIds: ['SOURCE_CHUNK_99'] }] },
      chunks, provenance: { sourceChunkStart: 0, sourceChunkEnd: 2, sourceChunkCount: 3 },
    });
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('invalid source ID');
  });

  it('strictly validates a nonzero contiguous map-node range', () => {
    expect(verifyDocumentUnderstandingNode({
      payload,
      chunks: [chunks[1]],
      provenance: { sourceChunkStart: 1, sourceChunkEnd: 1, sourceChunkCount: 1 },
    })).toMatchObject({ passed: true, errors: [] });
    expect(verifyDocumentUnderstandingNode({
      payload,
      chunks: [chunks[1]],
      provenance: { sourceChunkStart: 0, sourceChunkEnd: 1, sourceChunkCount: 1 },
    }).passed).toBe(false);
  });

  it('renders page citations and an explicit complete-coverage receipt', () => {
    const rendered = renderVerifiedDocumentReview({
      filename: 'Order.pdf', payload, chunks,
      sourceUrl: '/api/documents/source/file_123',
      coverageReceipt: { unitKind: 'page', unitsRead: 3, unitsExpected: 3, ocrUnits: 1, lowConfidenceUnits: 1 },
    });
    expect(rendered.startsWith('I received and processed Order.pdf. I read 3 of 3 pages.')).toBe(true);
    expect(rendered).toContain('OCR was used on 1 page.');
    expect(rendered).toContain('1 passage had low extraction confidence');
    expect(rendered).toContain('Payment deadline [p. 2]');
    expect(rendered).toContain('[p. 2](/api/documents/source/file_123#page=2)');
    expect(rendered).toContain('all 3 canonical document chunks');
  });
});
