import type { ConversationEvalCase } from './cases';
import { runConversationEvalCorpus } from './runner';

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 100 : (numerator / denominator) * 100;
}

export function adjudicateConversationCorpus(cases: ConversationEvalCase[]) {
  const results = runConversationEvalCorpus(cases);
  const selected = (category: ConversationEvalCase['category']) => results.filter((result) => result.category === category);
  const passRate = (category: ConversationEvalCase['category']) => {
    const slice = selected(category);
    return percentage(slice.filter((result) => result.passed).length, slice.length);
  };
  const frozenPassRate = passRate('frozen_incident');
  const followUpPassRate = passRate('follow_up');
  const resumePassRate = passRate('task_resume');
  const latestGoalRate = percentage(
    results.filter((result) => !result.failures.includes('foreground_goal_mismatch')).length,
    results.length,
  );
  const unwantedDocumentActivationRate = percentage(
    results.filter((result) => (result.category === 'follow_up' || result.category === 'topic_switch') && result.plan.requiredEvidence).length,
    results.filter((result) => result.category === 'follow_up' || result.category === 'topic_switch').length,
  );
  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    frozenPassRate,
    followUpPassRate,
    resumePassRate,
    latestGoalRate,
    unwantedDocumentActivationRate,
    thresholdPassed: frozenPassRate === 100 && followUpPassRate >= 98 && resumePassRate >= 98 && latestGoalRate >= 99 && unwantedDocumentActivationRate < 0.5,
    failures: results.filter((result) => !result.passed),
  };
}

