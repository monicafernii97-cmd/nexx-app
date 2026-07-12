import { describe, expect, it } from 'vitest';
import { classifyMessage } from '../router';
import type { RouteMode } from '../../types';
import { renderLegalInterpretationMarkdown } from '../legal-engine/legalInterpretationRenderer';
import type { LegalInterpretationAnswer } from '../legal-engine/legalInterpretationSchema';
import { verifyRenderedOutput } from '../legal-engine/renderedOutputVerifier';
import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import {
  buildLitigationNavigationResponse,
  renderLitigationNavigationMarkdown,
} from '../legal-engine/litigationNavigationRenderer';
import { FORBIDDEN_HEADINGS, INTERNAL_LANGUAGE } from './antiCautionGuardrails';

const fatherDayPrompt =
  "Under this order, does Father's Day possession start Thursday because Friday is a holiday, or does it start Friday?";

function source(overrides: Partial<LegalDocumentSourcePacket>): LegalDocumentSourcePacket {
  return {
    sourceId: 'src_default',
    fileId: 'qa_order',
    fileName: 'clear-order.pdf',
    chunkId: 'chunk_default',
    blockIds: ['block_default'],
    text: '',
    ...overrides,
  };
}

const clearSources: LegalDocumentSourcePacket[] = [
  source({
    sourceId: 'src_general',
    chunkId: 'chunk_general',
    pageStart: 3,
    pageEnd: 3,
    sectionHeading: 'GENERAL WEEKEND EXTENSION',
    text: 'Except as otherwise expressly provided in this order, if a federal, state, or local holiday falls on a Friday during the summer months, a regular weekend period of possession begins Thursday at 6:00 p.m.',
  }),
  source({
    sourceId: 'src_fathers_day',
    chunkId: 'chunk_fathers_day',
    pageStart: 5,
    pageEnd: 5,
    sectionHeading: "FATHER'S DAY",
    text: "The father shall have possession beginning at 6:00 p.m. on the Friday preceding Father's Day and ending at 8:00 a.m. on the Monday following Father's Day.",
  }),
];

function clearInterpretation(overrides: Partial<LegalInterpretationAnswer> = {}): LegalInterpretationAnswer {
  return {
    answerType: 'order_interpretation',
    directAnswer: "No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday.",
    userFacingCertainty: 'clear',
    controllingClauses: [
      {
        label: "Father's Day provision",
        quote: "The father shall have possession beginning at 6:00 p.m. on the Friday preceding Father's Day and ending at 8:00 a.m. on the Monday following Father's Day.",
        sourceIds: ['src_fathers_day'],
        pageStart: 5,
        pageEnd: 5,
      },
    ],
    competingClauses: [
      {
        label: 'General weekend extension',
        quote: 'Except as otherwise expressly provided in this order, if a federal, state, or local holiday falls on a Friday during the summer months, a regular weekend period of possession begins Thursday at 6:00 p.m.',
        sourceIds: ['src_general'],
        whyItDoesOrDoesNotControl: "That is a general weekend-extension rule; it does not override the specific Father's Day provision.",
      },
    ],
    priorityLanguage: [
      {
        signal: 'specific_over_general',
        explanation: "The Father's Day provision is specific, while the Thursday-start language is a general weekend-extension rule.",
        sourceIds: ['src_fathers_day', 'src_general'],
      },
    ],
    interpretation: {
      plainEnglish: "Use the Father's Day provision for Father's Day possession.",
      legalReading: "The specific Father's Day provision controls over the general weekend-extension clause.",
      opposingArgument: 'The other parent may rely on the general Thursday-start clause.',
      responseToOpposingArgument: "The Father's Day clause is more specific.",
    },
    practicalMeaning: {
      result: "The practical period is Friday at 6:00 p.m. through Monday at 8:00 a.m.",
      startTime: 'Friday at 6:00 p.m.',
      endTime: 'Monday at 8:00 a.m.',
      whatUserShouldDo: "Use the specific Father's Day language if you respond.",
    },
    draftMessage: {
      tone: 'neutral',
      text: "Based on the order, Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m. I plan to follow that provision as written.",
    },
    caveats: [],
    ...overrides,
  };
}

function render(answer: LegalInterpretationAnswer, sources = clearSources, userMessage = fatherDayPrompt) {
  return renderLegalInterpretationMarkdown(answer, sources, 'Fallback', { userMessage });
}

function expectNoInternalOrCaution(text: string) {
  expect(text).not.toMatch(INTERNAL_LANGUAGE);
  expect(text).not.toMatch(FORBIDDEN_HEADINGS);
  expect(text).not.toMatch(/\bconsult an attorney\b/i);
}

function expectDirectWithinFirstThirtyWords(text: string) {
  const firstThirtyWords = text.split(/\s+/).slice(0, 30).join(' ');
  expect(firstThirtyWords).toMatch(/\b(no|yes|my read is|the order says|based on the order)\b/i);
}

function expectRenderedOutputPasses(text: string, userMessage: string, routeMode: RouteMode = 'possession_access_schedule') {
  const verification = verifyRenderedOutput({ rendered: text, userMessage, routeMode });
  expect(verification.passed, verification.errors.join('; ')).toBe(true);
}

describe('NEXX anti-caution production QA matrix', () => {
  it('Test 1 - clear document answers Father\'s Day directly', () => {
    const route = classifyMessage(fatherDayPrompt);
    const text = render(clearInterpretation());

    expect(route.mode).toBe('possession_access_schedule');
    expect(route.legalIntent).toBe('possession_access_schedule');
    expect(text).toContain("No - my read is that Father's Day possession starts Friday at 6:00 p.m., not Thursday. [p. 5]");
    expect(text).toContain("The specific Father's Day provision controls over the general weekend-extension clause.");
    expect(text).toContain('Friday at 6:00 p.m. through Monday at 8:00 a.m.');
    expect(text).not.toMatch(/\bmay control|might control|non-frivolous argument\b/i);
    expectDirectWithinFirstThirtyWords(text);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, fatherDayPrompt);
  });

  it('Test 2 - partially readable relevant clause still answers directly', () => {
    const partialSources = [
      clearSources[0],
      source({
        sourceId: 'src_fathers_day',
        chunkId: 'chunk_fathers_day_partial',
        pageStart: 5,
        pageEnd: 5,
        sectionHeading: "FATHER'S DAY",
        text: "FATHER'S DAY - The father shall have possession beginn_ng at 6:00 p.m. on the Friday preceding Father's Day and ending at 8:00 a.m. on the Monday following Father's Day.",
        confidence: 0.48,
        warning: 'visual_noise_on_page',
      }),
    ];
    const text = render(clearInterpretation({ userFacingCertainty: 'best_reading' }), partialSources);

    expect(text).toContain("Father's Day possession starts Friday at 6:00 p.m.");
    expect(text).not.toMatch(/\b(text may be incomplete|document contains|cannot safely answer|partial|distortion)\b/i);
    expectDirectWithinFirstThirtyWords(text);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, fatherDayPrompt);
  });

  it('Test 3 - unrelated unreadable content does not create a warning', () => {
    const sources = [
      ...clearSources,
      source({
        sourceId: 'src_unrelated',
        chunkId: 'chunk_unrelated',
        pageStart: 6,
        pageEnd: 6,
        sectionHeading: 'PROPERTY SECTION',
        text: 'UNRELATED PAGE VISUALLY DEGRADED',
        warning: 'unreadable_unrelated_page',
        confidence: 0.1,
      }),
    ];
    const text = render(clearInterpretation(), sources);

    expect(text).toContain("Father's Day possession starts Friday at 6:00 p.m.");
    expect(text).not.toMatch(/\bunreadable|degraded|property section|page 6\b/i);
    expectDirectWithinFirstThirtyWords(text);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, fatherDayPrompt);
  });

  it('Test 4 - genuinely unreadable controlling start time states only the material limitation', () => {
    const prompt = "What time does Father's Day possession begin under this order?";
    const text = render(
      clearInterpretation({
        directAnswer: "The order separately provides for Father's Day possession, but I cannot verify the exact start time from this copy because that part of the sentence is unclear. The ending time appears to be Monday at 8:00 a.m.",
        userFacingCertainty: 'insufficient_text',
        controllingClauses: [
          {
            label: "Father's Day provision",
            quote: "The father shall have possession [start-time phrase unclear] and ending at 8:00 a.m. on the Monday following Father's Day.",
            sourceIds: ['src_fathers_day'],
            pageStart: 5,
            pageEnd: 5,
          },
        ],
        competingClauses: [],
        priorityLanguage: [],
        interpretation: {
          plainEnglish: "The order has a Father's Day section, but the start-time words are unclear.",
          legalReading: 'Do not infer a start time from language that cannot be verified.',
        },
        practicalMeaning: {
          result: 'A clearer image of page 5 is needed to confirm the start time.',
          startTime: null,
          endTime: 'Monday at 8:00 a.m.',
          whatUserShouldDo: 'Upload a clearer image of page 5 before using the start time in a filing or message.',
        },
        draftMessage: null,
        caveats: ['Only the start-time phrase is unclear; the ending time appears to be Monday at 8:00 a.m.'],
      }),
      clearSources,
      prompt
    );

    expect(text).toMatch(/cannot verify the exact start time|start-time phrase is unclear/i);
    expect(text).toContain('Monday at 8:00 a.m.');
    expect(text).not.toMatch(/\bstarts Friday|starts Thursday|6:00 p\.m\./i);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, prompt);
  });

  it('Test 5 - absent Father\'s Day clause is not treated as unreadable or invented', () => {
    const prompt = "What does this order say about when Father's Day possession begins?";
    const text = render(
      clearInterpretation({
        directAnswer: "I do not see a separate Father's Day provision in this order.",
        userFacingCertainty: 'insufficient_text',
        controllingClauses: [],
        competingClauses: [
          {
            label: 'General weekend extension',
            quote: clearSources[0].text,
            sourceIds: ['src_general'],
            whyItDoesOrDoesNotControl: "That is a general Friday-holiday weekend-extension rule, not an express Father's Day provision.",
          },
        ],
        priorityLanguage: [],
        interpretation: {
          plainEnglish: "The order contains a general Friday-holiday weekend-extension rule, but not a separate Father's Day clause.",
          legalReading: "I would not state a specific Father's Day start time from this document alone.",
        },
        practicalMeaning: {
          result: "Do not infer a specific Father's Day schedule unless another signed order or external authority is verified.",
          startTime: null,
          endTime: null,
          whatUserShouldDo: 'Ask for the written provision being relied on before agreeing to a specific start time.',
        },
        draftMessage: null,
        caveats: ["The visible order language does not include a separate Father's Day provision."],
      }),
      [clearSources[0]],
      prompt
    );

    expect(text).toContain("I do not see a separate Father's Day provision");
    expect(text).toContain('not an express Father\'s Day provision');
    expect(text).not.toMatch(/\bunreadable|Friday at 6:00 p\.m\.|Monday at 8:00 a\.m\./i);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, prompt);
  });

  it('Test 6 - vague follow-up uses active Father\'s Day context', () => {
    const prompt = 'Can he do that?';
    const route = classifyMessage(
      prompt,
      "Prior issue: the other parent demanded Thursday possession for Father's Day under the uploaded order.",
      'possession_access_schedule',
      true
    );
    const text = render(clearInterpretation(), clearSources, prompt);

    expect(['possession_access_schedule', 'order_interpretation']).toContain(route.mode);
    expect(route.legalIntent).toBe('direct_order_interpretation');
    expect(text).toContain("No - my read is that Father's Day possession starts Friday");
    expect(text).not.toMatch(/can who do what/i);
    expectDirectWithinFirstThirtyWords(text);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, prompt, 'possession_access_schedule');
  });

  it('Test 7 - verified co-parent draft uses exact verified order terms', () => {
    const prompt = 'What should I respond?';
    const response = buildLitigationNavigationResponse({
      message: prompt,
      routeMode: 'co_parent_response',
      recentContext: "Prior issue: Father's Day possession dispute under the uploaded order.",
      verifiedOrderInterpretation: {
        directAnswer: "No - Father's Day possession starts Friday at 6:00 p.m., not Thursday.",
        practicalResult: "Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m.",
        startTime: 'Friday at 6:00 p.m.',
        endTime: 'Monday at 8:00 a.m.',
        sourcePages: ['p. 5'],
      },
    });
    const text = renderLitigationNavigationMarkdown(response, {
      routeMode: 'co_parent_response',
      userMessage: prompt,
    });

    expect(text.split(/\s+/).slice(0, 10).join(' ')).toMatch(/You can say/i);
    expect(text).toContain("Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m.");
    expect(text).toContain('I plan to follow that written provision.');
    expect(text).not.toMatch(/\bmanipulat|abusive|gaslighting|consult an attorney\b/i);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, prompt, 'co_parent_response');
  });

  it('Test 8 - unverified co-parent draft does not insert an exact start time', () => {
    const prompt = "What should I respond to him about the Father's Day start time?";
    const response = buildLitigationNavigationResponse({
      message: prompt,
      routeMode: 'co_parent_response',
      recentContext: "Father's Day start time is disputed, but the controlling start-time words are not verified from the order.",
    });
    const text = renderLitigationNavigationMarkdown(response, {
      routeMode: 'co_parent_response',
      userMessage: prompt,
    });

    expect(text).toContain('Please identify the specific written provision');
    expect(text).not.toMatch(/\b6:00 p\.m\.|8:00 a\.m\.|Friday at|Monday at\b/i);
    expectNoInternalOrCaution(text);
    expectRenderedOutputPasses(text, prompt, 'co_parent_response');
  });
});
