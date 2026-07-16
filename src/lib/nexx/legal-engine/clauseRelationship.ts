import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import { fuzzyTextContains } from '../legalDocumentAnswer';
import type { LegalClauseRelationship } from './legalInterpretationSchema';

export function containsFathersDay(value: string) {
  return /\bfather'?s day\b/i.test(value.replace(/[’‘]/g, "'"));
}

function combinedText(source: LegalDocumentSourcePacket) {
  return `${source.sectionHeading ?? ''} ${source.text}`;
}
export function inferClauseRelationship(source: LegalDocumentSourcePacket): LegalClauseRelationship {
  const text = combinedText(source);
  if (/\bexcept as otherwise(?: expressly)? provided\b|\bnotwithstanding\b|\bsubject to\b/i.test(text)) {
    return 'express_exception';
  }
  if (/\b(later signed|modification|modified order|amended order|supersedes?)\b/i.test(text)) {
    return 'superseded';
  }
  if (containsFathersDay(text) && /\b(begin(?:ning|s)?|start(?:ing|s)?|ending|ends?)\b/i.test(text)) {
    return 'special_rule';
  }
  if (/\b(regular|weekend period|weekend possession)\b/i.test(text)) return 'general_default';
  return 'supplemental';
}

export function sourceContainsOperativeFatherDaySchedule(source: LegalDocumentSourcePacket) {
  const text = combinedText(source);
  return containsFathersDay(text) &&
    /\b(begin(?:ning|s)?|start(?:ing|s)?)\b/i.test(text) &&
    /\bfriday\b/i.test(text) &&
    /\b(end(?:ing|s)?)\b/i.test(text) &&
    /\bmonday\b/i.test(text);
}

export function sourceContainsGeneralHolidayExtension(source: LegalDocumentSourcePacket) {
  const text = combinedText(source);
  return /\bweekend(?: period)?(?: of possession)?\b/i.test(text) &&
    /\b(begin(?:ning|s)?|start(?:ing|s)?)\b/i.test(text) &&
    /\b(?:friday|federal|student|teacher|holiday)\b/i.test(text) &&
    /\bthursday\b/i.test(text);
}

export function sourceContainsPriorityCarveout(source: LegalDocumentSourcePacket) {
  return /\bexcept as otherwise(?: expressly)? provided\b|\bnotwithstanding\b|\bsubject to\b/i.test(combinedText(source));
}

export function clauseQuoteSupported(quote: string, sourceIds: string[], sources: LegalDocumentSourcePacket[]) {
  const byId = new Map(sources.map((source) => [source.sourceId, source]));
  return sourceIds.length > 0 && sourceIds.some((sourceId) => {
    const source = byId.get(sourceId);
    return Boolean(source && fuzzyTextContains(source.text, quote));
  });
}

export function sourceIsRelevantToIssue(source: LegalDocumentSourcePacket, userMessage = '') {
  if (!userMessage.trim()) return true;
  const asksFatherDay = containsFathersDay(userMessage);
  if (!asksFatherDay) return true;
  return sourceContainsOperativeFatherDaySchedule(source) ||
    sourceContainsGeneralHolidayExtension(source) ||
    sourceContainsPriorityCarveout(source);
}
