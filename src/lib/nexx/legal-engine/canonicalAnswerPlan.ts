import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import { buildLegalQuestionContract, type LegalQuestionContract } from './questionContract';
import { responsePlanFromLegalInterpretation } from './responsePlan';

export type CanonicalLegalAnswerPlan = {
  version: 1;
  issueId: string | null;
  question: LegalQuestionContract;
  conclusion: {
    disposition: 'yes' | 'no' | 'qualified' | 'explanation' | 'cannot_determine';
    proposition: string;
    sourceIds: string[];
  };
  reasons: Array<{
    proposition: string;
    sourceIds: string[];
    purpose: 'operative_rule' | 'scope_translation' | 'interaction' | 'counterargument' | 'limitation';
  }>;
  practicalOutcome: { proposition: string; start: string | null; end: string | null } | null;
  nextAction: string | null;
  communicationDraft: { tone: 'neutral' | 'firm'; text: string } | null;
  materialLimitation: string | null;
};

function dispositionFor(answer: LegalInterpretationAnswer): CanonicalLegalAnswerPlan['conclusion']['disposition'] {
  if (answer.userFacingCertainty === 'insufficient_text') return 'cannot_determine';
  if (/^\s*no\b/i.test(answer.directAnswer)) return 'no';
  if (/^\s*yes\b/i.test(answer.directAnswer)) return 'yes';
  if (answer.userFacingCertainty === 'ambiguous') return 'qualified';
  return 'explanation';
}

export function canonicalAnswerPlanFromLegalInterpretation(
  answer: LegalInterpretationAnswer,
  userMessage: string,
  issueId: string | null = null
): CanonicalLegalAnswerPlan {
  const legacy = responsePlanFromLegalInterpretation(answer, userMessage);
  return {
    version: 1,
    issueId,
    question: buildLegalQuestionContract(userMessage),
    conclusion: {
      disposition: dispositionFor(answer),
      proposition: legacy.directAnswer,
      sourceIds: Array.from(new Set(answer.controllingClauses.flatMap((clause) => clause.sourceIds))),
    },
    reasons: legacy.explanationSteps.map((step, index) => ({
      proposition: step.point,
      sourceIds: step.sourceIds,
      purpose: index === 0 ? 'scope_translation' as const : 'interaction' as const,
    })),
    practicalOutcome: legacy.practicalOutcome ? {
      proposition: legacy.practicalOutcome,
      start: answer.practicalMeaning.startTime ?? null,
      end: answer.practicalMeaning.endTime ?? null,
    } : null,
    nextAction: legacy.nextAction ?? null,
    communicationDraft: legacy.communicationDraft ? {
      tone: answer.draftMessage?.tone === 'firm' || answer.draftMessage?.tone === 'court_ready' ? 'firm' : 'neutral',
      text: legacy.communicationDraft.text,
    } : null,
    materialLimitation: legacy.materialLimitation ?? null,
  };
}
