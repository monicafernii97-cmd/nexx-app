import type { BackgroundTaskStatus } from '../conversation/contracts';
import type { AuthorizedTool, ToolExecutionResult } from './contracts';

export type TaskCheckpointArgs = {
  taskId: string;
  expectedRevision: number;
  nextStatus: BackgroundTaskStatus;
  checkpoint: string;
};

export function createTaskCheckpointTool(
  save: (args: TaskCheckpointArgs) => Promise<ToolExecutionResult<{ revision: number }>>,
): AuthorizedTool<TaskCheckpointArgs, { revision: number }> {
  return {
    name: 'save_task_checkpoint',
    description: 'Save progress for an explicitly active durable task without changing the foreground topic.',
    sideEffect: 'reversible',
    requiresConfirmation: false,
    validateArgs(value) {
      const args = value as Partial<TaskCheckpointArgs> | null;
      if (!args || typeof args.taskId !== 'string' || !Number.isInteger(args.expectedRevision) || typeof args.checkpoint !== 'string') {
        throw new Error('invalid_task_checkpoint_args');
      }
      const expectedRevision = args.expectedRevision;
      if (typeof expectedRevision !== 'number') throw new Error('invalid_task_revision');
      if (!['open', 'waiting_user', 'waiting_tool', 'suspended', 'completed', 'cancelled'].includes(String(args.nextStatus))) {
        throw new Error('invalid_task_status');
      }
      return {
        taskId: args.taskId,
        expectedRevision,
        nextStatus: args.nextStatus as BackgroundTaskStatus,
        checkpoint: args.checkpoint.slice(0, 8_000),
      };
    },
    resourceIds: () => [],
    execute: (args) => save(args),
  };
}

export function createPriorTurnReceiptTool(
  inspect: (args: { turnId: string }) => Promise<ToolExecutionResult<Record<string, unknown>>>,
): AuthorizedTool<{ turnId: string }, Record<string, unknown>> {
  return {
    name: 'inspect_prior_turn_receipt', description: 'Inspect the scoped execution receipt for a challenged prior answer.', sideEffect: 'none', requiresConfirmation: false,
    validateArgs(value) {
      const turnId = (value as { turnId?: unknown } | null)?.turnId;
      if (typeof turnId !== 'string' || !turnId) throw new Error('invalid_prior_turn_receipt_args');
      return { turnId };
    },
    resourceIds: () => [], execute: (args) => inspect(args),
  };
}

export function createResumeBackgroundTaskTool(
  resume: (args: { taskId: string; expectedRevision: number }) => Promise<ToolExecutionResult<{ revision: number }>>,
): AuthorizedTool<{ taskId: string; expectedRevision: number }, { revision: number }> {
  return {
    name: 'resume_background_task', description: 'Resume one explicitly referenced background task at its current revision.', sideEffect: 'reversible', requiresConfirmation: false,
    validateArgs(value) {
      const args = value as { taskId?: unknown; expectedRevision?: unknown } | null;
      if (!args || typeof args.taskId !== 'string' || !Number.isInteger(args.expectedRevision)) throw new Error('invalid_resume_task_args');
      return { taskId: args.taskId, expectedRevision: args.expectedRevision as number };
    },
    resourceIds: () => [], execute: (args) => resume(args),
  };
}

export function createDraftArtifactTool(
  create: (args: { actionId: string; instructions: string }) => Promise<ToolExecutionResult<{ artifactId: string }>>,
): AuthorizedTool<{ actionId: string; instructions: string }, { artifactId: string }> {
  return {
    name: 'create_draft_artifact', description: 'Create a requested draft artifact after confirmation when material.', sideEffect: 'material', requiresConfirmation: true,
    validateArgs(value) {
      const args = value as { actionId?: unknown; instructions?: unknown } | null;
      if (!args || typeof args.actionId !== 'string' || typeof args.instructions !== 'string') throw new Error('invalid_draft_artifact_args');
      return { actionId: args.actionId, instructions: args.instructions.slice(0, 8_000) };
    },
    resourceIds: () => [], execute: (args) => create(args),
  };
}
