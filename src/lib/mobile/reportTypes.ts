export type ReportOutputType = 'summary_pdf' | 'court_document' | 'both';

export type ReportTone = 'neutral' | 'detailed' | 'attorney_ready';

export type PatternHandling = 'include_supported_only' | 'exclude_patterns';

export type BuildReportPayload = {
  caseId: string;
  outputType: ReportOutputType;
  tone: ReportTone;
  patternHandling: PatternHandling;
  source: 'workspace_mobile';
  clientBuildId?: string;
};

export type BuildReportResponse = {
  reportDraftId: string;
  caseId: string;
  status: 'ready' | 'processing' | 'failed';
  createdAt: string;
};

export type DocumentSectionStatus = 'ready' | 'needs_review' | 'empty';

export type DocumentSection = {
  id: string;
  title: string;
  body: string;
  preview: string;
  status: DocumentSectionStatus;
  sourceCount?: number;
};

export type DocumentDraft = {
  id: string;
  caseId: string;
  documentType: ReportOutputType;
  status: 'draft' | 'processing' | 'ready' | 'failed' | 'exported';
  source: 'workspace';
  sections: DocumentSection[];
  createdAt: string;
  updatedAt: string;
};

export type ReportBuildState = 'idle' | 'building' | 'success' | 'error';

/** Creates the contract default payload for mobile report generation. */
export const defaultMobileReportPayload = (
  caseId: string,
): BuildReportPayload => ({
  caseId,
  outputType: 'both',
  tone: 'neutral',
  patternHandling: 'include_supported_only',
  source: 'workspace_mobile',
});
