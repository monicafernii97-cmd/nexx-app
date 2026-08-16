export type ReusableDocumentCandidate = {
  status: string;
  fullDocumentReviewStatus?: string;
  coverageStatus?: string;
  fullTextStorageId?: string;
  activeMemoryGenerationId?: string;
};

/** Only reuse extracted text after coverage and understanding are complete. */
export function isReusableDocumentCandidate(candidate: ReusableDocumentCandidate) {
  return candidate.status !== 'deleted' &&
    candidate.status !== 'quarantined' &&
    candidate.fullDocumentReviewStatus === 'ready' &&
    candidate.coverageStatus === 'complete' &&
    Boolean(candidate.fullTextStorageId && candidate.activeMemoryGenerationId);
}
