import type { BackgroundTaskDescriptor, BackgroundTaskStatus, TaskTransitionReceipt } from './contracts';

const ALLOWED_TRANSITIONS: Record<BackgroundTaskStatus, ReadonlySet<BackgroundTaskStatus>> = {
  open: new Set(['waiting_user', 'waiting_tool', 'suspended', 'completed', 'cancelled']),
  waiting_user: new Set(['open', 'suspended', 'cancelled']),
  waiting_tool: new Set(['open', 'suspended', 'completed', 'cancelled']),
  suspended: new Set(['open', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

export function canTransitionTask(from: BackgroundTaskStatus, to: BackgroundTaskStatus) {
  return from === to || ALLOWED_TRANSITIONS[from].has(to);
}

export function transitionTask(
  task: BackgroundTaskDescriptor,
  to: BackgroundTaskStatus,
  reasonCode: string,
  now = Date.now(),
): { task: BackgroundTaskDescriptor; receipt: TaskTransitionReceipt } {
  if (!canTransitionTask(task.status, to)) {
    throw new Error(`task_transition_not_allowed:${task.status}:${to}`);
  }
  return {
    task: { ...task, status: to, lastTouchedAt: now },
    receipt: { taskId: task.taskId, from: task.status, to, reasonCode },
  };
}

export function restartCompletedTask(
  task: BackgroundTaskDescriptor,
  args: { explicitlyRequested: boolean; reasonCode: string; now?: number },
) {
  if (task.status !== 'completed' || !args.explicitlyRequested) {
    throw new Error('task_restart_requires_explicit_completed_task');
  }
  const now = args.now ?? Date.now();
  return {
    task: { ...task, status: 'open' as const, lastTouchedAt: now },
    receipt: { taskId: task.taskId, from: 'completed' as const, to: 'open' as const, reasonCode: args.reasonCode },
  };
}

export function selectExplicitlyResumedTask(args: {
  message: string;
  tasks: BackgroundTaskDescriptor[];
  referencedTaskId?: string;
  referencedResourceIds?: string[];
}) {
  const eligible = args.tasks.filter((task) =>
    task.status === 'open' || task.status === 'waiting_user' || task.status === 'waiting_tool' || task.status === 'suspended');
  if (args.referencedTaskId) {
    return eligible.find((task) => task.taskId === args.referencedTaskId);
  }
  const normalized = args.message.toLowerCase();
  const explicitlyRequestsResume = /\b(?:resume|return to|continue|go back to|pick up)\b/.test(normalized);
  if (!explicitlyRequestsResume) return undefined;
  const referencedResources = new Set(args.referencedResourceIds ?? []);
  if (referencedResources.size > 0) {
    const matches = eligible.filter((task) => task.resourceIds.some((id) => referencedResources.has(id)));
    return matches.length === 1 ? matches[0] : undefined;
  }
  const namedMatches = eligible.filter((task) => {
    const keywords = task.goal.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
    return keywords.some((word) => normalized.includes(word));
  });
  return namedMatches.length === 1 ? namedMatches[0] : undefined;
}
