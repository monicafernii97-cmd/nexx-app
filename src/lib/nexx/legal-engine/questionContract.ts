import { containsFathersDay } from './clauseRelationship';
import { extractSharedLegalTerms, requestsCommunicationDraft } from './legalSignals';

export type LegalQuestionContract = {
  kind:
    | 'yes_no' | 'either_or' | 'selection' | 'meaning' | 'schedule'
    | 'communication' | 'scope' | 'capability' | 'confirmation'
    | 'correction' | 'status' | 'open_analysis' | 'other';
  subjectLabel: string | null;
  alternatives: string[];
  requiredAnswerTerms: string[];
  requiresDirectDisposition: boolean;
  requiresPracticalNextStep: boolean;
};

export function buildLegalQuestionContract(message: string): LegalQuestionContract {
  const terms = extractSharedLegalTerms(message);
  const alternatives = ['thursday', 'friday', 'saturday', 'sunday', 'monday'].filter((day) => new RegExp(`\\b${day}\\b`, 'i').test(message));
  const communication = requestsCommunicationDraft(message);
  const capability = /\b(?:can|could|do)\s+you\s+(?:read|access|see|search|review|open)|\bdo\s+you\s+have\s+(?:access|the\s+file)\b/i.test(message);
  const selection = /^(?:the\s+)?(?:first|second|third|last|latest|former|latter|option\s+\d+|\d+)\b/i.test(message);
  const confirmation = /^(?:yes|yeah|yep|correct|right|okay|ok|sure|please\s+do\s+so|do\s+it)[.! ]*$/i.test(message);
  const correction = /^(?:no[, ]+|wait[, ]+|actually\b|not\s+that\b|i\s+meant\b|correction\b)|\b(?:wrong|incorrect|look\s+again|recheck)\b/i.test(message);
  const status = /\b(?:status|ready|finished|done|progress|still\s+processing)\b/i.test(message);
  const scope = /\b(?:which|what)\s+(?:part|page|section|scope)|\bfocused\s+(?:review|question)\b/i.test(message);
  const openAnalysis = /\b(?:analy[sz]e|review|summari[sz]e|assess)\b/i.test(message);
  const direct = /\?|\b(?:mean|means|start|starts|begin|begins|control|controls|allowed|can|does|is|are|what if)\b/i.test(message);
  const subjectLabel = containsFathersDay(message)
    ? "Father's Day possession"
    : terms.includes('possession') || terms.includes('weekend possession')
      ? 'the possession period'
      : null;
  return {
    kind: communication ? 'communication'
      : capability ? 'capability'
      : selection ? 'selection'
      : confirmation ? 'confirmation'
      : correction ? 'correction'
      : status ? 'status'
      : scope ? 'scope'
      : alternatives.length >= 2 ? 'either_or'
      : alternatives.length === 1 ? 'schedule'
      : /\b(?:mean|explain|interpret)\b/i.test(message) ? 'meaning'
      : openAnalysis ? 'open_analysis'
      : direct ? 'yes_no'
      : 'other',
    subjectLabel,
    alternatives,
    requiredAnswerTerms: Array.from(new Set([...(containsFathersDay(message) && subjectLabel ? [subjectLabel] : []), ...alternatives])),
    requiresDirectDisposition: direct,
    requiresPracticalNextStep: communication || /\b(?:fights? back|argues?|keeps? saying|what if)\b/i.test(message),
  };
}
