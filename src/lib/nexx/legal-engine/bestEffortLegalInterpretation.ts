import type { LegalDocumentAnswer, LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { DocumentReferenceDetection } from '../documentReferenceDetection';
import type { LegalInterpretationAnswer, LegalInterpretationPrioritySignal } from './legalInterpretationSchema';

const GENERIC_DOCUMENT_ANSWER_PATTERN =
  /\b(i found usable court-order language|organized the visible provisions|cite exact pages|stay grounded in the visible order language)\b/i;

const INTERNAL_FIELD_PATTERN =
  /\b(?:SOURCE_ID|sourceId|fileId|fileName|memoryGenerationId|chunkId|pageStart|pageEnd|blockIds|quotedText|documentAnswer|retrievalBuckets|retrievalReasons|citation\s+verifier|model-generated\s+claim)\b:?/gi;

function cleanUserFacingText(value: string) {
  return value
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
  return unique([
    ...answer.claims.flatMap((claim) => claim.sourceIds),
    ...answer.citations.map((citation) => citation.sourceId),
    ...sourcePackets.map((packet) => packet.sourceId),
  ]).filter((sourceId) => knownSourceIds.has(sourceId));
}

function sourcePriorityScore(source: LegalDocumentSourcePacket, message: string) {
  const text = `${source.sectionHeading ?? ''} ${source.text}`.toLowerCase();
  const lowerMessage = message.toLowerCase();
  let score = 0;
  if (/\b(father'?s day|mother'?s day|holiday possession|specific)\b/i.test(text)) score += 80;
  if (/\b(possession|access|visitation|pickup|pick up|exchange|weekend)\b/i.test(text)) score += 40;
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

function isCompetingGeneralClause(source: LegalDocumentSourcePacket, controlling: LegalDocumentSourcePacket | undefined) {
  const text = `${source.sectionHeading ?? ''} ${source.text}`;
  if (controlling && source.sourceId === controlling.sourceId) return false;
  return /\b(regular|general|weekend|thursday|student holiday|federal|state|local holiday)\b/i.test(text);
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

function draftFromAnswer(answer: LegalDocumentAnswer, controlling: LegalDocumentSourcePacket | undefined) {
  const controllingText = controlling?.text ? truncate(controlling.text, 220) : '';
  if (answer.answerType === 'not_found') return null;
  return {
    tone: 'neutral' as const,
    text: controllingText
      ? `Based on the order language I can see, I plan to follow this provision as written: "${controllingText}"`
      : 'Based on the order language I can see, I plan to follow the order as written.',
  };
}

export function buildBestEffortLegalInterpretationFromDocumentAnswer(
  documentAnswer: LegalDocumentAnswer | null | undefined,
  sourcePackets: LegalDocumentSourcePacket[],
  documentReference: DocumentReferenceDetection,
  userMessage: string
): LegalInterpretationAnswer | null {
  if (!documentAnswer) return null;

  const selectedSources = selectSourcePackets(documentAnswer, sourcePackets, userMessage);
  const controllingSources = selectedSources.slice(0, 3);
  const controlling = controllingSources[0];
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
    };
  }

  const competingSources = selectedSources
    .filter((source) => isCompetingGeneralClause(source, controlling))
    .slice(0, 2);
  const prioritySources = selectedSources
    .filter((source) => /\b(except as otherwise|notwithstanding|supersedes?|later signed|modification|specific|general)\b/i.test(`${source.sectionHeading ?? ''} ${source.text}`))
    .slice(0, 2);
  const prioritySourceIds = unique([
    ...controllingSources.map((source) => source.sourceId),
    ...competingSources.map((source) => source.sourceId),
    ...prioritySources.map((source) => source.sourceId),
  ]).slice(0, 4);
  const priorityExplanation = competingSources.length > 0 || hasClauseConflictSignal
    ? 'The specific order language is the stronger reading over a general provision unless a later signed order changes it.'
    : 'The signed order language should be followed as written unless a later signed order changes it.';

  return {
    answerType: 'order_interpretation',
    directAnswer: cleanAnswer(documentAnswer),
    userFacingCertainty: documentAnswer.answerType === 'needs_review' ? 'best_reading' : 'best_reading',
    controllingClauses: controllingSources.map((source) => ({
      label: source.sectionHeading || 'Visible order provision',
      quote: truncate(source.text, 500),
      sourceIds: [source.sourceId],
      pageStart: source.pageStart ?? null,
      pageEnd: source.pageEnd ?? source.pageStart ?? null,
    })),
    competingClauses: competingSources.map((source) => ({
      label: source.sectionHeading || 'Potential competing provision',
      quote: truncate(source.text, 500),
      sourceIds: [source.sourceId],
      whyItDoesOrDoesNotControl: 'This appears to be general or competing language; it does not override a more specific provision that squarely addresses the same issue unless the order says so.',
    })),
    priorityLanguage: prioritySourceIds.length > 0
      ? [{
        signal: prioritySignal(prioritySources[0] ?? controlling),
        explanation: priorityExplanation,
        sourceIds: prioritySourceIds,
      }]
      : [],
    interpretation: {
      plainEnglish: cleanAnswer(documentAnswer),
      legalReading: priorityExplanation,
      opposingArgument: competingSources.length > 0
        ? 'The other parent may be relying on the broader or general provision.'
        : null,
      responseToOpposingArgument: competingSources.length > 0
        ? 'The practical response is to stay anchored to the specific order language that addresses this issue.'
        : null,
    },
    practicalMeaning: {
      result: cleanAnswer(documentAnswer),
      startTime: null,
      endTime: null,
      whatUserShouldDo: 'Keep any response calm, short, and tied to the order language.',
    },
    draftMessage: draftFromAnswer(documentAnswer, controlling),
    caveats: [],
  };
}
