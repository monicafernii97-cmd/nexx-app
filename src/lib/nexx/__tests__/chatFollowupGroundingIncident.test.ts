import { describe, expect, it } from 'vitest';
import { detectDocumentReference } from '../documentReferenceDetection';
import {
  buildDocumentChunkSearchQuery,
  retrieveRelevantDocumentChunks,
  type DocumentChunkRetrievalCandidate,
} from '../documentChunkRetrieval';
import {
  buildContextualDocumentFollowUpMessage,
  shouldRequireDocumentGroundedDraftInterpretation,
} from '../followUpContext';
import {
  buildBestEffortLegalDocumentAnswerFromSources,
  verifyLegalDocumentAnswer,
  type LegalDocumentSourcePacket,
} from '../legalDocumentAnswer';
import { buildBestEffortLegalInterpretationFromDocumentAnswer } from '../legal-engine/bestEffortLegalInterpretation';
import { verifyLegalInterpretationAnswer } from '../legal-engine/legalInterpretationVerifier';
import {
  buildLitigationNavigationResponse,
  renderLitigationNavigationMarkdown,
} from '../legal-engine/litigationNavigationRenderer';
import { fathersDayJuneteenth46PagePackets } from './fixtures/fathersDayJuneteenth46Page';

const genericWeekendPacket: LegalDocumentSourcePacket = {
  sourceId: 'generic_weekends_page_10',
  fileId: 'final-order-46-pages',
  fileName: 'Final Order.pdf',
  chunkId: 'generic_weekends_page_10',
  blockIds: ['generic_weekends_page_10'],
  pageStart: 3,
  pageEnd: 3,
  sectionHeading: '1. Weekends —',
  text: '-- 10 of 46 -- primary residence of the child, GIOVANNI PUGLIESE shall have the right to possession of the child as follows: 1.',
};

const allPackets = [genericWeekendPacket, ...fathersDayJuneteenth46PagePackets];

function retrievalCandidate(packet: LegalDocumentSourcePacket, chunkIndex: number): DocumentChunkRetrievalCandidate {
  return {
    chunkId: packet.chunkId,
    uploadedFileId: packet.fileId,
    blockIds: packet.blockIds,
    chunkIndex,
    text: packet.text,
    textLength: packet.text.length,
    pageStart: packet.pageStart,
    pageEnd: packet.pageEnd,
    sectionHeading: packet.sectionHeading,
    retrievalMetadata: { containsOrderLanguage: true },
  };
}

describe('production incident: grounded drafting follow-up', () => {
  it('keeps the active Father’s Day issue across the co-parent drafting route', () => {
    const firstTurn = "Does Father's Day start Thursday because Friday is Juneteenth, or does the specific provision start it Friday?";
    const followUp = 'What should I say?';
    const contextual = buildContextualDocumentFollowUpMessage(
      followUp,
      [
        { role: 'user', content: firstTurn, status: 'committed' },
        { role: 'assistant', content: 'Prior assistant prose must not become retrieval evidence.', status: 'committed' },
        { role: 'user', content: followUp, status: 'committed' },
      ],
      'co_parent_response'
    );

    expect(contextual).toContain(firstTurn);
    expect(contextual).not.toContain('Prior assistant prose');
    const detection = detectDocumentReference(contextual);
    expect(detection.requestedTerms).toContain("father's day");
    expect(buildDocumentChunkSearchQuery(contextual, detection)).toMatch(/father'?s day/i);

    const retrieved = retrieveRelevantDocumentChunks({
      message: contextual,
      detection,
      chunks: allPackets.map(retrievalCandidate),
      maxChunks: 5,
    });
    expect(retrieved.some((chunk) => chunk.chunkId === 'father_page_16')).toBe(true);

    const selectedIds = new Set(retrieved.map((chunk) => chunk.chunkId));
    const selectedPackets = allPackets.filter((packet) => selectedIds.has(packet.chunkId));
    const documentAnswer = buildBestEffortLegalDocumentAnswerFromSources(
      selectedPackets,
      undefined,
      { isTargetedQuestion: true, userMessage: contextual }
    );
    expect(documentAnswer.answer).toBe(
      "Father's Day possession begins Friday at 6:00 p.m. and ends Monday at 8:00 a.m."
    );
    expect(documentAnswer.answer).not.toMatch(/--\s*10 of 46|primary residence|GIOVANNI/i);
    expect(verifyLegalDocumentAnswer(documentAnswer, selectedPackets, {
      requiresDocumentAnswer: true,
      requiresCitation: true,
      userMessage: contextual,
    }).passed).toBe(true);

    const interpretation = buildBestEffortLegalInterpretationFromDocumentAnswer(
      documentAnswer,
      selectedPackets,
      detection,
      contextual
    );
    expect(interpretation).not.toBeNull();
    const interpretationVerification = verifyLegalInterpretationAnswer(interpretation, selectedPackets, {
      requiresLegalInterpretation: true,
      hasClauseConflictSignal: true,
      userMessage: contextual,
    });
    expect(interpretationVerification.errors).toEqual([]);

    const navigation = buildLitigationNavigationResponse({
      message: followUp,
      routeMode: 'co_parent_response',
      recentContext: firstTurn,
      verifiedOrderInterpretation: {
        directAnswer: interpretation!.directAnswer,
        practicalResult: interpretation!.practicalMeaning.result,
        startTime: interpretation!.practicalMeaning.startTime,
        endTime: interpretation!.practicalMeaning.endTime,
      },
    });
    const rendered = renderLitigationNavigationMarkdown(navigation, {
      routeMode: 'co_parent_response',
      userMessage: followUp,
    });
    expect(rendered).toContain('You can say:');
    expect(rendered).toMatch(/Father[’']s Day possession begins Friday at 6:00 p\.m\./i);
    expect(rendered).not.toMatch(/--\s*\d+ of \d+|primary residence|GIOVANNI|\[p\.\s*\d+\]/i);
  });

  it('rejects a generic weekend fragment as the controlling Father’s Day result', () => {
    const contextual = "What should I say about whether Father's Day starts Thursday or Friday?";
    const malformedAnswer = buildBestEffortLegalDocumentAnswerFromSources(
      [genericWeekendPacket],
      undefined,
      { isTargetedQuestion: true, userMessage: contextual }
    );
    expect(malformedAnswer.answerType).toBe('not_found');
    expect(malformedAnswer.answer).not.toContain('-- 10 of 46 --');
  });

  it('does not combine a Father’s Day mention with unrelated schedule times in the same chunk', () => {
    const mixedPacket: LegalDocumentSourcePacket = {
      ...genericWeekendPacket,
      sourceId: 'mixed_unrelated_schedule',
      chunkId: 'mixed_unrelated_schedule',
      sectionHeading: "Father's Day and regular weekends",
      text: "Father's Day is listed as a holiday. Regular weekend possession begins Friday at 8:00 p.m. and ends Monday at 8:00 a.m.",
    };
    const result = buildBestEffortLegalDocumentAnswerFromSources(
      [mixedPacket],
      undefined,
      { isTargetedQuestion: true, userMessage: "When does Father's Day possession begin?" }
    );

    expect(result.answerType).toBe('not_found');
    expect(result.notFoundReason).toBe('operative_fathers_day_schedule_not_found');
  });

  it('bounds and isolates follow-up context under a large message history', () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({
      role: 'user' as const,
      content: `Issue ${index} ${'detail '.repeat(30)}`,
      status: 'committed' as const,
    }));
    messages.push({
      role: 'user',
      content: "The current dispute is Father's Day possession starting Friday.",
      status: 'committed',
    });
    const contextual = buildContextualDocumentFollowUpMessage(
      'What should I say?',
      messages,
      'co_parent_response'
    );
    expect(contextual.length).toBeLessThanOrEqual(4_100);
    expect(contextual).toContain("Father's Day");
    expect(buildContextualDocumentFollowUpMessage(
      'What is the deadline in a new motion?',
      messages,
      'co_parent_response'
    )).toBe('What is the deadline in a new motion?');
  });

  it('does not apply stale order interpretation to a new drafting issue', () => {
    expect(shouldRequireDocumentGroundedDraftInterpretation({
      routeMode: 'co_parent_response',
      sourcePacketCount: 3,
      hasActiveDocumentContext: true,
      followUpSummary: undefined,
      documentReference: { referencesDocument: false },
    })).toBe(false);

    expect(shouldRequireDocumentGroundedDraftInterpretation({
      routeMode: 'co_parent_response',
      sourcePacketCount: 3,
      hasActiveDocumentContext: true,
      followUpSummary: "The active issue is Father's Day possession.",
      documentReference: { referencesDocument: false },
    })).toBe(true);
  });
});
