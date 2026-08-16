export const DOCUMENT_ANALYSIS_MODES = [
  'full_document_review',
  'obligations_and_deadlines',
  'custody_and_possession',
  'compare_with_conversation',
  'focused_question',
] as const;

export type DocumentAnalysisMode = (typeof DOCUMENT_ANALYSIS_MODES)[number];

export function isDocumentAnalysisMode(value: unknown): value is DocumentAnalysisMode {
  return typeof value === 'string' && DOCUMENT_ANALYSIS_MODES.includes(value as DocumentAnalysisMode);
}

export function analysisModeForUploadIntent(intent: 'attachment' | 'court_order'): DocumentAnalysisMode | undefined {
  return intent === 'court_order' ? 'full_document_review' : undefined;
}
