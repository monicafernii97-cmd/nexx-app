import { describe, expect, it } from 'vitest';
import type { Id } from '@convex/_generated/dataModel';
import { exportReducer, initialState, type ExportConfig } from '../ExportContext';
import type { ExportRequest } from '@/lib/export-assembly/types/exports';

const caseId = 'case_1' as Id<'cases'>;

function reviewState() {
  const config: ExportConfig = {
    path: 'court_document',
    caseId,
    includeTimeline: false,
    includeExhibits: false,
    selectedTimelineIds: [],
    linkedExhibitIds: [],
    exhibitReferenceMatches: [],
  };
  const exportRequest: ExportRequest = {
    path: 'court_document',
    structureSource: 'court_prompt_profile',
    selectedNodeIds: [],
    selectedEvidenceIds: [],
    selectedTimelineIds: [],
    config: {
      documentType: 'motion',
      tone: 'neutral',
      includeCaption: true,
      includeLegalStandard: true,
      includePrayer: true,
      includeCertificateOfService: true,
      includeProposedOrder: false,
      includeTimeline: false,
      outputFormat: 'pdf',
    },
  };

  return {
    ...initialState,
    phase: 'reviewing' as const,
    exportPath: 'court_document' as const,
    caseId,
    config,
    exportRequest,
  };
}

describe('ExportContext reference reducer behavior', () => {
  it('adds and removes exhibit links without blocking review state', () => {
    const withMatch = exportReducer(reviewState(), {
      type: 'APPLY_EXHIBIT_REFERENCE_MATCHES',
      matches: [{ reference: 'Exhibit A', exhibitId: 'pin_1', exhibitTitle: 'School email chain' }],
    });

    expect(withMatch.config?.linkedExhibitIds).toEqual(['pin_1']);
    expect(withMatch.exportRequest?.selectedEvidenceIds).toEqual(['pin_1']);
    expect(withMatch.config?.includeExhibits).toBe(true);

    const removed = exportReducer(withMatch, {
      type: 'REMOVE_EXHIBIT_REFERENCE_MATCH',
      reference: 'Exhibit A',
      skipReference: true,
    });

    expect(removed.config?.linkedExhibitIds).toEqual([]);
    expect(removed.exportRequest?.selectedEvidenceIds).toEqual([]);
    expect(removed.skippedExhibitReferences).toContain('Exhibit A');
    expect(removed.phase).toBe('reviewing');
  });

  it('updates timeline selection on config and export request together', () => {
    const next = exportReducer(reviewState(), {
      type: 'UPDATE_TIMELINE_SELECTION',
      includeTimeline: true,
      selectedTimelineIds: ['timeline_1', 'timeline_2', 'timeline_1'],
    });

    expect(next.config?.includeTimeline).toBe(true);
    expect(next.config?.selectedTimelineIds).toEqual(['timeline_1', 'timeline_2']);
    expect(next.exportRequest?.selectedTimelineIds).toEqual(['timeline_1', 'timeline_2']);
    expect((next.exportRequest?.config as { includeTimeline?: boolean }).includeTimeline).toBe(true);
  });
});
