import type {
  DocumentDraft,
  DocumentSection,
  DocumentSectionStatus,
  ReportOutputType,
} from './reportTypes';

export const mobileDocuVaultSectionSeeds: Array<
  Pick<DocumentSection, 'id' | 'title' | 'status' | 'sourceCount'> & {
    body: string;
  }
> = [
  {
    id: 'overview',
    title: 'Overview',
    status: 'ready',
    sourceCount: 3,
    body: 'Summarize the main issue, the current posture, and the most important source-backed facts from the workspace.',
  },
  {
    id: 'key-facts',
    title: 'Key Facts',
    status: 'ready',
    sourceCount: 5,
    body: 'List the strongest saved facts in short, factual language. Keep each point tied to source material.',
  },
  {
    id: 'timeline-summary',
    title: 'Timeline Summary',
    status: 'needs_review',
    sourceCount: 4,
    body: 'Organize the most important timeline events in chronological order and check dates before export.',
  },
  {
    id: 'observed-patterns',
    title: 'Observed Patterns',
    status: 'needs_review',
    sourceCount: 2,
    body: 'Include only repeated, source-backed patterns. Avoid dramatic labels or unsupported conclusions.',
  },
  {
    id: 'open-questions',
    title: 'Open Questions',
    status: 'ready',
    sourceCount: 0,
    body: 'Capture missing facts, unclear dates, and anything that should be verified before court use.',
  },
  {
    id: 'source-notes',
    title: 'Source Notes',
    status: 'ready',
    sourceCount: 6,
    body: 'Preserve the source-backed basis for the draft so preview and export can remain traceable.',
  },
];

export function getMobileDraftStorageIdentity(caseId: string, draftId?: string) {
  return draftId ?? `mobile-draft-${caseId}`;
}

export function getMobileDraftStorageKey(caseId: string, draftId?: string) {
  return `mobile-docuvault-draft:${getMobileDraftStorageIdentity(caseId, draftId)}`;
}

export function getMobileUnsavedDraftStorageKey(caseId: string, draftId?: string) {
  return `mobile-docuvault-unsaved:${getMobileDraftStorageIdentity(caseId, draftId)}`;
}

/** Create the first mobile document draft from workspace handoff state. */
export function createInitialMobileDraft(
  caseId: string,
  documentType: ReportOutputType,
  draftId?: string,
): DocumentDraft {
  const now = new Date().toISOString();
  return {
    id: getMobileDraftStorageIdentity(caseId, draftId),
    caseId,
    documentType,
    status: 'draft',
    source: 'workspace',
    sections: mobileDocuVaultSectionSeeds.map((section) => ({
      ...section,
      preview: section.body,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function getMobileDocumentTypeLabel(outputType?: ReportOutputType) {
  if (outputType === 'summary_pdf') return 'Case Summary PDF';
  if (outputType === 'court_document') return 'Court Document Draft';
  return 'Summary PDF + Court Document';
}

/** Render contract status labels without warning-heavy styling. */
export function getMobileSectionStatusLabel(status: DocumentSectionStatus) {
  if (status === 'needs_review') return 'Review';
  if (status === 'empty') return 'Empty';
  return 'Ready';
}

export function getMobileDraftPlainText(draft: DocumentDraft) {
  return draft.sections
    .map((section) => {
      const body = section.body.trim();
      if (!body) return null;
      return `${section.title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function mobileDraftHasContent(draft: DocumentDraft) {
  return draft.sections.some((section) => section.body.trim().length > 0);
}
