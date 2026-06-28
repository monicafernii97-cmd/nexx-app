import { describe, expect, it } from 'vitest';
import {
  type LegalDocumentAnswer,
  type LegalDocumentSourcePacket,
  validateLegalDocumentAnswerShape,
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

  it('blocks generation-backed citations that omit the memory generation id', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        memoryGenerationId: null,
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toContain('generation missing');
  });

  it('blocks reordered quotes even when the same words appear in the source packet', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        quotedText: 'June 14 2026 Respondent $500 shall pay no later than',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(false);
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

  it('rejects malformed warning and not-found fields in documentAnswer shape validation', () => {
    expect(validateLegalDocumentAnswerShape({
      ...answer(),
      warnings: [42],
    })).toBe(false);
    expect(validateLegalDocumentAnswerShape({
      ...answer(),
      notFoundReason: { code: 'bad_shape' },
    })).toBe(false);
  });
});
