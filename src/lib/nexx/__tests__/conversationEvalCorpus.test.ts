import { describe, expect, it } from 'vitest';
import { CONVERSATION_EVAL_CASES, FROZEN_INCIDENT_CASES } from '../eval/cases';
import { adjudicateConversationCorpus } from '../eval/adjudication';

describe('conversation-first adjudicated corpus', () => {
  it('contains at least 200 multi-turn and state-transition cases', () => {
    expect(CONVERSATION_EVAL_CASES.length).toBeGreaterThanOrEqual(200);
    expect(FROZEN_INCIDENT_CASES.length).toBeGreaterThanOrEqual(10);
  });

  it('meets the Phase 2 deterministic handling thresholds', () => {
    const report = adjudicateConversationCorpus(CONVERSATION_EVAL_CASES);
    expect(report.failures).toEqual([]);
    expect(report.frozenPassRate).toBe(100);
    expect(report.followUpPassRate).toBeGreaterThanOrEqual(98);
    expect(report.resumePassRate).toBeGreaterThanOrEqual(98);
    expect(report.latestGoalRate).toBeGreaterThanOrEqual(99);
    expect(report.unwantedDocumentActivationRate).toBeLessThan(0.5);
    expect(report.thresholdPassed).toBe(true);
  });
});
