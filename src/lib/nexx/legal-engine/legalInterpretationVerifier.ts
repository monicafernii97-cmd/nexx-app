import type { LegalDocumentSourcePacket } from '../legalDocumentAnswer';
import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import { clauseQuoteSupported, sourceIsRelevantToIssue } from './clauseRelationship';

export type LegalInterpretationVerification = {
  passed: boolean;
  errors: string[];
  checks: {
    answeredDirectly: boolean;
    hasControllingClause: boolean;
    hasCompetingClauseWhenNeeded: boolean;
    resolvedClauseConflict: boolean;
    hasPracticalMeaning: boolean;
    avoidsOverHedging: boolean;
    citationsValid: boolean;
    quotesSupported: boolean;
    clauseRolesRelevant: boolean;
    noBackendArtifacts: boolean;
  };
};

const INTERNAL_LEAK_KEYS = [
  'sourceId',
  'fileId',
  'fileName',
  'memoryGenerationId',
  'chunkId',
  'pageStart',
  'pageEnd',
  'blockIds',
  'quotedText',
  'documentAnswer',
  'retrievalBuckets',
  'retrievalReasons',
  'filingRetrievalBuckets',
];

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(collectText).join(' ');
  }
  return '';
}

function hasBackendArtifacts(answer: LegalInterpretationAnswer | null | undefined) {
  if (!answer) return false;
  const text = collectText(answer);
  return INTERNAL_LEAK_KEYS.some((key) => text.includes(`"${key}"`) || text.includes(`${key}:`));
}

function hasValidSourceIds(sourceIds: string[], sourcePackets: LegalDocumentSourcePacket[]) {
  const knownSourceIds = new Set(sourcePackets.map((packet) => packet.sourceId));
  return sourceIds.length > 0 && sourceIds.every((sourceId) => knownSourceIds.has(sourceId));
}

function answerText(answer: LegalInterpretationAnswer) {
  return [
    answer.directAnswer,
    answer.interpretation.plainEnglish,
    answer.interpretation.legalReading,
    answer.practicalMeaning.result,
    answer.draftMessage?.text,
  ].filter(Boolean).join(' ');
}

export function verifyLegalInterpretationAnswer(
  answer: LegalInterpretationAnswer | null | undefined,
  sourcePackets: LegalDocumentSourcePacket[],
  options: {
    requiresLegalInterpretation: boolean;
    hasClauseConflictSignal: boolean;
    userMessage?: string;
  }
): LegalInterpretationVerification {
  const errors: string[] = [];

  if (!options.requiresLegalInterpretation) {
    return {
      passed: true,
      errors,
      checks: {
        answeredDirectly: true,
        hasControllingClause: true,
        hasCompetingClauseWhenNeeded: true,
        resolvedClauseConflict: true,
        hasPracticalMeaning: true,
        avoidsOverHedging: true,
        citationsValid: true,
        quotesSupported: true,
        clauseRolesRelevant: true,
        noBackendArtifacts: true,
      },
    };
  }

  if (!answer) {
    return {
      passed: false,
      errors: ['Legal interpretation route requires legalInterpretation.'],
      checks: {
        answeredDirectly: false,
        hasControllingClause: false,
        hasCompetingClauseWhenNeeded: false,
        resolvedClauseConflict: false,
        hasPracticalMeaning: false,
        avoidsOverHedging: false,
        citationsValid: false,
        quotesSupported: false,
        clauseRolesRelevant: false,
        noBackendArtifacts: true,
      },
    };
  }

  const text = answerText(answer);
  const answeredDirectly = answer.directAnswer.trim().length >= 12;
  const hasControllingClause =
    answer.userFacingCertainty === 'insufficient_text' ||
    answer.controllingClauses.some((clause) => hasValidSourceIds(clause.sourceIds, sourcePackets));
  const hasCompetingClauseWhenNeeded =
    !options.hasClauseConflictSignal ||
    answer.userFacingCertainty === 'insufficient_text' ||
    answer.competingClauses.some((clause) => hasValidSourceIds(clause.sourceIds, sourcePackets)) ||
    (answer.interactingClauses ?? []).some((clause) =>
      ['general_default', 'express_exception', 'special_rule', 'genuine_conflict'].includes(clause.relationship) &&
      hasValidSourceIds(clause.sourceIds, sourcePackets)
    );
  const resolvedClauseConflict =
    !options.hasClauseConflictSignal ||
    answer.userFacingCertainty === 'insufficient_text' ||
    answer.interpretation.legalReading.trim().length >= 24 ||
    answer.priorityLanguage.length > 0 ||
    (answer.explanationSteps?.length ?? 0) > 0;
  const hasPracticalMeaning = answer.practicalMeaning.result.trim().length >= 12;
  const avoidsOverHedging =
    answer.userFacingCertainty !== 'clear' ||
    !/\b(?:may control|might control|non[-\s]?frivolous|cannot safely support every part|not enough text)\b/i.test(text);
  const citationsValid =
    answer.userFacingCertainty === 'insufficient_text' ||
    [
      ...answer.controllingClauses.map((clause) => clause.sourceIds),
      ...answer.competingClauses.map((clause) => clause.sourceIds),
      ...answer.priorityLanguage.map((item) => item.sourceIds),
      ...(answer.interactingClauses ?? []).map((clause) => clause.sourceIds),
      ...(answer.explanationSteps ?? []).map((item) => item.sourceIds),
    ].every((sourceIds) => sourceIds.length === 0 || hasValidSourceIds(sourceIds, sourcePackets));
  const noBackendArtifacts = !hasBackendArtifacts(answer);
  const quotedClauses = [
    ...answer.controllingClauses,
    ...answer.competingClauses,
    ...(answer.interactingClauses ?? []),
  ];
  const quotesSupported = answer.userFacingCertainty === 'insufficient_text' ||
    quotedClauses.every((clause) => clauseQuoteSupported(clause.quote, clause.sourceIds, sourcePackets));
  const packetsById = new Map(sourcePackets.map((packet) => [packet.sourceId, packet]));
  const clauseRolesRelevant = answer.userFacingCertainty === 'insufficient_text' ||
    answer.controllingClauses.every((clause) => clause.sourceIds.some((sourceId) => {
      const source = packetsById.get(sourceId);
      return Boolean(source && sourceIsRelevantToIssue(source, options.userMessage));
    }));

  if (!answeredDirectly) errors.push('Legal interpretation did not answer directly.');
  if (!hasControllingClause) errors.push('Legal interpretation is missing a valid controlling clause source.');
  if (!hasCompetingClauseWhenNeeded) errors.push('Clause-conflict interpretation is missing a competing clause source.');
  if (!resolvedClauseConflict) errors.push('Clause-conflict interpretation did not resolve why one provision controls.');
  if (!hasPracticalMeaning) errors.push('Legal interpretation is missing practical meaning.');
  if (!avoidsOverHedging) errors.push('Clear legal interpretation contains over-hedged language.');
  if (!citationsValid) errors.push('Legal interpretation cites unknown source IDs.');
  if (!quotesSupported) errors.push('Legal interpretation clause quote is not supported by its cited source.');
  if (!clauseRolesRelevant) errors.push('Legal interpretation controlling clause is not operative for the user issue.');
  if (!noBackendArtifacts) errors.push('Legal interpretation contains backend/internal artifact labels.');

  return {
    passed: errors.length === 0,
    errors,
    checks: {
      answeredDirectly,
      hasControllingClause,
      hasCompetingClauseWhenNeeded,
      resolvedClauseConflict,
      hasPracticalMeaning,
      avoidsOverHedging,
      citationsValid,
      quotesSupported,
      clauseRolesRelevant,
      noBackendArtifacts,
    },
  };
}
