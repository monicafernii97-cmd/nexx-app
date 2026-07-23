import { describe, expect, it } from 'vitest';
import { buildChatRegenerationPlan } from '../regeneration';

const messages = [
  { id: 'u1', role: 'user' as const, content: 'First question' },
  { id: 'a1', role: 'assistant' as const, content: 'First answer' },
  { id: 'u2', role: 'user' as const, content: 'Follow-up' },
  { id: 'a2', role: 'assistant' as const, content: 'Follow-up answer' },
];

describe('buildChatRegenerationPlan', () => {
  it('uses the canonical preceding user message and removes the retried branch', () => {
    expect(buildChatRegenerationPlan({
      mode: 'retry',
      message: 'untrusted replacement text',
      messages,
      retryOfAssistantMessageId: 'a1',
    })).toEqual({
      promptMessage: 'First question',
      deleteMessageIds: ['a1', 'u2', 'a2'],
    });
  });

  it('updates the selected user message and removes only later messages', () => {
    expect(buildChatRegenerationPlan({
      mode: 'edit',
      message: 'Edited question',
      messages,
      editOfUserMessageId: 'u1',
    })).toEqual({
      promptMessage: 'Edited question',
      editedUserMessageId: 'u1',
      deleteMessageIds: ['a1', 'u2', 'a2'],
    });
  });

  it('rejects mismatched retry and edit targets', () => {
    expect(() => buildChatRegenerationPlan({
      mode: 'retry',
      message: 'Retry',
      messages,
      retryOfAssistantMessageId: 'u1',
    })).toThrow('no longer available');
  });
});
