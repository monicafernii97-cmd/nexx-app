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
};

export function requiresVerifiedCoverage(
  analysisMode: DocumentAnalysisMode | undefined,
  attachments: FullDocumentReviewAttachmentReceipt[],
) {
  return analysisMode === 'full_document_review' && (
    attachments.length === 0 || attachments.some((attachment) => attachment.coverageStatus !== 'complete')
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
    return `- ${attachment.filename}: ${pageAccounting}`;
  });

  return [
    `I received and stored ${attachments.length === 1 ? attachments[0].filename : `${attachments.length} documents`}.`,
    'I am not presenting a full court-order analysis yet because the current processing record does not prove that every source page was read.',
    ...attachmentLines,
    'NEXX will only describe this as a complete review after verified page-by-page coverage and real-page citations are available.',
  ].join('\n\n');
}
