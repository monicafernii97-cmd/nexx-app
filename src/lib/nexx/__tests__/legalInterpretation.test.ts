import { describe, expect, it } from 'vitest';
import type { LegalDocumentAnswer, LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import { detectDocumentReference } from '../documentReferenceDetection';
import { buildBestEffortLegalInterpretationFromDocumentAnswer } from '../legal-engine/bestEffortLegalInterpretation';
import { renderLegalInterpretationMarkdown } from '../legal-engine/legalInterpretationRenderer';
import type { LegalInterpretationAnswer } from '../legal-engine/legalInterpretationSchema';
import { validateLegalInterpretationAnswerShape } from '../legal-engine/legalInterpretationSchema';
import { verifyLegalInterpretationAnswer } from '../legal-engine/legalInterpretationVerifier';
import { validateAssistantResponse } from '../recovery/validators';

const sourcePackets: LegalDocumentSourcePacket[] = [
  {
    sourceId: 'src_001',
    fileId: 'file_1',
    fileName: 'Signed Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_1',
    blockIds: ['block_1'],
    pageStart: 5,
    pageEnd: 5,
    sectionHeading: 'Father\'s Day Possession',
    text: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
    confidence: 0.97,
  },
  {
    sourceId: 'src_002',
    fileId: 'file_1',
    fileName: 'Signed Final Order.pdf',
    memoryGenerationId: 'gen_1',
    chunkId: 'chunk_2',
    blockIds: ['block_2'],
    pageStart: 6,
    pageEnd: 6,
    sectionHeading: 'Weekend Possession',
    text: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
    confidence: 0.95,
  },
];

function legalInterpretation(overrides: Partial<LegalInterpretationAnswer> = {}): LegalInterpretationAnswer {
  return {
    answerType: 'order_interpretation',
    directAnswer: 'No - my read is that Father\'s Day possession starts Friday at 6:00 p.m., not Thursday.',
    userFacingCertainty: 'clear',
    controllingClauses: [
      {
        label: 'Father\'s Day provision',
        quote: 'Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day.',
        sourceIds: ['src_001'],
        pageStart: 5,
        pageEnd: 5,
      },
    ],
    competingClauses: [
      {
        label: 'Regular weekend extension',
        quote: 'Regular weekend possession begins on Thursday when Friday is a federal, state, or local holiday or a student holiday.',
        sourceIds: ['src_002'],
        whyItDoesOrDoesNotControl: 'That is a general weekend-extension rule, not the specific Father\'s Day provision.',
      },
    ],
    priorityLanguage: [
      {
        signal: 'specific_over_general',
        explanation: 'The specific Father\'s Day provision controls over the general weekend-extension rule unless a later signed order changes it.',
        sourceIds: ['src_001', 'src_002'],
      },
    ],
    interpretation: {
      plainEnglish: 'Use the Father\'s Day clause for Father\'s Day possession.',
      legalReading: 'The holiday-specific clause supplies the start and end times, while the Thursday-start language applies to regular weekend possession.',
      opposingArgument: 'The other parent may point to the Friday-holiday weekend language.',
      responseToOpposingArgument: 'That language is general; the Father\'s Day clause is specific.',
    },
    practicalMeaning: {
      result: 'Follow Friday 6:00 p.m. to Monday 8:00 a.m. for Father\'s Day possession unless a later signed order changes it.',
      startTime: 'Friday 6:00 p.m.',
      endTime: 'Monday 8:00 a.m.',
      whatUserShouldDo: 'Use the specific Father\'s Day language in any message.',
    },
    draftMessage: {
      tone: 'firm',
      text: 'Based on the order, Father\'s Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m. I plan to follow the Father\'s Day provision as written.',
    },
    caveats: [],
    ...overrides,
  };
}

function deterministicLegalFields() {
  return {
    localResourceLookup: null,
    legalAuthorities: null,
    proSeDraftingReadiness: null,
    orderVersion: null,
    legalBasis: [],
    deadlineAnalysis: null,
  };
}

describe('legal interpretation response shape', () => {
  it('validates the new NexxAssistantResponse legalInterpretation field', () => {
    expect(validateAssistantResponse({
      message: 'No - Father\'s Day starts Friday.',
      artifacts: {
        draftReady: null,
        timelineReady: null,
        exhibitReady: null,
        judgeSimulation: null,
        oppositionSimulation: null,
        confidence: null,
      },
      documentAnswer: null,
      legalInterpretation: legalInterpretation(),
      litigationNavigation: null,
      ...deterministicLegalFields(),
    })).toBe(true);

    expect(validateAssistantResponse({
      message: 'No - Father\'s Day starts Friday.',
      artifacts: {
        draftReady: null,
        timelineReady: null,
        exhibitReady: null,
        judgeSimulation: null,
        oppositionSimulation: null,
        confidence: null,
      },
      documentAnswer: null,
    })).toBe(false);
  });

  it('validates the legal interpretation object shape', () => {
    expect(validateLegalInterpretationAnswerShape(legalInterpretation())).toBe(true);
    expect(validateLegalInterpretationAnswerShape({
      ...legalInterpretation(),
      userFacingCertainty: 'certain-ish',
    })).toBe(false);
  });
});

describe('renderLegalInterpretationMarkdown', () => {
  it('renders a direct possession answer without report or internal metadata headings', () => {
    const content = renderLegalInterpretationMarkdown(
      legalInterpretation(),
      sourcePackets,
      'Fallback answer'
    );

    expect(content).toContain('No - my read is that Father\'s Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]');
    expect(content).toContain('**Controlling language:**');
    expect(content).toContain('**How the provisions work together:**');
    expect(content).not.toContain('**Competing language:**');
    expect(content).toContain('**Why this controls:**');
    expect(content).toContain('**Practical meaning:**');
    expect(content).not.toContain('**Suggested reply:**');
    expect(content).toContain('[p. 5]');
    expect(content).toContain('[p. 6]');
    expect(content).not.toContain('# Court Order Analysis');
    expect(content).not.toContain('## Cautions');
    expect(content).not.toContain('Risks and Cautions');
    expect(content).not.toContain('Source Details');
    expect(content).not.toContain('sourceId');
    expect(content).not.toContain('chunkId');
    expect(content).not.toContain('memoryGenerationId');
    expect(content).not.toContain('blockIds');
    expect(content).not.toContain('quotedText');
    expect(content).not.toContain('Signed Final Order.pdf, p.');
  });

  it('keeps competing-clause reasons bulleted when no quote is available', () => {
    const content = renderLegalInterpretationMarkdown(
      legalInterpretation({
        competingClauses: [{
          label: 'General weekend language',
          quote: '',
          sourceIds: ['src_002'],
          whyItDoesOrDoesNotControl: 'The general weekend language does not override the specific Father\'s Day provision.',
        }],
      }),
      sourcePackets,
      'Fallback answer'
    );

    expect(content).toContain('**How the provisions work together:**');
    expect(content).toContain('- The general weekend language does not override the specific Father\'s Day provision.');
  });

  it('renders vague follow-ups in quick direct mode without heavy clause headings', () => {
    const content = renderLegalInterpretationMarkdown(
      legalInterpretation(),
      sourcePackets,
      'Fallback answer',
      { renderMode: 'quick_direct', userMessage: 'Can he do that?' }
    );

    expect(content).toContain('No - my read is that Father\'s Day possession starts Friday at 6:00 p.m., not Thursday.');
    expect(content).toContain('holiday-specific clause supplies the start and end times');
    expect(content).not.toContain('I would keep it short and order-based:');
    expect(content).not.toContain('**Controlling language:**');
    expect(content).not.toContain('**Competing language:**');
  });

  it('renders what-to-say follow-ups as draft focused', () => {
    const content = renderLegalInterpretationMarkdown(
      legalInterpretation(),
      sourcePackets,
      'Fallback answer',
      { renderMode: 'draft_focused', userMessage: 'What do I say back?' }
    );

    expect(content).toContain('You can say:');
    expect(content).toContain('Based on the order, Father\'s Day possession begins Friday at 6:00 p.m.');
    expect(content).toContain('Why this works:');
    expect(content).not.toContain('**Controlling language:**');
  });

  it('renders all necessary caveats for ambiguous interpretations', () => {
    const content = renderLegalInterpretationMarkdown(
      legalInterpretation({
        userFacingCertainty: 'ambiguous',
        caveats: [
          'The order uses conflicting exchange language.',
          'A later modification should be checked before filing.',
        ],
      }),
      sourcePackets,
      'Fallback answer'
    );

    expect(content).toContain('The order uses conflicting exchange language.');
    expect(content).toContain('A later modification should be checked before filing.');
  });
});

describe('buildBestEffortLegalInterpretationFromDocumentAnswer', () => {
  it('keeps legal interpretation routes legal-shaped when model legalInterpretation repair fails', () => {
    const documentAnswer: LegalDocumentAnswer = {
      answerType: 'interpretation',
      answer: 'Here is what the visible order language supports.',
      claims: [
        {
          claim: 'Father\'s Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m.',
          claimType: 'document_fact',
          sourceIds: ['src_001'],
        },
        {
          claim: 'Regular weekend possession begins on Thursday when Friday is a qualifying holiday.',
          claimType: 'document_fact',
          sourceIds: ['src_002'],
        },
      ],
      citations: [
        { sourceId: 'src_001', pageStart: 5, pageEnd: 5, supports: null, confidence: 'high' },
        { sourceId: 'src_002', pageStart: 6, pageEnd: 6, supports: null, confidence: 'high' },
      ],
      warnings: [],
      unsupportedClaims: [],
      notFoundReason: null,
    };
    const answer = buildBestEffortLegalInterpretationFromDocumentAnswer(
      documentAnswer,
      sourcePackets,
      detectDocumentReference('Which clause controls for Father\'s Day, Thursday or Friday?'),
      'Which clause controls for Father\'s Day, Thursday or Friday?'
    );

    const verification = verifyLegalInterpretationAnswer(answer, sourcePackets, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
    });
    const content = answer
      ? renderLegalInterpretationMarkdown(answer, sourcePackets, 'Fallback answer', { renderMode: 'standard_explanation' })
      : '';

    expect(answer).not.toBeNull();
    expect(verification.passed).toBe(true);
    expect(content).toContain("Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m.");
    expect(content).toContain('provision written specifically for this event applies');
    expect(content).not.toContain('citation verifier');
    expect(content).not.toContain('model-generated claim');
  });
});

describe('verifyLegalInterpretationAnswer', () => {
  it('passes a direct sourced clause-conflict interpretation', () => {
    const result = verifyLegalInterpretationAnswer(legalInterpretation(), sourcePackets, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.answeredDirectly).toBe(true);
    expect(result.checks.hasControllingClause).toBe(true);
    expect(result.checks.hasCompetingClauseWhenNeeded).toBe(true);
    expect(result.checks.resolvedClauseConflict).toBe(true);
  });

  it('rejects clear interpretations that hedge instead of resolving the conflict', () => {
    const result = verifyLegalInterpretationAnswer(legalInterpretation({
      directAnswer: 'The Father\'s Day provision may control, but I cannot safely support every part.',
    }), sourcePackets, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
    });

    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toContain('over-hedged');
  });
});
