import { containsFathersDay } from './clauseRelationship';
import { extractSharedLegalTerms } from './legalSignals';

export type LegalQuestionContract = {
  kind: 'yes_no' | 'either_or' | 'meaning' | 'schedule' | 'communication' | 'other';
  subjectLabel: string | null;
  alternatives: string[];
  requiredAnswerTerms: string[];
  requiresDirectDisposition: boolean;
  requiresPracticalNextStep: boolean;
};

export function buildLegalQuestionContract(message: string): LegalQuestionContract {
  const terms = extractSharedLegalTerms(message);
  const alternatives = ['thursday', 'friday', 'saturday', 'sunday', 'monday'].filter((day) => new RegExp(`\\b${day}\\b`, 'i').test(message));
  const communication = /\b(?:what|how)\s+(?:should|do)\s+i\s+(?:say|respond|reply)|message|text back\b/i.test(message);
  const direct = /\?|\b(?:mean|means|start|starts|begin|begins|control|controls|allowed|can|does|is|are|what if)\b/i.test(message);
  const subjectLabel = containsFathersDay(message)
    ? "Father's Day possession"
    : terms.includes('possession') || terms.includes('weekend possession')
      ? 'the possession period'
      : null;
  return {
    kind: communication ? 'communication' : alternatives.length >= 2 ? 'either_or' : alternatives.length === 1 ? 'schedule' : direct ? 'yes_no' : 'other',
    subjectLabel,
    alternatives,
    requiredAnswerTerms: Array.from(new Set([...(containsFathersDay(message) && subjectLabel ? [subjectLabel] : []), ...alternatives])),
    requiresDirectDisposition: direct,
    requiresPracticalNextStep: communication || /\b(?:fights? back|argues?|keeps? saying|what if)\b/i.test(message),
  };
}
