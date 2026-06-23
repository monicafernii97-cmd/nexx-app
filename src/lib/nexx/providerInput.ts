export type InternalRecentMessage = {
  turnId?: unknown;
  role: 'user' | 'assistant';
  content: string;
  status?: 'draft' | 'committed' | 'degraded' | 'failed' | 'deleted';
};

export type ProviderInputMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/** Strip internal metadata before sending messages to the model provider. */
export function toProviderInputMessages(messages: InternalRecentMessage[]): ProviderInputMessage[] {
  return messages.map(({ role, content }) => ({ role, content }));
}
