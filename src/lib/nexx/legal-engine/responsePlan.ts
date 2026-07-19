import type { LegalInterpretationAnswer } from './legalInterpretationSchema';
import { requestsCommunicationDraft } from './legalSignals';
import { uniqueLegalPropositions } from './semanticDedup';

export type LegalResponsePlan = {
  userGoal: string;
  directAnswer: string;
  explanationSteps: Array<{ point: string; sourceIds: string[] }>;
  practicalOutcome: string | null;
  nextAction: string | null;
  communicationDraft: {
    text: string;
    includeBecause: 'user_requested' | 'clearly_actionable';
  } | null;
  materialLimitation: string | null;
};

export function userAskedForDraft(message = '') {
  return requestsCommunicationDraft(message);
}

export function responsePlanFromLegalInterpretation(
  answer: LegalInterpretationAnswer,
  userMessage = ''
): LegalResponsePlan {
  const primaryLegacyExplanation = answer.interpretation.legalReading?.trim() ||
    answer.priorityLanguage[0]?.explanation?.trim() ||
    answer.competingClauses[0]?.whyItDoesOrDoesNotControl?.trim() ||
    '';
  const explanationSteps = answer.explanationSteps?.length
    ? answer.explanationSteps
    : uniqueLegalPropositions([primaryLegacyExplanation]).map((point) => ({
      point,
      sourceIds: [
        ...answer.priorityLanguage.flatMap((item) => item.sourceIds),
        ...answer.controllingClauses.flatMap((clause) => clause.sourceIds),
        ...answer.competingClauses.flatMap((clause) => clause.sourceIds),
      ],
    }));
  const nextAction = answer.practicalMeaning.whatUserShouldDo?.trim() || null;
  const practicalOutcome = answer.practicalMeaning.result?.trim() || null;
  const draftRequested = userAskedForDraft(userMessage);

  return {
    userGoal: userMessage.trim(),
    directAnswer: answer.directAnswer.trim(),
    explanationSteps: explanationSteps.slice(0, 3),
    practicalOutcome,
    nextAction: nextAction && practicalOutcome && nextAction === practicalOutcome ? null : nextAction,
    communicationDraft: answer.draftMessage?.text && draftRequested
      ? { text: answer.draftMessage.text.trim(), includeBecause: 'user_requested' }
      : null,
    materialLimitation: answer.materialLimitation?.trim() ||
      (answer.userFacingCertainty === 'insufficient_text' ? answer.caveats[0]?.trim() || null : null),
  };
}
