/**
 * Exhibit Draft Request Builder
 *
 * Constructs AI prompt requests for court-safe exhibit cover summaries.
 * Produces the input contract consumed by the exhibit cover drafting service.
 */

import type { ExhibitCoverDraftInput } from './types';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** Source data for building exhibit draft requests. */
export type ExhibitDraftSourceItem = {
  label: string;
  title: string;
  documentType?: string;
  dateRange?: string;
  description?: string;
  indexContext?: string;
};

/** Jurisdiction context for prompt building. */
export type ExhibitDraftJurisdictionContext = {
  state?: string;
  county?: string;
  courtName?: string;
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build exhibit cover draft input requests from source items.
 *
 * @param items - Source items with exhibit data
 * @param jurisdiction - Optional jurisdiction context for tone
 * @returns Array of ExhibitCoverDraftInput ready for the drafting service
 */
export function buildExhibitDraftRequests(
  items: ExhibitDraftSourceItem[],
  jurisdiction?: ExhibitDraftJurisdictionContext,
): ExhibitCoverDraftInput[] {
  return items.map((item) => ({
    label: item.label,
    title: item.title,
    documentType: item.documentType,
    dateRange: item.dateRange,
    description: item.description,
    indexContext: item.indexContext,
    jurisdiction: jurisdiction
      ? {
          state: jurisdiction.state,
          county: jurisdiction.county,
          courtName: jurisdiction.courtName,
        }
      : undefined,
  }));
}
