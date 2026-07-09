import type { PackedCaseIntake } from './packedCaseIntake';

export function buildJudgeNarrative(intake: PackedCaseIntake) {
  const orderIssue = intake.currentOrderContext.relevantOrderIssues[0] ?? 'the current order';
  const simpleTheory = intake.courtPosture.otherPartyFiledSomething
    ? `The court story should be organized around the current order, what the other party is asking for, what happened in date order, and what proof supports your position.`
    : `The judge-ready version should stay focused on ${orderIssue}, the timeline, and the proof.`;

  return {
    simpleTheory,
    judgeReadyStructure: [
      'Start with the current order or legal duty.',
      'Identify what the other party is asking for or accusing you of.',
      'Give the facts in date order.',
      'Attach or reference the proof for each important fact.',
      'Explain how the issue affects the child, exchange, support, or order compliance.',
      'State exactly what outcome you want the court to order.',
    ],
    sampleOpening: intake.userQuestions.some((q) => q.category === 'judge_explanation') || intake.courtPosture.otherPartyFiledSomething
      ? 'Your Honor, I am asking the Court to focus on the current order, the date-order timeline, and the messages showing what happened. I have tried to follow the order and keep communication focused on the child and compliance.'
      : null,
  };
}
