/**
 * Assemble CourtDocumentDraftState from Convex
 *
 * Loads normalized data from the 3 Convex tables and
 * reconstructs a full CourtDocumentDraftState in memory.
 *
 * Used server-side by the export route.
 * The client NEVER sends the full state to export.
 */

import type {
  CourtDocumentDraftState,
  CourtDocumentSection,
  CourtSectionRevision,
  DocumentType,
  DiffSegment,
} from './types';

/**
 * Raw data loaded from Convex tables.
 * The export route fetches these and passes them here.
 */
export interface ConvexDraftData {
  draft: {
    documentId: string;
    documentType: string;
    title?: string;
    status: string;
    version: number;
    jurisdictionJson?: string;
    source?: string;
    createdAt: number;
    updatedAt: number;
  };
  sections: Array<{
    sectionId: string;
    heading: string;
    order: number;
    content: string;
    status: string;
    source: string;
    required: boolean;
    feedbackNotesJson?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  revisions: Array<{
    sectionId: string;
    before: string;
    after: string;
    diffJson?: string;
    source: string;
    note?: string;
    createdAt: number;
  }>;
}

/**
 * Reconstruct a full CourtDocumentDraftState from normalized Convex data.
 *
 * This runs server-side only. The client never sends the full state.
 */
export function assembleFromConvex(data: ConvexDraftData): CourtDocumentDraftState {
  const { draft, sections, revisions } = data;

  // Group revisions by sectionId
  const revisionMap = new Map<string, typeof revisions>();
  for (const rev of revisions) {
    const existing = revisionMap.get(rev.sectionId) || [];
    existing.push(rev);
    revisionMap.set(rev.sectionId, existing);
  }

  // Parse jurisdiction context
  let jurisdiction = {
    state: '',
    county: '',
    courtName: '',
    district: '',
  };
  if (draft.jurisdictionJson) {
    try {
      jurisdiction = { ...jurisdiction, ...JSON.parse(draft.jurisdictionJson) };
    } catch {
      // Use defaults
    }
  }

  // Build sections with their revision history
  const assembledSections: CourtDocumentSection[] = sections
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const sectionRevisions: CourtSectionRevision[] = (revisionMap.get(s.sectionId) || [])
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((r, idx) => {
          let diff: DiffSegment[] = [];
          if (r.diffJson) {
            try {
              diff = JSON.parse(r.diffJson);
            } catch {
              diff = [];
            }
          }
          return {
            id: `rev_${s.sectionId}_${idx}`,
            before: r.before,
            after: r.after,
            diff,
            source: r.source as CourtSectionRevision['source'],
            timestamp: new Date(r.createdAt).toISOString(),
            note: r.note,
          };
        });

      // Parse feedback notes
      let feedbackNotes: string[] = [];
      if (s.feedbackNotesJson) {
        try {
          feedbackNotes = JSON.parse(s.feedbackNotesJson);
        } catch {
          feedbackNotes = [];
        }
      }

      return {
        id: s.sectionId,
        heading: s.heading,
        order: s.order,
        content: s.content,
        status: s.status as CourtDocumentSection['status'],
        source: s.source as CourtDocumentSection['source'],
        revisions: sectionRevisions,
        feedbackNotes,
      };
    });

  return {
    documentId: draft.documentId,
    documentType: draft.documentType as DocumentType,
    sections: assembledSections,
    jurisdiction,
    metadata: {
      createdAt: new Date(draft.createdAt).toISOString(),
      updatedAt: new Date(draft.updatedAt).toISOString(),
      createdBy: 'system',
      isDirty: false,
      version: draft.version,
      source: (draft.source as CourtDocumentDraftState['metadata']['source']) || 'manual_start',
    },
    persistence: {
      storage: 'convex',
      lastSavedAt: new Date(draft.updatedAt).toISOString(),
      saveStatus: 'saved',
    },
  };
}
