/**
 * Court Settings Loader
 *
 * Composes the existing Convex settings loader with document-level
 * overrides to produce a clean CourtSettings contract.
 *
 * Merge priority:
 *   1. documentOverride (document-level)
 *   2. Convex saved settings (case-level → user-level)
 *   3. payload fallback
 *   4. empty fallback → resolver will use default profile
 *
 * This is the canonical entry point for the generateLegalPDF orchestrator.
 */

import type { CourtSettings } from './types';
import type { SavedCourtSettings } from './resolveJurisdictionProfile';
import {
  getEffectiveCourtSettings,
  mapSavedToCourtSettings,
} from './resolveJurisdictionProfile';

/**
 * Load court settings for a pipeline invocation.
 *
 * @param params.convexQuery - Async function to query Convex for saved settings
 * @param params.payloadFallback - Fallback from request body
 * @param params.documentOverride - Document-level settings override (highest priority)
 * @returns Resolved CourtSettings (never null)
 */
export async function loadCourtSettingsForPipeline(params: {
  convexQuery: () => Promise<SavedCourtSettings>;
  payloadFallback?: Record<string, unknown> | null;
  documentOverride?: Partial<CourtSettings>;
}): Promise<CourtSettings> {
  const { convexQuery, payloadFallback, documentOverride } = params;

  // Normalize CourtSettings-shaped payloads ({ jurisdiction: { ... } })
  // into the flat shape that getEffectiveCourtSettings expects.
  const normalizedFallback: Record<string, unknown> | null | undefined = (() => {
    if (!payloadFallback || typeof payloadFallback !== 'object') return payloadFallback;

    const j = (payloadFallback as Record<string, unknown>).jurisdiction as Record<string, unknown> | undefined;
    if (!j || typeof j !== 'object') return payloadFallback;

    return {
      state: typeof j.state === 'string' ? j.state : '',
      county: typeof j.county === 'string' ? j.county : '',
      courtName: typeof j.courtName === 'string' ? j.courtName : undefined,
      judicialDistrict: typeof j.district === 'string' ? j.district : undefined,
    };
  })();

  // Load from Convex + payload fallback
  const saved = await getEffectiveCourtSettings({
    convexQuery,
    payloadCourtSettings: normalizedFallback,
  });

  // Map to clean domain contract
  const base = mapSavedToCourtSettings(saved);

  // Merge document-level override on top (highest priority)
  if (!documentOverride) {
    return base;
  }

  return {
    jurisdiction: {
      ...base.jurisdiction,
      ...(documentOverride.jurisdiction || {}),
    },
    formatting: {
      ...base.formatting,
      ...(documentOverride.formatting || {}),
    },
  };
}
