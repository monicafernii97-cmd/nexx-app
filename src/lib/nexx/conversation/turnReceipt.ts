import {
  CONVERSATION_KERNEL_VERSION,
  type ModelAttemptReceipt,
  type OutcomeValidationReceipt,
  type ReferentBinding,
  type TaskTransitionReceipt,
  type ToolCallReceipt,
  type TurnReceipt,
} from './contracts';

export function buildTurnReceipt(args: {
  turnId: string;
  outcome: TurnReceipt['outcome'];
  foregroundGoal: string;
  resolvedReferents?: ReferentBinding[];
  modelAttempts?: ModelAttemptReceipt[];
  toolCalls?: ToolCallReceipt[];
  evidenceIds?: string[];
  taskTransitions?: TaskTransitionReceipt[];
  validation: OutcomeValidationReceipt;
  publicationId?: string;
  rolloutConfigVersion?: number;
  createdAt?: number;
}): TurnReceipt & { kernelVersion: typeof CONVERSATION_KERNEL_VERSION } {
  return {
    turnId: args.turnId,
    outcome: args.outcome,
    foregroundGoal: args.foregroundGoal.trim().slice(0, 2_000),
    resolvedReferents: args.resolvedReferents ?? [],
    modelAttempts: args.modelAttempts ?? [],
    toolCalls: args.toolCalls ?? [],
    evidenceIds: Array.from(new Set(args.evidenceIds ?? [])),
    taskTransitions: args.taskTransitions ?? [],
    validation: args.validation,
    publicationId: args.publicationId,
    rolloutConfigVersion: args.rolloutConfigVersion ?? 0,
    createdAt: args.createdAt ?? Date.now(),
    kernelVersion: CONVERSATION_KERNEL_VERSION,
  };
}
