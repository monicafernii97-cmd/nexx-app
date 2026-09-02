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
