import { describe, expect, it } from 'vitest';
import {
  type LegalDocumentAnswer,
  type LegalDocumentSourcePacket,
  verifyLegalDocumentAnswer,
} from '../legalDocumentAnswer';

const sourcePackets: LegalDocumentSourcePacket[] = [
  {
    sourceId: 'src_001',
    fileId: 'file_1',
    fileName: 'Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_1',
    pageStart: 4,
    pageEnd: 4,
    blockIds: ['block_1'],
    text: 'It is ORDERED that Respondent shall pay $500 no later than June 14, 2026.',
    confidence: 0.97,
  },
];

function answer(overrides: Partial<LegalDocumentAnswer> = {}): LegalDocumentAnswer {
  return {
    answerType: 'direct_quote',
    answer: 'The order requires payment by June 14, 2026.',
    claims: [
      {
        claim: 'The order requires payment by June 14, 2026.',
        claimType: 'document_fact',
        sourceIds: ['src_001'],
      },
    ],
    citations: [
      {
        sourceId: 'src_001',
        fileId: 'file_1',
        fileName: 'Final Order.pdf',
        memoryGenerationId: 'gen_1',
        chunkId: 'chunk_1',
        pageStart: 4,
        pageEnd: 4,
        blockIds: ['block_1'],
        quotedText: 'Respondent shall pay $500 no later than June 14, 2026.',
        confidence: 0.97,
        warning: null,
      },
    ],
    warnings: [],
    unsupportedClaims: [],
    notFoundReason: null,
    ...overrides,
  };
}

describe('verifyLegalDocumentAnswer', () => {
  it('passes sourced claims with quotes found in source packets', () => {
    const result = verifyLegalDocumentAnswer(answer(), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations).toEqual([
      {
        sourceId: 'src_001',
        chunkId: 'chunk_1',
        quotedText: 'Respondent shall pay $500 no later than June 14, 2026.',
        citationVerifierStatus: 'verified',
      },
    ]);
  });

  it('blocks document factual claims without a source id', () => {
    const result = verifyLegalDocumentAnswer(answer({
      claims: [{ claim: 'The order requires payment.', claimType: 'document_fact', sourceIds: [] }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toContain('missing sources');
  });

  it('blocks quoted text that is not present in the cited source packet', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        quotedText: 'Respondent shall transfer sole custody immediately.',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toContain('not found');
  });

  it('allows not-found answers without citations when the sources do not support the answer', () => {
    const result = verifyLegalDocumentAnswer(answer({
      answerType: 'not_found',
      answer: 'I do not see that in the available extracted text.',
      claims: [],
      citations: [],
      notFoundReason: 'term_not_found',
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
  });
});
