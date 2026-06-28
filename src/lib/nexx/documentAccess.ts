export type DocumentMemorySource =
  | 'conversation_memory'
  | 'case_memory'
  | 'user_private_memory'
  | 'shared_memory';

export type DocumentAccessCandidate = {
  uploadedFileId: string;
  clerkUserId: string;
  conversationId?: string;
  caseId?: string;
  status?: string;
  chatContextText?: string;
  activeMemoryGenerationId?: string;
  chunkCount?: number;
};

export type DocumentAccessScope = {
  clerkUserId: string;
  conversationId: string;
  caseId?: string;
  grantedUploadedFileIds?: string[];
};

/** Return true only when a stored document has readable context that can be injected safely. */
export function hasUsableDocumentContext(candidate: DocumentAccessCandidate) {
  const hasReadableContext = Boolean(candidate.chatContextText?.trim());
  const hasGenerationChunks = Boolean(candidate.activeMemoryGenerationId) && (candidate.chunkCount ?? 0) > 0;

  return (
    (candidate.status === 'ready' || candidate.status === 'partial') &&
    (hasReadableContext || hasGenerationChunks)
  );
}

/** Classify how an accessible stored document relates to the current chat turn. */
export function resolveDocumentMemorySource(
  candidate: DocumentAccessCandidate,
  scope: DocumentAccessScope
): DocumentMemorySource | null {
  const isOwner = candidate.clerkUserId === scope.clerkUserId;
  const isGranted = scope.grantedUploadedFileIds?.includes(candidate.uploadedFileId) ?? false;
  if (!isOwner && !isGranted) return null;

  if (candidate.conversationId === scope.conversationId) {
    return 'conversation_memory';
  }

  if (scope.caseId && candidate.caseId === scope.caseId) {
    return 'case_memory';
  }

  if (!candidate.conversationId && !candidate.caseId) {
    return isOwner ? 'user_private_memory' : 'shared_memory';
  }

  return isGranted ? 'shared_memory' : null;
}

/** Enforce ownership, scope, and readable-context requirements before a document can be recalled. */
export function canUseDocumentMemoryCandidate(
  candidate: DocumentAccessCandidate,
  scope: DocumentAccessScope
) {
  return hasUsableDocumentContext(candidate) && resolveDocumentMemorySource(candidate, scope) !== null;
}

