import type { ToolCallReceipt } from '../conversation/contracts';

export type ToolSideEffect = 'none' | 'reversible' | 'material';

export type ToolExecutionContext = {
  turnId: string;
  userId: string;
  tenantId: string;
  authorizationScopeHash: string;
  authorizedResourceIds: ReadonlySet<string>;
  confirmedActionIds: ReadonlySet<string>;
  now?: number;
};

export type ToolExecutionResult<TResult = unknown> = {
  result?: TResult;
  evidenceIds?: string[];
  resourceIds?: string[];
  failureCode?: string;
};

export type AuthorizedTool<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> = {
  name: string;
  description: string;
  sideEffect: ToolSideEffect;
  requiresConfirmation: boolean;
  validateArgs(args: unknown): TArgs;
  resourceIds(args: TArgs): string[];
  execute(args: TArgs, context: ToolExecutionContext): Promise<ToolExecutionResult<TResult>>;
};

export type BrokeredToolResult<TResult = unknown> = {
  result?: TResult;
  receipt: ToolCallReceipt;
};
