import {
  CONTEXT_BUILDER_VERSION,
  type AuthorizedResourceDescriptor,
  type BackgroundTaskDescriptor,
  type ConversationMessage,
  type ConversationTurnContext,
} from './contracts';

export type ContextBuilderInput = Omit<ConversationTurnContext, 'recentMessages' | 'tasks' | 'resources'> & {
  recentMessages: ConversationMessage[];
  tasks: BackgroundTaskDescriptor[];
  resources: AuthorizedResourceDescriptor[];
};

export type ContextBuildResult = {
  context: ConversationTurnContext;
  receipt: {
    version: typeof CONTEXT_BUILDER_VERSION;
    includedMessageIds: string[];
    omittedMessageIds: string[];
    includedTaskIds: string[];
    includedResourceIds: string[];
    estimatedTokens: number;
  };
};

export function estimateConversationTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function eligibleResource(resource: AuthorizedResourceDescriptor) {
  return resource.state === 'available' || resource.state === 'processing';
}

function eligibleTask(task: BackgroundTaskDescriptor, now: number) {
  return task.status !== 'cancelled' && task.status !== 'completed' &&
    (task.expiresAt === undefined || task.expiresAt > now);
}

export function buildConversationTurnContext(
  input: ContextBuilderInput,
  options: { now?: number; maxRecentMessages?: number; recentMessageTokenBudget?: number } = {},
): ContextBuildResult {
  const now = options.now ?? Date.now();
  const maxRecentMessages = Math.max(2, Math.min(20, options.maxRecentMessages ?? 12));
  const tokenBudget = Math.max(500, options.recentMessageTokenBudget ?? Math.floor(input.budget.maxInputTokens * 0.4));
  const candidates = input.recentMessages
    .filter((message) => !message.superseded && message.content.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-maxRecentMessages);

  const selected: ConversationMessage[] = [];
  let estimatedTokens = estimateConversationTokens(input.message);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const candidateTokens = estimateConversationTokens(candidate.content);
    const isImmediatePair = index >= candidates.length - 2;
    if (!isImmediatePair && estimatedTokens + candidateTokens > tokenBudget) continue;
    selected.unshift(candidate);
    estimatedTokens += candidateTokens;
  }

  const selectedIds = new Set(selected.map((message) => message.id));
  const tasks = input.tasks
    .filter((task) => eligibleTask(task, now))
    .sort((a, b) => b.lastTouchedAt - a.lastTouchedAt)
    .slice(0, 12);
  const resources = input.resources.filter(eligibleResource);

  return {
    context: {
      ...input,
      recentMessages: selected,
      tasks,
      resources,
    },
    receipt: {
      version: CONTEXT_BUILDER_VERSION,
      includedMessageIds: selected.map((message) => message.id),
      omittedMessageIds: candidates.filter((message) => !selectedIds.has(message.id)).map((message) => message.id),
      includedTaskIds: tasks.map((task) => task.taskId),
      includedResourceIds: resources.map((resource) => resource.resourceId),
      estimatedTokens,
    },
  };
}
