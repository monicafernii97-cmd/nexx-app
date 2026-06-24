import { describe, expect, it } from 'vitest';
import {
  canUseDocumentMemoryCandidate,
  resolveDocumentMemorySource,
  type DocumentAccessCandidate,
} from '../documentAccess';

const scope = {
  clerkUserId: 'user_a',
  conversationId: 'conversation_current',
  caseId: 'case_current',
};

function candidate(overrides: Partial<DocumentAccessCandidate>): DocumentAccessCandidate {
  return {
    uploadedFileId: 'file_1',
    clerkUserId: 'user_a',
    status: 'ready',
    chatContextText: 'Readable court order text',
    ...overrides,
  };
}

describe('resolveDocumentMemorySource', () => {
  it('classifies same-conversation documents first', () => {
    const result = resolveDocumentMemorySource(
      candidate({ conversationId: 'conversation_current', caseId: 'case_current' }),
      scope
    );

    expect(result).toBe('conversation_memory');
  });

  it('classifies same-case documents from other conversations', () => {
    const result = resolveDocumentMemorySource(
      candidate({ conversationId: 'conversation_prior', caseId: 'case_current' }),
      scope
    );

    expect(result).toBe('case_memory');
  });

  it('classifies standalone owned documents as user-private memory', () => {
    const result = resolveDocumentMemorySource(candidate({}), scope);

    expect(result).toBe('user_private_memory');
  });

  it('rejects documents owned by a different Clerk user', () => {
    const result = resolveDocumentMemorySource(
      candidate({ clerkUserId: 'user_b', conversationId: 'conversation_current' }),
      scope
    );

    expect(result).toBeNull();
  });
});

describe('canUseDocumentMemoryCandidate', () => {
  it('requires ready or partial extracted context', () => {
    expect(canUseDocumentMemoryCandidate(candidate({ status: 'processing' }), scope)).toBe(false);
    expect(canUseDocumentMemoryCandidate(candidate({ chatContextText: '   ' }), scope)).toBe(false);
    expect(canUseDocumentMemoryCandidate(candidate({ status: 'partial' }), scope)).toBe(true);
  });
});

