/**
 * Apply Exhibit Cover Drafts to ExhibitMappedSections
 *
 * Patches AI-drafted summaries, titles, and stamp text back into
 * the assembly's ExhibitMappedSections. Non-destructive — unmatched
 * labels are preserved as-is.
 *
 * Operates on the REAL types — no CanonicalExportDocument abstraction.
 */

import type { ExhibitMappedSections } from '@/lib/export-assembly/types/exports';
import type { ExhibitCoverDraftResult } from './types';

/**
 * Patch cover sheet summaries with AI-drafted content.
 *
 * @returns A new ExhibitMappedSections with patched coverSheetSummaries.
 *          The original object is NOT mutated.
 */
export function applyExhibitCoverDrafts(
  mappedSections: ExhibitMappedSections,
  drafts: Record<string, ExhibitCoverDraftResult>,
): ExhibitMappedSections {
  const patchedCovers = mappedSections.coverSheetSummaries.map((cover) => {
    const draft = drafts[cover.label];
    if (!draft || draft.summaryLines.length === 0) return cover;

    return {
      ...cover,
      heading: draft.title || cover.heading,
      summary: draft.summaryLines.join(' '),
    };
  });

  return {
    ...mappedSections,
    coverSheetSummaries: patchedCovers,
  };
}
