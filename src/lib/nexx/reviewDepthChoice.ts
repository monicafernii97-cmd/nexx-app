import type { DocumentAnalysisMode } from '../chat/documentAnalysisMode';

const REVIEW_DEPTH_CHOICE_REQUEST = /\b(?:review\s+depth|review\s+depths|choice|choices|option|options)\b/i;
const DOCUMENT_REVIEW_REQUEST = /\b(?:analy[sz]e|review|summari[sz]e|assess)\b/i;

export function shouldOfferReviewDepthChoices(args: {
  message: string;
  analysisMode?: DocumentAnalysisMode;
  hasAvailableDocument: boolean;
}) {
  return args.hasAvailableDocument &&
    args.analysisMode !== 'full_document_review' &&
    DOCUMENT_REVIEW_REQUEST.test(args.message) &&
    REVIEW_DEPTH_CHOICE_REQUEST.test(args.message);
}

export function reviewDepthChoiceMessage() {
  return [
    'Which review would you like:',
    '',
    '- A focused review of the terms or issue you care about',
    '- A full-document review covering the entire current document',
  ].join('\n');
}
