import type { LegalDocumentAnswer, LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { DocumentReferenceDetection } from '../documentReferenceDetection';
import type { LegalInterpretationAnswer, LegalInterpretationPrioritySignal } from './legalInterpretationSchema';
import {
  containsFathersDay,
  inferClauseRelationship,
  sourceContainsGeneralHolidayExtension,
  sourceContainsOperativeFatherDaySchedule,
  sourceContainsPriorityCarveout,
  sourceIsRelevantToIssue,
} from './clauseRelationship';
import {
  displayScheduleTime,
  extractFathersDayScheduleTerms,
} from './fathersDayScheduleTerms';

const GENERIC_DOCUMENT_ANSWER_PATTERN =
  /\b(i found usable court-order language|organized the visible provisions|cite exact pages|stay grounded in the visible order language)\b/i;

const INTERNAL_FIELD_PATTERN =
  /\b(?:SOURCE_ID|sourceId|fileId|fileName|memoryGenerationId|chunkId|pageStart|pageEnd|blockIds|quotedText|documentAnswer|retrievalBuckets|retrievalReasons|filingRetrievalBuckets|citation\s+verifier|model-generated\s+claim)\b:?/gi;

function cleanUserFacingText(value: string) {
  return value
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ')
    .replace(INTERNAL_FIELD_PATTERN, 'source')
    .replace(/\bsrc_\d+\b/gi, 'source')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

function truncate(value: string, maxLength: number) {
  const clean = cleanUserFacingText(value.replace(/\s+/g, ' '));
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3).trim()}...`;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sourceIdsFromDocumentAnswer(answer: LegalDocumentAnswer, sourcePackets: LegalDocumentSourcePacket[]) {
  const knownSourceIds = new Set(sourcePackets.map((packet) => packet.sourceId));
  const supportedSourceIds = unique([
    ...answer.claims.flatMap((claim) => claim.sourceIds),
    ...answer.citations.map((citation) => citation.sourceId),
  ]).filter((sourceId) => knownSourceIds.has(sourceId));

  return supportedSourceIds.length > 0
    ? supportedSourceIds
    : sourcePackets.map((packet) => packet.sourceId);
}

function sourcePriorityScore(source: LegalDocumentSourcePacket, message: string) {
  const text = `${source.sectionHeading ?? ''} ${source.text}`.toLowerCase();
  const lowerMessage = message.toLowerCase();
  let score = 0;
  if (/\b(father'?s day|mother'?s day|holiday|specific)\b/i.test(lowerMessage) && /\b(father'?s day|mother'?s day|holiday possession|specific)\b/i.test(text)) score += 80;
  if (/\b(possession|access|visitation|pickup|pick up|exchange|weekend)\b/i.test(lowerMessage) && /\b(possession|access|visitation|pickup|pick up|exchange|weekend)\b/i.test(text)) score += 40;
  if (/\b(except as otherwise|notwithstanding|supersedes|later signed|modification)\b/i.test(text)) score += 30;
  if (/\b(order|ordered|shall|must|required|prohibited|allowed)\b/i.test(text)) score += 20;
  for (const token of lowerMessage.match(/\b[a-z]{4,}\b/g) ?? []) {
    if (text.includes(token)) score += 2;
  }
  return score;
}

function selectSourcePackets(
  answer: LegalDocumentAnswer,
  sourcePackets: LegalDocumentSourcePacket[],
  message: string
) {
  const packetsBySourceId = new Map(sourcePackets.map((packet) => [packet.sourceId, packet]));
  const orderedSourceIds = sourceIdsFromDocumentAnswer(answer, sourcePackets);
  return orderedSourceIds
    .map((sourceId) => packetsBySourceId.get(sourceId))
    .filter((packet): packet is LegalDocumentSourcePacket => Boolean(packet))
    .sort((a, b) => sourcePriorityScore(b, message) - sourcePriorityScore(a, message));
}

function prioritySignal(source: LegalDocumentSourcePacket): LegalInterpretationPrioritySignal {
  const text = `${source.sectionHeading ?? ''} ${source.text}`;
  if (/\bnotwithstanding\b/i.test(text)) return 'notwithstanding';
  if (/\bexcept as otherwise\b/i.test(text)) return 'except_as_otherwise_provided';
  if (/\b(later signed|modification|modified|supersedes?)\b/i.test(text)) return 'later_modification';
  return 'specific_over_general';
}

function cleanAnswer(answer: LegalDocumentAnswer) {
  const clean = cleanUserFacingText(answer.answer);
  if (!clean || GENERIC_DOCUMENT_ANSWER_PATTERN.test(clean)) {
    return 'Here is what the visible order language supports.';
  }
  return clean;
}

function fathersDayOutcome(controlling: LegalDocumentSourcePacket | undefined) {
  if (!controlling || !sourceContainsOperativeFatherDaySchedule(controlling)) return null;
  const schedule = extractFathersDayScheduleTerms(controlling.text);
  if (!schedule) return null;
  return `Father's Day possession begins Friday at ${displayScheduleTime(schedule.startTime)} and ends Monday at ${displayScheduleTime(schedule.endTime)}`;
}

function draftFromAnswer(
  answer: LegalDocumentAnswer,
  controlling: LegalDocumentSourcePacket | undefined,
  asksFatherDay: boolean,
  canonicalAnswer: string
) {
  if (answer.answerType === 'not_found') return null;
  if (asksFatherDay) {
    const outcome = fathersDayOutcome(controlling);
    if (!outcome) return null;
    return {
      tone: 'neutral' as const,
      text: `I reviewed the Father’s Day provisions. ${outcome} I plan to follow that specific schedule.`,
    };
  }
  return {
    tone: 'neutral' as const,
    text: `Based on the order language I reviewed, ${canonicalAnswer} I plan to follow the order as written.`,
  };
}

export function buildBestEffortLegalInterpretationFromDocumentAnswer(
  documentAnswer: LegalDocumentAnswer | null | undefined,
  sourcePackets: LegalDocumentSourcePacket[],
  documentReference: DocumentReferenceDetection,
  userMessage: string
): LegalInterpretationAnswer | null {
  if (!documentAnswer) return null;

  const asksFatherDay = containsFathersDay(userMessage) ||
    documentReference.requestedTerms.some(containsFathersDay);
  const answerSelectedSources = selectSourcePackets(documentAnswer, sourcePackets, userMessage);
  const selectedSources = asksFatherDay
    ? [
      ...answerSelectedSources,
      ...sourcePackets.filter((source) =>
        sourceIsRelevantToIssue(source, userMessage) &&
        !answerSelectedSources.some((selected) => selected.sourceId === source.sourceId)
      ),
    ].sort((a, b) => sourcePriorityScore(b, userMessage) - sourcePriorityScore(a, userMessage))
    : answerSelectedSources;
  const controllingSources = asksFatherDay
    ? selectedSources.filter(sourceContainsOperativeFatherDaySchedule).slice(0, 1)
    : selectedSources.filter((source) => sourceIsRelevantToIssue(source, userMessage)).slice(0, 1);
  const competingSources = selectedSources
    .filter((source) => !controllingSources.some((controllingSource) => controllingSource.sourceId === source.sourceId))
    .filter((source) => asksFatherDay ? sourceContainsGeneralHolidayExtension(source) : inferClauseRelationship(source) === 'general_default')
    .slice(0, 1);
  const controlling = controllingSources[0];
  const canonicalAnswer = asksFatherDay
    ? (() => {
      const outcome = fathersDayOutcome(controlling) ?? cleanAnswer(documentAnswer);
      return /\bthursday\b/i.test(userMessage)
        ? `No. ${outcome}, not Thursday. The general Thursday-start rule does not move this separately scheduled Father's Day period.`
        : outcome;
    })()
    : cleanAnswer(documentAnswer);
  const hasUsableSources = controllingSources.length > 0;
  const hasClauseConflictSignal =
    documentReference.referenceType === 'clause_conflict_interpretation' ||
    /\b(conflict|controls?|which clause|specific|general|thursday|friday|father'?s day|mother'?s day)\b/i.test(userMessage);

  if (!hasUsableSources || documentAnswer.answerType === 'not_found') {
    const answerText = cleanUserFacingText(documentAnswer.answer || 'I do not see enough visible order language to answer that directly.');
    return {
      answerType: 'order_interpretation',
      directAnswer: answerText,
      userFacingCertainty: 'insufficient_text',
      controllingClauses: [],
      competingClauses: [],
      interactingClauses: [],
      explanationSteps: [],
      priorityLanguage: [],
      interpretation: {
        plainEnglish: answerText,
        legalReading: 'I would not infer a right, deadline, or exception that is not visible in the order language available here.',
        opposingArgument: null,
        responseToOpposingArgument: null,
      },
      practicalMeaning: {
        result: 'Use only the visible order language for now, and check the missing page or later signed order before relying on a disputed provision.',
        startTime: null,
        endTime: null,
        whatUserShouldDo: 'If you have the missing page or later signed order, upload it or ask me to check that exact page.',
      },
      draftMessage: null,
      caveats: ['The visible order language available here does not answer every part of the question.'],
      materialLimitation: 'The operative provision needed to answer this question is not visible in the available order language.',
    };
  }

  const prioritySources = selectedSources
    .filter((source) => sourceContainsPriorityCarveout(source) || /\b(supersedes?|later signed|modification|modified)\b/i.test(`${source.sectionHeading ?? ''} ${source.text}`))
    .slice(0, 2);
  const prioritySourceIds = prioritySources.length > 0
    ? unique([
      ...controllingSources.map((source) => source.sourceId),
      ...prioritySources.map((source) => source.sourceId),
      ...competingSources.map((source) => source.sourceId),
    ]).slice(0, 4)
    : competingSources.length > 0
      ? unique([
        ...controllingSources.map((source) => source.sourceId),
        ...competingSources.map((source) => source.sourceId),
      ]).slice(0, 4)
      : controllingSources.map((source) => source.sourceId).slice(0, 4);
  const priorityExplanation = asksFatherDay && prioritySources.some(sourceContainsPriorityCarveout)
    ? '“Except as otherwise expressly provided” makes the Thursday extension a default, not a rule that changes a separate schedule. The Father’s Day paragraph supplies that schedule, so the provisions do not contradict each other. The general rule remains valid within its scope.'
    : competingSources.length > 0 || hasClauseConflictSignal
      ? 'The separately stated schedule applies to this possession period. The broader weekend rule remains valid only for weekends within its stated scope.'
    : 'The signed order language should be followed as written unless a later signed order changes it.';

  return {
    answerType: 'order_interpretation',
    directAnswer: canonicalAnswer,
    userFacingCertainty: documentAnswer.answerType === 'needs_review' ? 'best_reading' : 'best_reading',
    controllingClauses: controllingSources.map((source) => ({
      label: source.sectionHeading || 'Visible order provision',
      quote: truncate(source.text, 500),
      sourceIds: [source.sourceId],
      pageStart: source.pageStart ?? null,
      pageEnd: source.pageEnd ?? source.pageStart ?? null,
    })),
    competingClauses: competingSources.map((source) => ({
      label: source.sectionHeading || 'General default provision',
      quote: truncate(source.text, 500),
      sourceIds: [source.sourceId],
      whyItDoesOrDoesNotControl: 'This is the general default for qualifying weekend periods. It remains valid, but it does not replace a separately stated schedule for this event.',
    })),
    interactingClauses: unique([...competingSources, ...prioritySources].map((source) => source.sourceId))
      .map((sourceId) => selectedSources.find((source) => source.sourceId === sourceId))
      .filter((source): source is LegalDocumentSourcePacket => Boolean(source))
      .map((source) => ({
        label: source.sectionHeading || (sourceContainsPriorityCarveout(source) ? 'Scope language' : 'General default provision'),
        relationship: inferClauseRelationship(source),
        quote: truncate(source.text, 500),
        sourceIds: [source.sourceId],
        scope: sourceContainsPriorityCarveout(source)
          ? 'This language limits when the general rule applies.'
          : 'This language applies to qualifying weekend possession periods without a separately stated schedule.',
        effectOnOutcome: asksFatherDay
          ? sourceContainsPriorityCarveout(source)
            ? 'It directs the reader to use the separately stated Father’s Day schedule.'
            : 'It does not move the separately scheduled Father’s Day period to Thursday.'
          : sourceContainsPriorityCarveout(source)
            ? 'It directs the reader to use the separately stated provision for this issue.'
            : 'The general provision remains valid only for situations within its stated scope.',
      })),
    explanationSteps: [{
      point: priorityExplanation,
      sourceIds: prioritySourceIds,
    }],
    priorityLanguage: (prioritySources.length > 0 || competingSources.length > 0) && prioritySourceIds.length > 0
      ? [{
        signal: prioritySources.length > 0 ? prioritySignal(prioritySources[0]) : 'specific_over_general',
        explanation: priorityExplanation,
        sourceIds: prioritySourceIds,
      }]
      : [],
    interpretation: {
      plainEnglish: canonicalAnswer,
      legalReading: priorityExplanation,
      opposingArgument: competingSources.length > 0
        ? 'The other parent may be relying on the broader or general provision.'
        : null,
      responseToOpposingArgument: competingSources.length > 0
        ? asksFatherDay
          ? 'The other parent is focusing on the Friday-holiday rule but leaving out its opening exception and the separately stated Father\'s Day schedule.'
          : 'The practical response is to identify the separate schedule and the scope language that limits the broader rule.'
        : null,
    },
    practicalMeaning: {
      result: canonicalAnswer,
      startTime: null,
      endTime: null,
      whatUserShouldDo: asksFatherDay && /\b(?:argues?|fights? back|keeps? saying|what if)\b/i.test(userMessage)
        ? 'If the other parent continues to dispute it, respond briefly with the Father\'s Day start time and the opening exception in the general holiday rule.'
        : 'Keep any response calm, short, and tied to the order language.',
    },
    draftMessage: draftFromAnswer(documentAnswer, controlling, asksFatherDay, canonicalAnswer),
    caveats: [],
    materialLimitation: null,
  };
}
