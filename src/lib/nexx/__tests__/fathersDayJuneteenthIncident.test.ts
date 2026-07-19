import { describe, expect, it } from 'vitest';
import type { LegalDocumentAnswer } from '../legalDocumentAnswer';
import { verifyLegalDocumentAnswer } from '../legalDocumentAnswer';
import { detectDocumentReference } from '../documentReferenceDetection';
import { buildBestEffortLegalInterpretationFromDocumentAnswer } from '../legal-engine/bestEffortLegalInterpretation';
import { verifyLegalInterpretationAnswer } from '../legal-engine/legalInterpretationVerifier';
import { renderLegalInterpretationMarkdown } from '../legal-engine/legalInterpretationRenderer';
import { resolveFathersDayPossession } from '../legal-engine/possessionCalendar';
import {
  repairRenderedOutput,
  truncateAtSentenceBoundary,
  verifyRenderedOutput,
} from '../legal-engine/renderedOutputVerifier';
import { resolveRequestedFathersDaySchedule } from '../legal-engine/possessionCalendar';
import { fathersDayJuneteenth46PagePackets as packets } from './fixtures/fathersDayJuneteenth46Page';
import { semanticallyEquivalentLegalText } from '../legal-engine/semanticDedup';

const documentAnswer: LegalDocumentAnswer = {
  answerType: 'interpretation',
  answer: "The Father's Day provision starts possession Friday at 6:00 p.m.",
  claims: [
    { claim: "Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m.", claimType: 'document_fact', sourceIds: ['father_page_16'] },
    { claim: 'The general Friday-holiday rule begins a regular weekend Thursday at 6:00 p.m.', claimType: 'document_fact', sourceIds: ['general_page_15'] },
  ],
  citations: [], warnings: [], unsupportedClaims: [], notFoundReason: null,
};

describe("Father's Day and Juneteenth production incident", () => {
  it('selects the operative holiday clause and excludes noisy summer and Thanksgiving text', () => {
    const answer = buildBestEffortLegalInterpretationFromDocumentAnswer(
      documentAnswer,
      packets,
      detectDocumentReference("Does Father's Day start Thursday because Friday is Juneteenth?"),
      "Does Father's Day start Thursday because Friday is Juneteenth?"
    );
    expect(answer?.controllingClauses.map((clause) => clause.sourceIds)).toEqual([['father_page_16']]);
    expect(answer?.controllingClauses.flatMap((clause) => clause.sourceIds)).not.toContain('summer_page_12');
    expect(answer?.controllingClauses.flatMap((clause) => clause.sourceIds)).not.toContain('thanksgiving_page_17');

    const rendered = renderLegalInterpretationMarkdown(answer!, packets, 'Fallback', {
      userMessage: "Which provision controls for Father's Day?",
    });
    expect(rendered).toContain('**How the provisions work together:**');
    expect(rendered).not.toContain('Competing language');
    expect(rendered).not.toContain('Thanksgiving');
    expect(rendered).not.toContain('summer period shall not interfere');
    expect(rendered).toContain('Except as otherwise expressly provided');
    expect(rendered).toContain('do not contradict each other');
    expect(rendered).toContain('general rule remains valid');
    expect(rendered).toContain('[p. 4]');
    expect(rendered).toContain('[p. 5]');
    expect(rendered.split(/\s+/).length).toBeLessThanOrEqual(220);
    expect(rendered.trim()).toMatch(/[.!?]$/);
  });

  it('resolves the 2026 calendar dates deterministically', () => {
    expect(resolveFathersDayPossession(2026)).toEqual({
      year: 2026,
      holidayName: "Father's Day",
      holidayDate: '2026-06-21',
      startDate: '2026-06-19',
      endDate: '2026-06-22',
    });
    const schedule = resolveRequestedFathersDaySchedule({
      userMessage: "Does Father's Day start Thursday this year because Friday is Juneteenth?",
      controllingText: packets.find((packet) => packet.sourceId === 'father_page_16')!.text,
      currentYear: 2026,
      timeZone: 'America/Chicago',
    });
    expect(schedule?.startLabel).toBe('Friday, June 19, 2026 at 6:00 p.m.');
    expect(schedule?.endLabel).toBe('Monday, June 22, 2026 at 8:00 a.m.');
    expect(resolveRequestedFathersDaySchedule({
      userMessage: 'What dates does Father’s Day mean for 2026?',
      controllingText: packets.find((packet) => packet.sourceId === 'father_page_16')!.text.replaceAll("'", '’'),
      timeZone: 'America/Chicago',
    })?.startDate).toBe('2026-06-19');
  });

  it('recognizes a clause-controls opening, repairs by prepending once, and never cuts midword', () => {
    const direct = "The Father's Day clause controls.";
    expect(verifyRenderedOutput({
      rendered: `${direct}\n\nThe express exception means the general rule keeps its normal scope.`,
      userMessage: 'Does it start Thursday?', canonicalDirectAnswer: direct,
    }).checks.includesDirectAnswerWhenNeeded).toBe(true);

    const repaired = repairRenderedOutput('The express exception limits the general rule.', { directAnswer: direct });
    expect(repairRenderedOutput(repaired, { directAnswer: direct })).toBe(repaired);
    expect(repaired.match(/The Father's Day clause controls\./g)).toHaveLength(1);
    const truncated = truncateAtSentenceBoundary('Complete first sentence. ' + 'word '.repeat(30), 45);
    expect(truncated).toMatch(/(?:[.!?]|…|â€¦)$/);
    expect(truncated).not.toMatch(/\bwo(?:…|â€¦)$/);

    expect(verifyRenderedOutput({
      rendered: 'Yes, the Thursday rule controls.',
      userMessage: 'Does it start Thursday?', canonicalDirectAnswer: direct,
    }).checks.includesDirectAnswerWhenNeeded).toBe(false);
    expect(semanticallyEquivalentLegalText(
      "Father's Day begins Friday at 6:00 p.m.",
      "Father's Day does not begin Friday at 8:00 p.m."
    )).toBe(false);
  });

  it('rejects a real but unrelated source id as support for a claim', () => {
    const result = verifyLegalDocumentAnswer({
      ...documentAnswer,
      claims: [{ claim: "Father's Day possession begins Friday at 6:00 p.m.", claimType: 'document_fact', sourceIds: ['thanksgiving_page_17'] }],
    }, packets, { requiresDocumentAnswer: true, requiresCitation: true });
    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/unrelated|support/i);
  });

  it('rejects a generic weekend fragment and unsafe draft despite valid source ids', () => {
    const prompt = "What should I say about whether Father's Day starts Thursday or Friday?";
    const answer = buildBestEffortLegalInterpretationFromDocumentAnswer(
      documentAnswer,
      packets,
      detectDocumentReference(prompt),
      prompt
    )!;
    const malformed = {
      ...answer,
      directAnswer: '1. Weekends — -- 10 of 46 -- possession of the child as follows: 1.',
      practicalMeaning: {
        ...answer.practicalMeaning,
        result: '1. Weekends — -- 10 of 46 -- possession of the child as follows: 1.',
      },
      controllingClauses: [{
        label: '1. Weekends',
        quote: packets.find((packet) => packet.sourceId === 'general_page_15')!.text,
        sourceIds: ['general_page_15'],
        pageStart: 4,
        pageEnd: 4,
      }],
      draftMessage: {
        tone: 'neutral' as const,
        text: 'My understanding is -- 10 of 46 -- possession of the child as follows: 1.',
      },
    };
    const verification = verifyLegalInterpretationAnswer(malformed, packets, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
      userMessage: prompt,
    });
    expect(verification.passed).toBe(false);
    expect(verification.errors.join(' ')).toMatch(/operative|source-supported|extraction|draft/i);
  });
});
