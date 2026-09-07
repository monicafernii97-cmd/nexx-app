import { describe, expect, it } from 'vitest';
import { buildTurnBudget, canSpendTurnBudget } from '../conversation/budgetPolicy';
import { buildConversationTurnContext } from '../conversation/contextBuilder';
import { resolveModelPolicy, validateEscalation } from '../conversation/modelPolicy';
import { restartCompletedTask, selectExplicitlyResumedTask, transitionTask } from '../conversation/taskLedger';
import type { BackgroundTaskDescriptor, ConversationTurnContext } from '../conversation/contracts';

const rollout: ConversationTurnContext['rollout'] = {
  configVersion: 1,
  kernelMode: 'shadow',
  contextBuilderMode: 'shadow',
  taskLedgerMode: 'shadow',
  toolBrokerMode: 'shadow',
  outcomeVerifierMode: 'shadow',
  modelPolicyMode: 'shadow',
  routeModeAuthority: 'legacy',
};

describe('Phase 2 conversational kernel contracts', () => {
  it('keeps the immediate dialogue while dropping superseded, old, and revoked context', () => {
    const budget = buildTurnBudget({ riskClass: 'ordinary', maxInputTokens: 2_000 });
    const result = buildConversationTurnContext({
      turnId: 'turn-1', conversationId: 'conversation-1', userId: 'user-1', tenantId: 'tenant-1',
      message: 'What does it look like?', budget, rollout, immediateReferents: [], availableTools: [],
      recentMessages: [
        { id: 'old', role: 'user', content: 'x'.repeat(3_000), createdAt: 1 },
        { id: 'superseded', role: 'assistant', content: 'Wrong prior answer', createdAt: 2, superseded: true },
        { id: 'definition', role: 'user', content: 'What is mediation?', createdAt: 3 },
        { id: 'answer', role: 'assistant', content: 'Mediation is a facilitated negotiation.', createdAt: 4 },
      ],
      tasks: [],
      resources: [
        { resourceId: 'available', kind: 'document', label: 'Current order', state: 'available', authorizationScopeHash: 'scope' },
        { resourceId: 'revoked', kind: 'document', label: 'Revoked order', state: 'revoked', authorizationScopeHash: 'scope' },
      ],
    }, { recentMessageTokenBudget: 500 });

    expect(result.receipt.includedMessageIds).toEqual(['definition', 'answer']);
    expect(result.receipt.includedResourceIds).toEqual(['available']);
    expect(result.context.recentMessages.some((message) => message.id === 'superseded')).toBe(false);
  });

  it('does not resume a background task from a weak pronoun alone', () => {
    const task: BackgroundTaskDescriptor = {
      taskId: 'review-1', goal: 'Review the signed order', status: 'suspended',
      resourceIds: ['order-1'], lastTouchedAt: 1,
    };
    expect(selectExplicitlyResumedTask({ message: 'What does it look like?', tasks: [task] })).toBeUndefined();
    expect(selectExplicitlyResumedTask({ message: 'Resume the signed order review', tasks: [task] })?.taskId).toBe('review-1');
    expect(transitionTask(task, 'open', 'user_resumed', 2).task.status).toBe('open');
    expect(() => transitionTask({ ...task, status: 'completed' }, 'open', 'implicit_restart')).toThrow(/not_allowed/);
    expect(restartCompletedTask({ ...task, status: 'completed' }, {
      explicitlyRequested: true, reasonCode: 'user_explicit_restart', now: 3,
    }).receipt).toMatchObject({ from: 'completed', to: 'open' });
  });

  it('keeps low-risk chat on Luna and forces substantive legal work to Terra', () => {
    const conversational = resolveModelPolicy({ tier: 'free', signals: { lowRiskConversation: true } });
    expect(conversational.initialModel).toBe('gpt-5.6-luna');
    expect(conversational.allowedEscalations).toContain('gpt-5.6-terra');

    const legal = resolveModelPolicy({ tier: 'premium', signals: { personalizedLegalInterpretation: true } });
    expect(legal.initialModel).toBe('gpt-5.6-terra');
    expect(legal.minimumModel).toBe('gpt-5.6-terra');
  });

  it('allows Sol only for an eligible reason, tier, and remaining budget', () => {
    const policy = resolveModelPolicy({ tier: 'premium', signals: { conflictingEvidence: true } });
    expect(validateEscalation({
      request: {
        fromModel: 'gpt-5.6-terra', requestedModel: 'gpt-5.6-sol', reasonCode: 'conflicting_evidence',
        evidenceIds: ['evidence-1'], remainingBudgetMicrousd: 50_000,
      },
      policy,
      estimatedCostMicrousd: 25_000,
    }).allowed).toBe(true);
    expect(validateEscalation({
      request: {
        fromModel: 'gpt-5.6-terra', requestedModel: 'gpt-5.6-sol', reasonCode: 'conflicting_evidence',
        evidenceIds: [], remainingBudgetMicrousd: 1,
      },
      policy,
      estimatedCostMicrousd: 25_000,
    }).code).toBe('turn_budget_exhausted');
  });

  it('enforces turn cost ceilings independently of message limits', () => {
    const budget = buildTurnBudget({ riskClass: 'ordinary', remainingDailyBudgetMicrousd: 20_000 });
    expect(budget.maxCostMicrousd).toBe(20_000);
    expect(canSpendTurnBudget(budget, 15_000, 5_000)).toBe(true);
    expect(canSpendTurnBudget(budget, 15_001, 5_000)).toBe(false);
  });
});
