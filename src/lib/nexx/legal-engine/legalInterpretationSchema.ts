export type LegalInterpretationCertainty =
  | 'clear'
  | 'best_reading'
  | 'ambiguous'
  | 'insufficient_text';

export type LegalInterpretationPrioritySignal =
  | 'except_as_otherwise_provided'
  | 'notwithstanding'
  | 'specific_over_general'
  | 'later_modification'
  | 'other';

export type LegalInterpretationAnswer = {
  answerType: 'order_interpretation';
  directAnswer: string;
  userFacingCertainty: LegalInterpretationCertainty;
  controllingClauses: Array<{
    label: string;
    quote: string;
    sourceIds: string[];
    pageStart?: number | null;
    pageEnd?: number | null;
  }>;
  competingClauses: Array<{
    label: string;
    quote: string;
    sourceIds: string[];
    whyItDoesOrDoesNotControl: string;
  }>;
  priorityLanguage: Array<{
    signal: LegalInterpretationPrioritySignal;
    explanation: string;
    sourceIds: string[];
  }>;
  interpretation: {
    plainEnglish: string;
    legalReading: string;
    opposingArgument?: string | null;
    responseToOpposingArgument?: string | null;
  };
  practicalMeaning: {
    result: string;
    startTime?: string | null;
    endTime?: string | null;
    whatUserShouldDo?: string | null;
  };
  draftMessage?: {
    tone: 'neutral' | 'firm' | 'court_ready';
    text: string;
  } | null;
  caveats: string[];
};

const CERTAINTY_VALUES = new Set<LegalInterpretationCertainty>([
  'clear',
  'best_reading',
  'ambiguous',
  'insufficient_text',
]);

const PRIORITY_SIGNAL_VALUES = new Set<LegalInterpretationPrioritySignal>([
  'except_as_otherwise_provided',
  'notwithstanding',
  'specific_over_general',
  'later_modification',
  'other',
]);

const DRAFT_TONES = new Set(['neutral', 'firm', 'court_ready']);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalNumber(value: unknown) {
  return value === undefined || value === null || typeof value === 'number';
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === 'string';
}

function validateClause(value: unknown, requireControlReason = false) {
  if (!isObject(value)) return false;
  if (typeof value.label !== 'string') return false;
  if (typeof value.quote !== 'string') return false;
  if (!isStringArray(value.sourceIds)) return false;
  if (!isOptionalNumber(value.pageStart)) return false;
  if (!isOptionalNumber(value.pageEnd)) return false;
  if (requireControlReason && typeof value.whyItDoesOrDoesNotControl !== 'string') return false;
  return true;
}

export function validateLegalInterpretationAnswerShape(value: unknown): value is LegalInterpretationAnswer {
  if (!isObject(value)) return false;
  if (value.answerType !== 'order_interpretation') return false;
  if (typeof value.directAnswer !== 'string') return false;
  if (typeof value.userFacingCertainty !== 'string') return false;
  if (!CERTAINTY_VALUES.has(value.userFacingCertainty as LegalInterpretationCertainty)) return false;
  if (!Array.isArray(value.controllingClauses) || !value.controllingClauses.every((clause) => validateClause(clause))) return false;
  if (!Array.isArray(value.competingClauses) || !value.competingClauses.every((clause) => validateClause(clause, true))) return false;
  if (!Array.isArray(value.priorityLanguage)) return false;
  if (!value.priorityLanguage.every((item) => (
    isObject(item) &&
    typeof item.signal === 'string' &&
    PRIORITY_SIGNAL_VALUES.has(item.signal as LegalInterpretationPrioritySignal) &&
    typeof item.explanation === 'string' &&
    isStringArray(item.sourceIds)
  ))) return false;
  if (!isObject(value.interpretation)) return false;
  if (typeof value.interpretation.plainEnglish !== 'string') return false;
  if (typeof value.interpretation.legalReading !== 'string') return false;
  if (!isOptionalString(value.interpretation.opposingArgument)) return false;
  if (!isOptionalString(value.interpretation.responseToOpposingArgument)) return false;
  if (!isObject(value.practicalMeaning)) return false;
  if (typeof value.practicalMeaning.result !== 'string') return false;
  if (!isOptionalString(value.practicalMeaning.startTime)) return false;
  if (!isOptionalString(value.practicalMeaning.endTime)) return false;
  if (!isOptionalString(value.practicalMeaning.whatUserShouldDo)) return false;
  if (value.draftMessage !== null && value.draftMessage !== undefined) {
    if (!isObject(value.draftMessage)) return false;
    if (typeof value.draftMessage.tone !== 'string' || !DRAFT_TONES.has(value.draftMessage.tone)) return false;
    if (typeof value.draftMessage.text !== 'string') return false;
  }
  if (!isStringArray(value.caveats)) return false;
  return true;
}
