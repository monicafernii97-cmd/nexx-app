/**
 * Build Exhibit Cover Draft Inputs from ExhibitMappedSections
 *
 * Derives ExhibitCoverDraftInput[] from the assembly layer's
 * ExhibitMappedSections type. This bridges the deterministic
 * assembly output to the AI drafting service.
 *
 * Operates on the REAL types — no CanonicalExportDocument abstraction.
 */

import type { ExhibitMappedSections } from '@/lib/export-assembly/types/exports';
import type { ExhibitCoverDraftInput } from './types';

/**
 * Extract exhibit cover draft inputs from mapped sections.
 *
 * @param mappedSections  The exhibit mapped sections from assembly
 * @param jurisdiction    Optional jurisdiction context from export config
 * @returns               Array of draft inputs, one per exhibit
 */
export function buildExhibitCoverDraftInputs(
  mappedSections: ExhibitMappedSections,
  jurisdiction?: {
    state?: string;
    county?: string;
    courtName?: string;
  },
): ExhibitCoverDraftInput[] {
  const { coverSheetSummaries, indexEntries } = mappedSections;

  // Build a lookup of index entries by label for enrichment
  const indexByLabel = new Map(
    indexEntries.map((entry) => [entry.label, entry]),
  );

  return coverSheetSummaries.map((cover) => {
    const indexEntry = indexByLabel.get(cover.label);

    return {
      label: cover.label,
      title: indexEntry?.title || cover.heading,
      documentType: indexEntry?.source,
      dateRange: indexEntry?.date,
      description: cover.summary || indexEntry?.relevance,
      indexContext: indexEntry?.issueTags?.length
        ? `Related issues: ${indexEntry.issueTags.join(', ')}.`
        : undefined,
      jurisdiction,
    };
  });
}
