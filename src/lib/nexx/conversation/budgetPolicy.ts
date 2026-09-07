import type { TurnBudget } from './contracts';

export type TurnRiskClass =
  | 'social'
  | 'ordinary'
  | 'nuanced_legal'
  | 'tool_grounded'
  | 'document_review'
  | 'exceptional_artifact';

const OUTPUT_CEILINGS: Record<TurnRiskClass, number> = {
  social: 800,
  ordinary: 2_000,
  nuanced_legal: 4_000,
  tool_grounded: 6_000,
  document_review: 8_000,
  exceptional_artifact: 12_000,
};

const COST_CEILINGS_MICROUSD: Record<TurnRiskClass, number> = {
  social: 40_000,
  ordinary: 75_000,
  nuanced_legal: 200_000,
  tool_grounded: 350_000,
  document_review: 600_000,
  exceptional_artifact: 1_000_000,
};

export function buildTurnBudget(args: {
  riskClass: TurnRiskClass;
  maxInputTokens?: number;
  remainingDailyBudgetMicrousd?: number;
}): TurnBudget {
  const costCeiling = COST_CEILINGS_MICROUSD[args.riskClass];
  return {
    maxInputTokens: Math.max(2_000, args.maxInputTokens ?? 32_000),
    maxOutputTokens: OUTPUT_CEILINGS[args.riskClass],
    maxToolCalls: args.riskClass === 'document_review' || args.riskClass === 'exceptional_artifact' ? 8 : 4,
    maxModelAttempts: 3,
    maxCostMicrousd: Math.max(
      0,
      Math.min(costCeiling, args.remainingDailyBudgetMicrousd ?? costCeiling),
    ),
  };
}

export function remainingTurnBudgetMicrousd(budget: TurnBudget, spentMicrousd: number) {
  return Math.max(0, budget.maxCostMicrousd - Math.max(0, Math.floor(spentMicrousd)));
}

export function canSpendTurnBudget(budget: TurnBudget, spentMicrousd: number, estimatedNextMicrousd: number) {
  return remainingTurnBudgetMicrousd(budget, spentMicrousd) >= Math.max(0, estimatedNextMicrousd);
}
