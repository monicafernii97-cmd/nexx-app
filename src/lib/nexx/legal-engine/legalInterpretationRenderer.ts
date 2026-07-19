import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import { canonicalAnswerPlanFromLegalInterpretation } from './canonicalAnswerPlan';
import { requestsCommunicationDraft } from './legalSignals';
import {
  normalizeLegalProposition,
  semanticallyEquivalentLegalText,
  uniqueLegalPropositions,
} from './semanticDedup';

export type ConversationalLegalRenderMode =
  | 'quick_direct'
  | 'standard_explanation'
  | 'structured_clause_analysis'
  | 'draft_focused'
  | 'procedure_steps';

type LegalInterpretationRenderOptions = {
  renderMode?: ConversationalLegalRenderMode;
  userMessage?: string;
};

const INTERNAL_FIELD_PATTERN =
  /\b(?:sourceId|fileId|fileName|memoryGenerationId|chunkId|pageStart|pageEnd|blockIds|quotedText|documentAnswer|retrievalBuckets|retrievalReasons|filingRetrievalBuckets)\b:?/g;

function cleanUserFacingText(value: string) {
  return value
    .replace(INTERNAL_FIELD_PATTERN, 'source')
    .replace(/\bsrc_\d+\b/gi, 'source')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
}

function compactPageLabel(pageStart?: number | null, pageEnd?: number | null) {
  if (!pageStart) return '';
  return pageEnd && pageEnd !== pageStart
    ? `pp. ${pageStart}-${pageEnd}`
    : `p. ${pageStart}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sourcePageLabels(sourceIds: string[], sourcePackets: LegalDocumentSourcePacket[]) {
  const packetsBySourceId = new Map(sourcePackets.map((packet) => [packet.sourceId, packet]));
  return uniqueValues(
    sourceIds
      .map((sourceId) => {
        const packet = packetsBySourceId.get(sourceId);
        return compactPageLabel(packet?.pageStart, packet?.pageEnd);
      })
      .filter(Boolean)
  ).slice(0, 3);
}

function explicitPageLabels(
  sourceIds: string[],
  sourcePackets: LegalDocumentSourcePacket[],
  pageStart?: number | null,
  pageEnd?: number | null
) {
  const explicit = compactPageLabel(pageStart, pageEnd);
  return explicit ? [explicit] : sourcePageLabels(sourceIds, sourcePackets);
}

function appendCitationLabels(value: string, labels: string[]) {
  const clean = cleanUserFacingText(value);
  const usableLabels = uniqueValues(labels).slice(0, 3);
  if (!clean || usableLabels.length === 0 || /\[(?:p\.|pp\.)\s*\d+/i.test(clean)) return clean;
  return `${clean} ${usableLabels.map((label) => `[${label}]`).join(' ')}`;
}

function quoteLine(label: string, quote: string, labels: string[]) {
  const cleanLabel = cleanUserFacingText(label);
  const cleanQuote = cleanUserFacingText(quote);
  if (!cleanQuote) return '';
  const prefix = cleanLabel ? `**${cleanLabel}:** ` : '';
  return `- ${prefix}${appendCitationLabels(cleanQuote, labels)}`;
}

function inferRenderMode(
  answer: LegalInterpretationAnswer,
  options?: LegalInterpretationRenderOptions
): ConversationalLegalRenderMode {
  if (options?.renderMode) return options.renderMode;
  if (!options?.userMessage) return 'structured_clause_analysis';

  const message = options.userMessage;
  if (requestsCommunicationDraft(message)) {
    return 'draft_focused';
  }
  if (/\b(show\s+me\s+why|where\s+exactly|quote|exact\s+(?:wording|language)|which\s+(?:clause|provision)|clause\s+controls?|explain\s+the\s+clauses?)\b/i.test(message)) {
    return 'structured_clause_analysis';
  }
  if (/\b(how\s+do\s+i\s+file|steps?|procedure|deadline|serve|service|clerk|forms?)\b/i.test(message)) {
    return 'procedure_steps';
  }
  if (
    answer.competingClauses.length > 0 &&
    /\b(father'?s day|mother'?s day|holiday|clause|provision|general|specific|thursday|friday|controls?|conflicts?)\b/i.test(message)
  ) {
    return 'standard_explanation';
  }
  if (/\b(can|could|should|does|did|is|are|must|shall)\b.{0,80}\b(?:do\s+that|allowed|right|wrong|okay|ok|mean|means|gets?|have\s+to|supposed\s+to|change|take|keep|stop|start|pickup|pick\s+up|exchange)\b/i.test(message)) {
    return 'quick_direct';
  }
  if (answer.competingClauses.length > 0 || answer.priorityLanguage.length > 0) {
    return 'standard_explanation';
  }
  return 'quick_direct';
}

export function renderLegalInterpretationMarkdown(
  answer: LegalInterpretationAnswer,
  sourcePackets: LegalDocumentSourcePacket[],
  fallbackMessage: string,
  options?: LegalInterpretationRenderOptions
) {
  const canonicalPlan = canonicalAnswerPlanFromLegalInterpretation(answer, options?.userMessage ?? '');
  const plan = {
    directAnswer: canonicalPlan.conclusion.proposition,
    explanationSteps: canonicalPlan.reasons.map((reason) => ({ point: reason.proposition, sourceIds: reason.sourceIds })),
    practicalOutcome: canonicalPlan.practicalOutcome?.proposition ?? null,
    nextAction: canonicalPlan.nextAction,
    communicationDraft: canonicalPlan.communicationDraft,
    materialLimitation: canonicalPlan.materialLimitation,
  };
  const directAnswer = appendCitationLabels(
    plan.directAnswer || answer.interpretation.plainEnglish || fallbackMessage,
    sourcePageLabels(answer.controllingClauses.flatMap((clause) => clause.sourceIds), sourcePackets)
  );

  const controllingLines = answer.controllingClauses
    .slice(0, 3)
    .map((clause) => quoteLine(
      clause.label,
      clause.quote,
      explicitPageLabels(clause.sourceIds, sourcePackets, clause.pageStart, clause.pageEnd)
    ))
    .filter(Boolean);

  const competingLines = answer.competingClauses
    .slice(0, 3)
    .map((clause) => {
      const quote = quoteLine(clause.label, clause.quote, sourcePageLabels(clause.sourceIds, sourcePackets));
      const reason = cleanUserFacingText(clause.whyItDoesOrDoesNotControl);
      const reasonLine = reason ? `  ${reason}` : undefined;
      return [quote || (reason ? `- ${reason}` : ''), quote ? reasonLine : undefined]
        .filter(Boolean)
        .join('\n');
    })
    .filter(Boolean);

  const interactingLines = (answer.interactingClauses ?? [])
    .filter((clause) => clause.relationship !== 'unrelated')
    .slice(0, 3)
    .map((clause) => {
      const quote = quoteLine(clause.label, clause.quote, sourcePageLabels(clause.sourceIds, sourcePackets));
      const effect = cleanUserFacingText(clause.effectOnOutcome);
      return [quote, effect ? `  ${effect}` : undefined].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  const practicalResult = cleanUserFacingText(plan.practicalOutcome ?? '');
  const normalizedPractical = normalizeLegalProposition(practicalResult);
  const timeDetails = [
    answer.practicalMeaning.startTime && !normalizedPractical.includes(normalizeLegalProposition(answer.practicalMeaning.startTime))
      ? `Start: ${answer.practicalMeaning.startTime}.`
      : undefined,
    answer.practicalMeaning.endTime && !normalizedPractical.includes(normalizeLegalProposition(answer.practicalMeaning.endTime))
      ? `End: ${answer.practicalMeaning.endTime}.`
      : undefined,
  ];
  const practical = uniqueLegalPropositions([
    practicalResult,
    ...timeDetails,
    plan.nextAction,
  ]).join(' ');

  const whyText = uniqueLegalPropositions(
    plan.explanationSteps.map((step) => appendCitationLabels(
      step.point,
      sourcePageLabels(step.sourceIds, sourcePackets)
    ))
  ).join(' ');
  const relationshipText = uniqueLegalPropositions([
    ...(answer.interactingClauses ?? [])
      .filter((clause) => clause.relationship !== 'unrelated')
      .map((clause) => cleanUserFacingText(clause.effectOnOutcome)),
    ...answer.competingClauses.map((clause) => cleanUserFacingText(clause.whyItDoesOrDoesNotControl)),
  ]).filter((value) => !semanticallyEquivalentLegalText(value, whyText)).join(' ');

  const suggestedReply = plan.communicationDraft?.text
    ? `**Suggested reply:**\n\n"${cleanUserFacingText(plan.communicationDraft.text)}"`
    : undefined;

  const conversationalDraft = plan.communicationDraft?.text
    ? `I would keep it short and order-based:\n\n"${cleanUserFacingText(plan.communicationDraft.text)}"`
    : undefined;

  const ambiguityNote = answer.userFacingCertainty === 'ambiguous' && answer.caveats.length > 0
    ? `**Where it is genuinely unclear:** ${answer.caveats.map(cleanUserFacingText).filter(Boolean).join(' ')}`
    : undefined;

  const insufficientNote = answer.userFacingCertainty === 'insufficient_text' && plan.materialLimitation &&
    !semanticallyEquivalentLegalText(directAnswer, plan.materialLimitation, 0.64) &&
    !semanticallyEquivalentLegalText(practical, plan.materialLimitation, 0.64)
    ? cleanUserFacingText(plan.materialLimitation)
    : undefined;

  const renderMode = inferRenderMode(answer, options);

  if (renderMode === 'quick_direct') {
    return [
      directAnswer || 'I do not see enough supported order text to answer that directly.',
      whyText || undefined,
      practical || undefined,
      ambiguityNote,
      insufficientNote,
      conversationalDraft,
    ].filter(Boolean).join('\n\n');
  }

  if (renderMode === 'draft_focused') {
    return [
      plan.communicationDraft?.text
        ? `You can say:\n\n"${cleanUserFacingText(plan.communicationDraft.text)}"`
        : directAnswer || 'I would keep the response short and tied to the order.',
      whyText ? `Why this works: ${whyText}` : undefined,
      practical ? `Practical point: ${practical}` : undefined,
      ambiguityNote,
      insufficientNote,
    ].filter(Boolean).join('\n\n');
  }

  if (renderMode === 'standard_explanation') {
    return [
      directAnswer || 'I do not see enough supported order text to answer that directly.',
      relationshipText ? `**How the provisions work together:** ${relationshipText}` : undefined,
      whyText ? `**Why:** ${whyText}` : undefined,
      practical ? `**Practical meaning:** ${practical}` : undefined,
      ambiguityNote,
      insufficientNote,
      conversationalDraft,
    ].filter(Boolean).join('\n\n');
  }

  if (renderMode === 'procedure_steps') {
    const nextStep = answer.practicalMeaning.whatUserShouldDo || answer.practicalMeaning.result;
    return [
      directAnswer || answer.interpretation.plainEnglish || 'Here is the order-based starting point.',
      whyText ? `**Why:** ${whyText}` : undefined,
      nextStep ? `**Next step:** ${cleanUserFacingText(nextStep)}` : undefined,
      conversationalDraft,
      ambiguityNote,
      insufficientNote,
    ].filter(Boolean).join('\n\n');
  }

  return [
    directAnswer || 'I do not see enough supported order text to answer that directly.',
    controllingLines.length > 0 ? `**Controlling language:**\n${controllingLines.join('\n')}` : undefined,
    interactingLines.length > 0
      ? `**How the provisions work together:**\n${interactingLines.join('\n')}`
      : competingLines.length > 0
        ? `**How the provisions work together:**\n${competingLines.join('\n')}`
        : undefined,
    whyText ? `**Why this controls:** ${whyText}` : undefined,
    practical ? `**Practical meaning:** ${practical}` : undefined,
    ambiguityNote,
    insufficientNote,
    suggestedReply,
  ].filter(Boolean).join('\n\n');
}
