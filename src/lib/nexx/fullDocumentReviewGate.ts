import type { DocumentAnalysisMode } from '../chat/documentAnalysisMode';

export type DocumentCoverageStatus = 'complete' | 'partial' | 'unverified';

export type FullDocumentReviewAttachmentReceipt = {
  filename: string;
  status: string;
  coverageStatus?: DocumentCoverageStatus;
  pagesProcessed?: number;
  pagesTotal?: number;
  contextTruncated?: boolean;
  extractionWarnings?: string[];
  fullDocumentReviewStatus?: 'not_started' | 'building' | 'ready' | 'partial' | 'failed';
};

export function requiresVerifiedCoverage(
  analysisMode: DocumentAnalysisMode | undefined,
  attachments: FullDocumentReviewAttachmentReceipt[],
) {
  return analysisMode === 'full_document_review' && (
    attachments.length === 0 || attachments.some((attachment) =>
      attachment.coverageStatus !== 'complete' || attachment.fullDocumentReviewStatus !== 'ready')
  );
}

export function buildCoverageGateMessage(attachments: FullDocumentReviewAttachmentReceipt[]) {
  if (attachments.length === 0) {
    return 'I could not identify the court-order attachment for this full review. Please attach the order again.';
  }

  const attachmentLines = attachments.map((attachment) => {
    const pageAccounting = attachment.pagesTotal !== undefined
      ? `${attachment.pagesProcessed ?? 0} of ${attachment.pagesTotal} pages explicitly accounted for`
      : 'page-by-page coverage has not been verified';
    const reviewState = attachment.coverageStatus === 'complete'
      ? attachment.fullDocumentReviewStatus === 'ready'
        ? 'full-document synthesis ready'
        : 'page coverage verified; exhaustive synthesis is still pending'
      : 'source coverage is not complete';
    return `- ${attachment.filename}: ${pageAccounting}; ${reviewState}`;
  });

  const coverageComplete = attachments.every((attachment) => attachment.coverageStatus === 'complete');

  return [
    `I received and stored ${attachments.length === 1 ? attachments[0].filename : `${attachments.length} documents`}.`,
    coverageComplete
      ? 'I am not presenting a full court-order analysis yet because page coverage is verified, but the exhaustive document-understanding record is not ready.'
      : 'I am not presenting a full court-order analysis yet because the current processing record does not prove that every source page was read.',
    ...attachmentLines,
    'NEXX will only describe this as a complete review after verified page-by-page coverage and real-page citations are available.',
    coverageComplete
      ? 'The extracted order text remains available for focused work while the exhaustive synthesis is pending.'
      : 'Any extracted and page-anchored text remains available for focused work within its verified scope.',
    'Which should I do now: answer a focused question, review a specific page or section, or retry the exhaustive review later?',
  ].join('\n\n');
}

/**
 * Report truthful progress after the user has already accepted the full-review
 * recommendation. This deliberately does not offer the review-depth choices
 * again: the accepted operation remains active while its durable prerequisite
 * finishes.
 */
export function acceptedReviewProgressMessage(attachments: FullDocumentReviewAttachmentReceipt[]) {
  if (attachments.length === 0) {
    return 'I accepted the full-document review, but restoring its saved document evidence was interrupted. The selected review remains active while I retry from the saved selection; no new file is needed.';
  }

  const filenames = attachments.map((attachment) => attachment.filename).join(', ');
  const coverageComplete = attachments.every((attachment) => attachment.coverageStatus === 'complete');
  const reviewFailed = attachments.some((attachment) =>
    attachment.fullDocumentReviewStatus === 'failed' || attachment.fullDocumentReviewStatus === 'partial');

  if (reviewFailed) {
    return `I accepted the full-document review and retained the saved evidence for ${filenames}, but the verified synthesis was interrupted. The selected review remains active for a durable retry; no new file is needed.`;
  }
  if (coverageComplete) {
    return `I accepted the full-document review and verified the source coverage for ${filenames}. The exhaustive synthesis is still finishing from the saved evidence, and the selected review remains active; no new file is needed.`;
  }
  return `I accepted the full-document review and retained ${filenames}. Source verification is still in progress from the saved evidence, and the selected review remains active; no new file is needed.`;
}
