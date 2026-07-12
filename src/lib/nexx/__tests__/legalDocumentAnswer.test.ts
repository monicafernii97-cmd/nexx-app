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

function sectionBetween(content: string, startHeading: string, endHeading: string) {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
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
      answer: 'I do not see that in the visible order language.',
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
    expect(bestEffort.answer).toBe('Here are the key provisions in the order.');
    expect(bestEffort.claims).toHaveLength(1);
    expect(verification.passed).toBe(true);
    expect(content).toContain('## Executive Summary');
    expect(content).toContain('[p. 4]');
    expect(content).not.toContain('I found usable court-order language');
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

  it('leads targeted best-effort answers with the strongest supported finding', () => {
    const bestEffort = buildBestEffortLegalDocumentAnswerFromSources(
      sourcePackets,
      undefined,
      { isTargetedQuestion: true }
    );

    expect(bestEffort.answer).toBe('It is ORDERED that Respondent shall pay $500 no later than June 14, 2026.');
    expect(bestEffort.answer).not.toContain('I found usable');
    expect(bestEffort.answer).not.toContain('organized the visible provisions');
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
    expect(content).toContain('## Highest-Priority Findings');
    expect(content).toContain('## Key Obligations');
    expect(content).toContain('## Deadlines');
    expect(content).toContain('## Recommended Next Steps');
    expect(content).toContain('[p. 4]');
    expect(content).toContain('Create a deadline checklist from the cited provisions.');
    expect(content).toContain('Prepare filing language from the supported facts');
    expect(content).toContain('Respondent \\| shall pay $500 no later than June 14');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
    expect(content).not.toContain('Sources used:');
    expect(content).not.toContain('Final Order.pdf, p.');
    expect(content).not.toContain('## Risks and Cautions');
    expect(content).not.toContain('## Source Details');
    expect(content).not.toContain('chunkId should never be shown');
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

  it('caps highest-priority findings at five while keeping additional obligations visible', () => {
    const claims = Array.from({ length: 6 }, (_, index) => ({
      claim: `Provision ${index + 1} requires a specific action.`,
      claimType: 'document_fact' as const,
      sourceIds: ['src_001'],
    }));
    const content = renderCourtOrderAnalysisMarkdown(answer({ claims }), sourcePackets, 'Fallback answer');

    const prioritySection = sectionBetween(content, '## Highest-Priority Findings', '## Key Obligations');
    const obligationsSection = sectionBetween(content, '## Key Obligations', '## Deadlines');

    expect(prioritySection).toContain('**Priority 1.** Provision 1 requires a specific action. [p. 4]');
    expect(prioritySection).toContain('**Priority 5.** Provision 5 requires a specific action. [p. 4]');
    expect(prioritySection).not.toContain('Provision 6 requires a specific action.');
    expect(obligationsSection).toContain('Provision 6 requires a specific action. [p. 4]');
  });

  it('extracts written-out deadline timing from supported claims', () => {
    const content = renderCourtOrderAnalysisMarkdown(answer({
      claims: [
        {
          claim: 'The order requires each party to provide updated residence and employment information within seven days of a change.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires notice to the other party within fourteen days if a party applies for a passport for the child.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires notice within twenty-five business days after service.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires exchange within thirty one calendar days after request.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires filing within sixty days after notice.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires review within one hundred eighty days after entry.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
      ],
    }), sourcePackets, 'Fallback answer');

    const deadlinesSection = sectionBetween(content, '## Deadlines', '## Recommended Next Steps');

    expect(deadlinesSection).toContain('| The order requires each party to provide updated residence and employment information within seven days of a change. | within seven days | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires notice to the other party within fourteen days if a party applies for a passport for the child. | within fourteen days | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires notice within twenty-five business days after service. | within twenty-five business days | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires exchange within thirty one calendar days after request. | within thirty one calendar days | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires filing within sixty days after notice. | within sixty days | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires review within one hundred eighty days after entry. | within one hundred eighty days | [p. 4] |');
    expect(deadlinesSection).not.toContain('Not stated in the visible order language');

    const hundredContent = renderCourtOrderAnalysisMarkdown(answer({
      claims: [
        {
          claim: 'The order requires a supplemental filing within one hundred twenty business days after entry.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires a status update within one hundred and five calendar days after review.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
      ],
    }), sourcePackets, 'Fallback answer');
    const hundredDeadlinesSection = sectionBetween(hundredContent, '## Deadlines', '## Recommended Next Steps');

    expect(hundredDeadlinesSection).toContain('| The order requires a supplemental filing within one hundred twenty business days after entry. | within one hundred twenty business days | [p. 4] |');
    expect(hundredDeadlinesSection).toContain('| The order requires a status update within one hundred and five calendar days after review. | within one hundred and five calendar days | [p. 4] |');
    expect(hundredDeadlinesSection).not.toContain('Not stated in the visible order language');
  });

  it('extracts possession schedule timing instead of marking visible timing as not stated', () => {
    const content = renderCourtOrderAnalysisMarkdown(answer({
      claims: [
        {
          claim: 'If Friday is a federal, state, or local holiday, or a student holiday or teacher in-service day, the regular weekend period begins at 6:00 p.m. on Thursday.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The Father\'s Day possession period runs from 6:00 p.m. on the Friday preceding Father\'s Day until 8:00 a.m. on the Monday after Father\'s Day.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The specific Father\'s Day provision controls over the general standard weekend schedule during Father\'s Day weekend.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
      ],
    }), sourcePackets, 'Fallback answer');

    const deadlinesSection = sectionBetween(content, '## Deadlines', '## Recommended Next Steps');

    expect(deadlinesSection).toContain('| If Friday is a federal, state, or local holiday, or a student holiday or teacher in-service day, the regular weekend period begins at 6:00 p.m. on Thursday. | weekend period begins at 6:00 p.m. on Thursday | [p. 4] |');
    expect(deadlinesSection).toContain('| The Father\'s Day possession period runs from 6:00 p.m. on the Friday preceding Father\'s Day until 8:00 a.m. on the Monday after Father\'s Day. | from 6:00 p.m. on the Friday preceding Father\'s Day until 8:00 a.m. on the Monday after Father\'s Day | [p. 4] |');
    expect(deadlinesSection).not.toContain('The specific Father\'s Day provision controls over the general standard weekend schedule');
    expect(deadlinesSection).not.toContain('Not stated in the visible order language');
  });

  it('extracts hyphenated day-count deadlines', () => {
    const content = renderCourtOrderAnalysisMarkdown(answer({
      claims: [
        {
          claim: 'The order requires 10-day notice before international travel.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'The order requires seven-business-day notice before a schedule change.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
      ],
    }), sourcePackets, 'Fallback answer');

    const deadlinesSection = sectionBetween(content, '## Deadlines', '## Recommended Next Steps');

    expect(deadlinesSection).toContain('| The order requires 10-day notice before international travel. | 10-day | [p. 4] |');
    expect(deadlinesSection).toContain('| The order requires seven-business-day notice before a schedule change. | seven-business-day | [p. 4] |');
    expect(deadlinesSection).not.toContain('Not stated in the visible order language');
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

    expect(content).toContain('The order requires payment by June 14, 2026. [p. 4]');
    expect(content).toContain('**Why:**');
    expect(content).not.toContain('**Practical meaning:**');
    expect(content).toContain('[p. 4]');
    expect(content).not.toContain('# Court Order Analysis');
    expect(content).not.toContain('## Direct Answer');
    expect(content).not.toContain('## What I Found in the Order');
    expect(content).not.toContain('## Cautions');
    expect(content).not.toContain('## Source Details');
    expect(content).not.toContain('may control');
    expect(content).not.toContain('licensed attorney');
    expect(content).not.toContain('Use the signed order language');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
  });

  it('does not duplicate the direct answer under why when no claims are present', () => {
    const direct = "The order does not say Father's Day starts on Thursday.";
    const content = renderTargetedLegalDocumentAnswerMarkdown(answer({
      answer: direct,
      claims: [],
      citations: [],
    }), sourcePackets, 'Fallback answer');

    expect(content).toContain(direct);
    expect(content).not.toContain('**Why:**');
    expect(content.indexOf(direct)).toBe(content.lastIndexOf(direct));
    expect(content).not.toContain('**Practical meaning:**');
  });

  it('renders not-found targeted answers with plain filing-readiness language only', () => {
    const content = renderTargetedLegalDocumentAnswerMarkdown(answer({
      answerType: 'not_found',
      answer: "I do not see a Father's Day provision in the visible order language.",
      claims: [],
      citations: [],
      notFoundReason: 'term_not_found',
    }), sourcePackets, 'Fallback answer');

    expect(content).toContain("I do not see a Father's Day provision in the visible order language.");
    expect(content).toContain('I would not rely on a missing or unreadable clause for a filing without a clearer copy or the exact page language.');
    expect(content).not.toContain('**Why:**');
    expect(content).not.toContain('## Cautions');
    expect(content).not.toContain('Source Details');
    expect(content).not.toContain('OCR');
    expect(content).not.toContain('verifier');
  });

  it('renders needs-review targeted answers with review-needed practical meaning', () => {
    const content = renderTargetedLegalDocumentAnswerMarkdown(answer({
      answerType: 'needs_review',
      answer: 'The visible language points to Friday at 6:00 p.m., but the exact signed-order clause should be checked before filing.',
      claims: [{
        claim: "Father's Day possession begins at 6:00 p.m. on the Friday preceding Father's Day.",
        claimType: 'interpretation',
        sourceIds: ['src_001'],
      }],
    }), sourcePackets, 'Fallback answer');

    expect(content).toContain('The visible language points to Friday at 6:00 p.m.');
    expect(content).toContain('I can work from the visible language, but I would review the exact signed-order wording before using this for filing or enforcement.');
    expect(content).not.toContain('If the order clearly gives a specific rule, state that rule directly.');
    expect(content).not.toContain('## Cautions');
    expect(content).not.toContain('Source Details');
    expect(content).not.toContain('verifier');
  });
});
