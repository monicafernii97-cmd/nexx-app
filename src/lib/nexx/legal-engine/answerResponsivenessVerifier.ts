import { isGenericCanonicalLegalAnswer } from './genericAnswerPolicy';
import { buildLegalQuestionContract } from './questionContract';

export type AnswerResponsiveness = {
  passed: boolean;
  errors: string[];
};

export function verifyAnswerResponsiveness(args: {
  userMessage: string;
  directAnswer: string;
  practicalMeaning?: string;
  nextAction?: string;
}): AnswerResponsiveness {
  const contract = buildLegalQuestionContract(args.userMessage);
  const direct = args.directAnswer.trim();
  const normalized = direct.toLowerCase();
  const errors: string[] = [];
  if (direct.length < 12) errors.push('direct_answer_too_short');
  if (isGenericCanonicalLegalAnswer(direct)) errors.push('generic_canonical_answer');
  for (const term of contract.requiredAnswerTerms) {
    if (term === "Father's Day possession") {
      if (!/father[â€™']?s day/i.test(direct)) errors.push('missing_question_subject');
    } else if (!normalized.includes(term.toLowerCase())) {
      errors.push(`missing_required_term:${term}`);
    }
  }
  if (contract.requiresPracticalNextStep && !args.nextAction?.trim() && !args.practicalMeaning?.trim()) {
    errors.push('missing_practical_next_step');
  }
  return { passed: errors.length === 0, errors };
}
