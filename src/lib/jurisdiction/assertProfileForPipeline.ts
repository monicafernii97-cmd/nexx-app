/**
 * Pipeline-Specific Profile Assertions
 *
 * Resolver success is NOT render readiness.
 *
 * These runtime guards enforce that a shared JurisdictionProfile
 * contains the required blocks for its target pipeline before
 * adaptation or rendering begins.
 *
 * Usage:
 *   const qgProfile = assertQuickGenerateProfile(profile);
 *   const exportProfile = assertExportProfile(profile);
 */

import type {
  JurisdictionProfile,
  QuickGenerateProfile,
  ExportJurisdictionProfile,
} from './types';

/**
 * Assert that a profile has all required QG blocks.
 *
 * @throws Error if caption, sections, filename, or pageNumbering are missing
 */
export function assertQuickGenerateProfile(
  profile: JurisdictionProfile,
): QuickGenerateProfile {
  if (!profile.caption || !profile.sections || !profile.filename || !profile.pageNumbering) {
    const missing = [
      !profile.caption && 'caption',
      !profile.sections && 'sections',
      !profile.filename && 'filename',
      !profile.pageNumbering && 'pageNumbering',
    ].filter(Boolean).join(', ');

    throw new Error(
      `Invalid QG profile "${profile.key}": missing required blocks: ${missing}`,
    );
  }
  return profile as QuickGenerateProfile;
}

/**
 * Assert that a profile has all required Export blocks.
 *
 * @throws Error if court, exhibit, or summary are missing
 */
export function assertExportProfile(
  profile: JurisdictionProfile,
): ExportJurisdictionProfile {
  if (!profile.court || !profile.exhibit || !profile.summary) {
    const missing = [
      !profile.court && 'court',
      !profile.exhibit && 'exhibit',
      !profile.summary && 'summary',
    ].filter(Boolean).join(', ');

    throw new Error(
      `Invalid export profile "${profile.key}": missing required blocks: ${missing}`,
    );
  }
  return profile as ExportJurisdictionProfile;
}
