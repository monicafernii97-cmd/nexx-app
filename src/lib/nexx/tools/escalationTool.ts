import type { EscalationRequest } from '../conversation/contracts';
import type { AuthorizedTool, ToolExecutionResult } from './contracts';

export function createEscalationTool(
  requestEscalation: (args: EscalationRequest) => Promise<ToolExecutionResult<{ approved: boolean }>>,
): AuthorizedTool<EscalationRequest, { approved: boolean }> {
  return {
    name: 'request_expert_escalation',
    description: 'Request one stronger model only for an eligible quality or risk reason within the remaining turn budget.',
    sideEffect: 'none',
    requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<EscalationRequest> | null;
      if (!args || typeof args.fromModel !== 'string' || !['gpt-5.6-terra', 'gpt-5.6-sol'].includes(String(args.requestedModel))) {
        throw new Error('invalid_escalation_args');
      }
      if (typeof args.reasonCode !== 'string' || !Array.isArray(args.evidenceIds) || typeof args.remainingBudgetMicrousd !== 'number') {
        throw new Error('invalid_escalation_receipt');
      }
      return args as EscalationRequest;
    },
    resourceIds: () => [],
    execute: (args) => requestEscalation(args),
  };
}
