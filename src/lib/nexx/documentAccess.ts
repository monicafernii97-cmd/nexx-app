export type DocumentMemorySource =
  | 'conversation_memory'
  | 'case_memory'
  | 'user_private_memory';

export type DocumentAccessCandidate = {
  uploadedFileId: string;
  clerkUserId: string;
  conversationId?: string;
  caseId?: string;
  status?: string;
  chatContextText?: string;
};

export type DocumentAccessScope = {
  clerkUserId: string;
  conversationId: string;
  caseId?: string;
};

/** Return true only when a stored document has readable context that can be injected safely. */
export function hasUsableDocumentContext(candidate: DocumentAccessCandidate) {
  return (
    (candidate.status === 'ready' || candidate.status === 'partial') &&
    Boolean(candidate.chatContextText?.trim())
  );
}

/** Classify how an accessible stored document relates to the current chat turn. */
export function resolveDocumentMemorySource(
  candidate: DocumentAccessCandidate,
  scope: DocumentAccessScope
): DocumentMemorySource | null {
  if (candidate.clerkUserId !== scope.clerkUserId) return null;

  if (candidate.conversationId === scope.conversationId) {
    return 'conversation_memory';
  }

  if (scope.caseId && candidate.caseId === scope.caseId) {
    return 'case_memory';
  }

  if (!candidate.conversationId && !candidate.caseId) {
    return 'user_private_memory';
  }

  return null;
}

/** Enforce ownership, scope, and readable-context requirements before a document can be recalled. */
export function canUseDocumentMemoryCandidate(
  candidate: DocumentAccessCandidate,
  scope: DocumentAccessScope
) {
  return hasUsableDocumentContext(candidate) && resolveDocumentMemorySource(candidate, scope) !== null;
}

