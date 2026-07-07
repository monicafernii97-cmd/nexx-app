import { describe, expect, it } from 'vitest';
import {
  type LegalDocumentAnswer,
  type LegalDocumentSourcePacket,
  buildBestEffortLegalDocumentAnswerFromSources,
  validateLegalDocumentAnswerShape,
  renderCourtOrderAnalysisMarkdown,
  renderTargetedLegalDocumentAnswerMarkdown,
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
        pageStart: 4,
        pageEnd: 4,
        supports: 'Respondent shall pay $500 no later than June 14, 2026.',
        confidence: 'high',
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

  it('uses a source preview when citation supports text is null', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        sourceId: 'src_001',
        pageStart: 4,
        pageEnd: 4,
        supports: null,
        confidence: 'high',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations[0]?.quotedText).toBe(sourcePackets[0].text);
  });

  it('uses a source preview when citation supports text is omitted', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        sourceId: 'src_001',
        pageStart: 4,
        pageEnd: 4,
        confidence: 'high',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations[0]?.quotedText).toBe(sourcePackets[0].text);
  });

  it('passes sourced claims when the model omits duplicate citation refs', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations).toEqual([
      {
        sourceId: 'src_001',
        chunkId: 'chunk_1',
        quotedText: sourcePackets[0].text,
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

  it('blocks procedural deadline claims without a source id', () => {
    const result = verifyLegalDocumentAnswer(answer({
      claims: [{ claim: 'Notice is due within 24 hours.', claimType: 'procedural', sourceIds: [] }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toContain('missing sources');
  });

  it('downgrades supporting text that is not present in the cited source packet', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        supports: 'Respondent shall transfer sole custody immediately.',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations[0]?.citationVerifierStatus).toBe('partial');
    expect(result.errors).toEqual([]);
  });

  it('downgrades reordered quotes even when the same words appear in the source packet', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        supports: 'June 14 2026 Respondent $500 shall pay no later than',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations[0]?.citationVerifierStatus).toBe('partial');
  });

  it('allows OCR-style punctuation differences when quote words remain in order', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        supports: 'Respondent shall pay 500 no later than June 14 2026',
      }],
    }), sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
  });

  it('downgrades loose quotes stitched from non-contiguous source text', () => {
    const result = verifyLegalDocumentAnswer(answer({
      citations: [{
        ...answer().citations[0],
        supports: 'Respondent shall pay $500 June 14 2026',
      }],
    }), [{
      ...sourcePackets[0],
      text: 'Respondent shall pay $500. The exchange location is described separately. The deadline is June 14, 2026.',
    }], {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });

    expect(result.passed).toBe(true);
    expect(result.verifiedCitations[0]?.citationVerifierStatus).toBe('partial');
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

describe('buildBestEffortLegalDocumentAnswerFromSources', () => {
  it('builds a grounded answer from extracted packets instead of a generic unsupported fallback', () => {
    const bestEffort = buildBestEffortLegalDocumentAnswerFromSources(sourcePackets);
    const verification = verifyLegalDocumentAnswer(bestEffort, sourcePackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
    });
    const content = renderCourtOrderAnalysisMarkdown(bestEffort, sourcePackets, 'Fallback answer');

    expect(bestEffort.answerType).toBe('summary');
    expect(bestEffort.claims).toHaveLength(1);
    expect(verification.passed).toBe(true);
    expect(content).toContain('## Executive Summary');
    expect(content).toContain('[p. 4]');
    expect(content).not.toContain('I cannot safely support');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
  });

  it('labels missing source confidence as low in fallback citations', () => {
    const bestEffort = buildBestEffortLegalDocumentAnswerFromSources([{
      ...sourcePackets[0],
      confidence: undefined,
    }]);

    expect(bestEffort.citations[0]?.confidence).toBe('low');
  });
});

describe('renderCourtOrderAnalysisMarkdown', () => {
  it('renders the required executive sections with compact citations and no internal metadata', () => {
    const content = renderCourtOrderAnalysisMarkdown(answer({
      claims: [
        {
          claim: 'Respondent | shall pay $500\nno later than June 14, 2026.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
      ],
      warnings: ['chunkId should never be shown to the user. Verify exact wording.'],
    }), sourcePackets, 'Fallback answer');

    expect(content).toContain('# Court Order Analysis');
    expect(content).toContain('## Executive Summary');
    expect(content).toContain('## Key Obligations');
    expect(content).toContain('## Deadlines');
    expect(content).toContain('## Risks and Cautions');
    expect(content).toContain('## Recommended Next Steps');
    expect(content).toContain('## Source Details');
    expect(content).toContain('[p. 4]');
    expect(content).toContain('Respondent \\| shall pay $500 no later than June 14');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
    expect(content).not.toContain('Sources used:');
    expect(content).not.toContain('Final Order.pdf, p.');
  });

  it('keeps no-page extracted-text answers quiet instead of showing source-review warnings', () => {
    const noPageSources: LegalDocumentSourcePacket[] = [{
      ...sourcePackets[0],
      pageStart: undefined,
      pageEnd: undefined,
      text: 'The conservators shall send child-related notices through AppClose within 24 hours.',
    }];
    const content = renderCourtOrderAnalysisMarkdown(answer({
      answer: 'The order requires AppClose notices within 24 hours.',
      claims: [{
        claim: 'The conservators shall send child-related notices through AppClose within 24 hours.',
        claimType: 'document_fact',
        sourceIds: ['src_001'],
      }],
      citations: [{
        sourceId: 'src_001',
        supports: 'The conservators shall send child-related notices through AppClose within 24 hours.',
        confidence: 'high',
      }],
    }), noPageSources, 'Fallback answer');

    expect(content).toContain('Order text');
    expect(content).not.toContain('Review source');
    expect(content).not.toContain('needs source review');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
  });
});

describe('renderTargetedLegalDocumentAnswerMarkdown', () => {
  it('renders targeted document questions as a direct answer with compact citations', () => {
    const content = renderTargetedLegalDocumentAnswerMarkdown(answer({
      answer: 'The order requires payment by June 14, 2026.',
      claims: [{
        claim: 'Respondent shall pay no later than June 14, 2026.',
        claimType: 'document_fact',
        sourceIds: ['src_001'],
      }],
    }), sourcePackets, 'Fallback answer');

    expect(content).toContain('## Direct Answer');
    expect(content).toContain('## What I Found in the Order');
    expect(content).toContain('## Practical Reading');
    expect(content).toContain('[p. 4]');
    expect(content).not.toContain('# Court Order Analysis');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
  });
});
