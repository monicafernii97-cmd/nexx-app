/**
 * Jurisdiction Profile Merge Utility
 *
 * Pure, deterministic deep-merge for the layered profile system.
 *
 * Resolution order (caller-defined):
 *   US default → state → court type → specific court → user → case → document
 *
 * Each layer is a Partial<JurisdictionProfile> applied on top of the base.
 * Nested objects are merged per-key (not replaced wholesale).
 *
 * Persistence and resolution are separate concerns:
 *   - This function handles resolution (merge)
 *   - Convex handles persistence (storage)
 *   - The resolver decides which layers to supply
 */

import type { JurisdictionProfile } from './types';

/**
 * Merge a base profile with one or more override layers.
 *
 * Rules:
 *   - `base` must be a complete JurisdictionProfile
 *   - Overrides are applied left-to-right (later wins)
 *   - Null/undefined overrides are skipped
 *   - Nested objects are merged per-key (deep 1 level)
 *   - The `marginsPt` sub-object is merged independently
 *   - Top-level scalars (key, version, name, state, county) are replaced
 *   - Never mutates inputs
 *
 * @returns A new, fully-populated JurisdictionProfile
 */
export function mergeJurisdictionProfiles(
  base: JurisdictionProfile,
  ...overrides: Array<Partial<JurisdictionProfile> | null | undefined>
): JurisdictionProfile {
  let merged = structuredClone(base);

  for (const override of overrides) {
    if (!override) continue;

    merged = {
      ...merged,
      ...override,

      // ── Nested merges (preserve fields not in override) ──

      scope: {
        ...merged.scope,
        ...(override.scope || {}),
      },

      page: {
        ...merged.page,
        ...(override.page || {}),
        marginsPt: {
          ...merged.page.marginsPt,
          ...(override.page?.marginsPt || {}),
        },
      },

      typography: {
        ...merged.typography,
        ...(override.typography || {}),
      },

      pdf: {
        ...merged.pdf,
        ...(override.pdf || {}),
      },

      // ── Optional blocks: merge if present on either side ──

      caption: override.caption !== undefined
        ? { ...override.caption }
        : merged.caption
          ? { ...merged.caption }
          : undefined,

      sections: mergeOptionalBlock(merged.sections, override.sections),
      courtDocument: mergeOptionalBlock(merged.courtDocument, override.courtDocument),
      filename: mergeOptionalBlock(merged.filename, override.filename),
      pageNumbering: mergeOptionalBlock(merged.pageNumbering, override.pageNumbering),
      court: mergeOptionalBlock(merged.court, override.court),
      exhibit: mergeOptionalBlock(merged.exhibit, override.exhibit),
      summary: mergeOptionalBlock(merged.summary, override.summary),
      timeline: mergeOptionalBlock(merged.timeline, override.timeline),
      incident: mergeOptionalBlock(merged.incident, override.incident),
    };
  }

  return merged;
}

/**
 * Merge an optional block: if override provides it, merge on top of base.
 * If override is undefined (not provided), keep base. If override is explicitly
 * null, we still keep base (no deletion).
 */
function mergeOptionalBlock<T extends Record<string, unknown>>(
  base: T | undefined,
  override: T | undefined | null,
): T | undefined {
  if (override === undefined || override === null) return base ? { ...base } : undefined;
  if (!base) return { ...override };
  return { ...base, ...override };
}
