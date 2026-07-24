import { describe, expect, it } from 'vitest';
import {
  canonicalConversationMemoryPage,
  compactConversationMemoryContent,
  shouldInvalidateConversationSummary,
} from '../conversationMemoryPolicy';

describe('conversation memory edit and retry policy', () => {
  const messages = [
    { id: 'user-4', turnNumber: 4 },
    { id: 'assistant-4', turnNumber: 4 },
    { id: 'user-8', turnNumber: 8 },
  ];

  it('invalidates a summary when an edit changes a summarized user turn', () => {
    expect(shouldInvalidateConversationSummary({
      summaryTurnCount: 6,
      editedMessageId: 'user-4',
      deletedMessageIds: new Set(),
      messages,
    })).toBe(true);
  });

  it('invalidates a summary when retry removes a summarized assistant turn', () => {
    expect(shouldInvalidateConversationSummary({
      summaryTurnCount: 6,
      deletedMessageIds: new Set(['assistant-4']),
      messages,
    })).toBe(true);
  });

  it('does not invalidate older durable memory for an unsummarized turn', () => {
    expect(shouldInvalidateConversationSummary({
      summaryTurnCount: 6,
      editedMessageId: 'user-8',
      deletedMessageIds: new Set(),
      messages,
    })).toBe(false);
  });

  it('selects only surviving canonical messages in turn and role order', () => {
    const selected = canonicalConversationMemoryPage({
      fromTurnExclusive: 2,
      throughTurnInclusive: 4,
      messages: [
        { role: 'assistant', content: 'new answer', status: 'committed', turnNumber: 4, roleOrder: 1 },
        { role: 'assistant', content: 'rejected answer', status: 'deleted', turnNumber: 3, roleOrder: 1 },
        { role: 'assistant', content: 'streaming draft', status: 'draft', turnNumber: 3, roleOrder: 1 },
        { role: 'assistant', content: 'failed answer', status: 'failed', turnNumber: 3, roleOrder: 1 },
        { role: 'user', content: 'edited request', status: 'committed', turnNumber: 4, roleOrder: 0 },
        { role: 'user', content: 'too old', status: 'committed', turnNumber: 2, roleOrder: 0 },
        { role: 'assistant', content: 'too new', status: 'committed', turnNumber: 5, roleOrder: 1 },
      ],
    });

    expect(selected).toEqual([
      { role: 'user', content: 'edited request' },
      { role: 'assistant', content: 'new answer' },
    ]);
  });

  it('preserves both the beginning and final refinement of a long pasted turn', () => {
    const beginning = 'Please review this full conversation carefully.';
    const ending = 'Final instruction: do not invite future updates or reopen contact.';
    const content = `${beginning}\n${'quoted AppClose content '.repeat(900)}\n${ending}`;

    const compacted = compactConversationMemoryContent(content);

    expect(compacted.length).toBeLessThanOrEqual(12_000);
    expect(compacted).toContain(beginning);
    expect(compacted).toContain(ending);
    expect(compacted).toContain('omitted during memory compaction');
  });
});
