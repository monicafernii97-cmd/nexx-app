import { describe, expect, it } from 'vitest';
import { validateDurableReviewRestartApproval } from '../durableReviewRuntime';

describe('durable review restart approval', () => {
  it('requires a distinct proposer/operator and approver', () => {
    expect(() => validateDurableReviewRestartApproval({
      operatorId: 'codex-production-rollout',
      approverId: 'codex-production-rollout',
      approvalId: 'EXEC-CHAT-ROLLOUT-2026-09-04',
      approvalReason: 'Restart the failed verified order review.',
    })).toThrow('durable_review_separation_of_duties_required');
  });

  it('accepts an independently approved, ticketed operation', () => {
    expect(() => validateDurableReviewRestartApproval({
      operatorId: 'codex-production-rollout',
      approverId: 'monicafernii97@gmail.com',
      approvalId: 'EXEC-CHAT-ROLLOUT-2026-09-04',
      approvalReason: 'Restart the failed verified order review.',
    })).not.toThrow();
  });
});
