import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { LegalInterpretationAnswer } from './legalInterpretationSchema';

const INTERNAL_FIELD_PATTERN =
  /\b(?:sourceId|fileId|fileName|memoryGenerationId|chunkId|pageStart|pageEnd|blockIds|quotedText|documentAnswer|retrievalBuckets|retrievalReasons)\b:?/g;

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

export function renderLegalInterpretationMarkdown(
  answer: LegalInterpretationAnswer,
  sourcePackets: LegalDocumentSourcePacket[],
  fallbackMessage: string
) {
  const directAnswer = appendCitationLabels(
    answer.directAnswer || answer.interpretation.plainEnglish || fallbackMessage,
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

  const priorityLines = answer.priorityLanguage
    .slice(0, 3)
    .map((item) => appendCitationLabels(
      cleanUserFacingText(item.explanation),
      sourcePageLabels(item.sourceIds, sourcePackets)
    ))
    .filter(Boolean)
    .map((item) => `- ${item}`);

  const practical = [
    answer.practicalMeaning.result,
    answer.practicalMeaning.startTime ? `Start: ${answer.practicalMeaning.startTime}.` : undefined,
    answer.practicalMeaning.endTime ? `End: ${answer.practicalMeaning.endTime}.` : undefined,
    answer.practicalMeaning.whatUserShouldDo,
  ].filter(Boolean).map((item) => cleanUserFacingText(String(item))).join(' ');

  const suggestedReply = answer.draftMessage?.text
    ? `**Suggested reply:**\n\n"${cleanUserFacingText(answer.draftMessage.text)}"`
    : undefined;

  const ambiguityNote = answer.userFacingCertainty === 'ambiguous' && answer.caveats.length > 0
    ? `**Where it is genuinely unclear:** ${answer.caveats.map(cleanUserFacingText).filter(Boolean).join(' ')}`
    : undefined;

  const insufficientNote = answer.userFacingCertainty === 'insufficient_text' && answer.caveats.length > 0
    ? answer.caveats.map(cleanUserFacingText).filter(Boolean).join(' ')
    : undefined;

  return [
    directAnswer || 'I do not see enough supported order text to answer that directly.',
    controllingLines.length > 0 ? `**Controlling language:**\n${controllingLines.join('\n')}` : undefined,
    competingLines.length > 0 ? `**Competing language:**\n${competingLines.join('\n')}` : undefined,
    priorityLines.length > 0 ? `**Why this controls:**\n${priorityLines.join('\n')}` : undefined,
    answer.interpretation.legalReading
      ? `**Practical reading:** ${cleanUserFacingText(answer.interpretation.legalReading)}`
      : undefined,
    practical ? `**Practical meaning:** ${practical}` : undefined,
    ambiguityNote,
    insufficientNote,
    suggestedReply,
  ].filter(Boolean).join('\n\n');
}
