export type ChatRegenerationMode = 'send' | 'retry' | 'edit';

export type RegenerationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type ChatRegenerationPlan = {
  promptMessage: string;
  deleteMessageIds: string[];
  editedUserMessageId?: string;
};

type BuildRegenerationPlanArgs = {
  mode: ChatRegenerationMode;
  message: string;
  messages: RegenerationMessage[];
  retryOfAssistantMessageId?: string;
  editOfUserMessageId?: string;
};

/**
 * Validate a retry/edit request and describe the transcript rewrite that must
 * be committed in the same transaction as the replacement generation job.
 */
export function buildChatRegenerationPlan({
  mode,
  message,
  messages,
  retryOfAssistantMessageId,
  editOfUserMessageId,
}: BuildRegenerationPlanArgs): ChatRegenerationPlan {
  if (mode === 'send') {
    if (retryOfAssistantMessageId || editOfUserMessageId) {
      throw new Error('A new message cannot target an existing response.');
    }
    return { promptMessage: message, deleteMessageIds: [] };
  }

  if (mode === 'retry') {
    if (!retryOfAssistantMessageId || editOfUserMessageId) {
      throw new Error('Retry requires exactly one assistant response target.');
    }
    const targetIndex = messages.findIndex((candidate) => candidate.id === retryOfAssistantMessageId);
    if (targetIndex < 0 || messages[targetIndex]?.role !== 'assistant') {
      throw new Error('The response selected for retry is no longer available.');
    }
    const precedingUserMessage = messages
      .slice(0, targetIndex)
      .reverse()
      .find((candidate) => candidate.role === 'user');
    if (!precedingUserMessage) {
      throw new Error('The original user message for this response is missing.');
    }
    return {
      promptMessage: precedingUserMessage.content,
      deleteMessageIds: messages.slice(targetIndex).map((candidate) => candidate.id),
    };
  }

  if (!editOfUserMessageId || retryOfAssistantMessageId) {
    throw new Error('Edit requires exactly one user message target.');
  }
  const targetIndex = messages.findIndex((candidate) => candidate.id === editOfUserMessageId);
  if (targetIndex < 0 || messages[targetIndex]?.role !== 'user') {
    throw new Error('The message selected for editing is no longer available.');
  }
  return {
    promptMessage: message,
    editedUserMessageId: editOfUserMessageId,
    deleteMessageIds: messages.slice(targetIndex + 1).map((candidate) => candidate.id),
  };
}
