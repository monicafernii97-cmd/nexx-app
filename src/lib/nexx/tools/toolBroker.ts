import type { ProposedToolCall } from '../conversation/contracts';
import type { AuthorizedTool, BrokeredToolResult, ToolExecutionContext } from './contracts';

export type ToolBrokerPolicy = {
  maxToolCalls: number;
  allowedToolNames: ReadonlySet<string>;
};

export class ToolBroker {
  private readonly tools = new Map<string, AuthorizedTool>();

  constructor(tools: AuthorizedTool[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) throw new Error(`duplicate_tool:${tool.name}`);
      this.tools.set(tool.name, tool);
    }
  }

  async execute(args: {
    call: ProposedToolCall;
    context: ToolExecutionContext;
    policy: ToolBrokerPolicy;
    completedCallCount: number;
    confirmationId?: string;
  }): Promise<BrokeredToolResult> {
    const startedAt = args.context.now ?? Date.now();
    const baseReceipt = {
      toolCallId: args.call.callId,
      toolName: args.call.name,
      authorizationScopeHash: args.context.authorizationScopeHash,
      resourceIds: [] as string[],
      evidenceIds: [] as string[],
      sideEffect: 'none' as const,
      startedAt,
    };
    if (args.completedCallCount >= args.policy.maxToolCalls) {
      return { receipt: { ...baseReceipt, status: 'rejected', failureCode: 'tool_call_budget_exhausted', completedAt: Date.now() } };
    }
    if (!args.policy.allowedToolNames.has(args.call.name)) {
      return { receipt: { ...baseReceipt, status: 'rejected', failureCode: 'tool_not_authorized', completedAt: Date.now() } };
    }
    const tool = this.tools.get(args.call.name);
    if (!tool) {
      return { receipt: { ...baseReceipt, status: 'rejected', failureCode: 'tool_not_registered', completedAt: Date.now() } };
    }

    let validatedArgs: Record<string, unknown>;
    try {
      validatedArgs = tool.validateArgs(args.call.args);
    } catch {
      return { receipt: { ...baseReceipt, sideEffect: tool.sideEffect, status: 'rejected', failureCode: 'tool_arguments_invalid', completedAt: Date.now() } };
    }
    const resourceIds = tool.resourceIds(validatedArgs);
    if (resourceIds.some((id) => !args.context.authorizedResourceIds.has(id))) {
      return { receipt: { ...baseReceipt, sideEffect: tool.sideEffect, resourceIds, status: 'rejected', failureCode: 'tool_resource_not_authorized', completedAt: Date.now() } };
    }
    if (tool.requiresConfirmation && (!args.confirmationId || !args.context.confirmedActionIds.has(args.confirmationId))) {
      return { receipt: { ...baseReceipt, sideEffect: tool.sideEffect, resourceIds, status: 'rejected', failureCode: 'tool_confirmation_required', completedAt: Date.now() } };
    }

    try {
      const executed = await tool.execute(validatedArgs, args.context);
      const completedAt = Date.now();
      if (executed.failureCode) {
        return {
          receipt: {
            ...baseReceipt,
            sideEffect: tool.sideEffect,
            resourceIds,
            evidenceIds: executed.evidenceIds ?? [],
            status: 'failed',
            failureCode: executed.failureCode,
            confirmationId: args.confirmationId,
            completedAt,
          },
        };
      }
      return {
        result: executed.result,
        receipt: {
          ...baseReceipt,
          sideEffect: tool.sideEffect,
          resourceIds: executed.resourceIds ?? resourceIds,
          evidenceIds: executed.evidenceIds ?? [],
          status: 'completed',
          confirmationId: args.confirmationId,
          completedAt,
        },
      };
    } catch {
      return {
        receipt: {
          ...baseReceipt,
          sideEffect: tool.sideEffect,
          resourceIds,
          status: 'failed',
          failureCode: 'tool_execution_failed',
          confirmationId: args.confirmationId,
          completedAt: Date.now(),
        },
      };
    }
  }
}
