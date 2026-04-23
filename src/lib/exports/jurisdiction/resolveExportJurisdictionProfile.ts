/**
 * Export Jurisdiction Profile Resolver
 *
 * DELEGATES to the shared resolver for profile selection,
 * then narrows to ExportJurisdictionProfile via runtime assertion.
 *
 * Also provides toExportFormattingRules() to bridge
 * ExportJurisdictionProfile → CourtFormattingRules for the
 * existing renderHTMLToPDF() interface.
 */

import type { ExportJurisdictionProfile } from './types';
import type { CourtFormattingRules } from '@/lib/legal/types';
import {
  resolveSharedJurisdictionProfile,
  type ResolvedProfileResult,
} from '@/lib/jurisdiction/resolveSharedJurisdictionProfile';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';

// ═══════════════════════════════════════════════════════════════
// Resolver
// ═══════════════════════════════════════════════════════════════

/** Minimal settings input for export profile resolution. */
export type ExportSettingsInput = {
  profileKey?: string;
  state?: string;
  county?: string;
  courtName?: string;
  courtType?: string;
  district?: string;
} | null | undefined;

/**
 * Resolve the best-matching export jurisdiction profile.
 *
 * Delegates to the shared resolver, then asserts export blocks.
 *
 * @param settings - Court settings from Convex or export config
 * @returns Narrowed ExportJurisdictionProfile with court/exhibit/summary guaranteed
 * @throws If resolved profile is missing required export blocks
 */
export function resolveExportJurisdictionProfile(
  settings: ExportSettingsInput,
): ExportJurisdictionProfile {
  const { profile } = resolveSharedJurisdictionProfile(settings);
  return assertExportProfile(profile);
}

/**
 * Resolve with full metadata (for orchestrator usage).
 */
export function resolveExportProfileWithMeta(
  settings: ExportSettingsInput,
): ResolvedProfileResult & { profile: ExportJurisdictionProfile } {
  const result = resolveSharedJurisdictionProfile(settings);
  const profile = assertExportProfile(result.profile);
  return { ...result, profile };
}

// ═══════════════════════════════════════════════════════════════
// Bridge: ExportJurisdictionProfile → CourtFormattingRules
// ═══════════════════════════════════════════════════════════════

/**
 * Map an ExportJurisdictionProfile to CourtFormattingRules.
 *
 * This adapter keeps renderHTMLToPDF() unchanged (Option A decision).
 */
export function toExportFormattingRules(
  profile: ExportJurisdictionProfile,
): CourtFormattingRules {
  const lineSpacing = profile.typography.lineHeightPt / profile.typography.fontSizePt;

  return {
    // Page Setup
    paperWidth: profile.page.size === 'A4' ? 8.27 : 8.5,
    paperHeight: profile.page.size === 'Legal' ? 14 : profile.page.size === 'A4' ? 11.69 : 11,
    marginTop: profile.page.marginsPt.top / 72,
    marginBottom: profile.page.marginsPt.bottom / 72,
    marginLeft: profile.page.marginsPt.left / 72,
    marginRight: profile.page.marginsPt.right / 72,

    // Typography
    fontFamily: profile.typography.fontFamily,
    fontSize: profile.typography.fontSizePt,
    lineSpacing,
    footnoteFontSize: Math.max(9, profile.typography.fontSizePt - 2),
    bodyAlignment: profile.typography.bodyAlign,

    // Caption Style
    captionStyle: profile.court.captionStyle === 'texas_pleading'
      ? 'section-symbol'
      : 'versus',
    captionColumnWidths: { left: 2.5, center: 1.5, right: 2.5 },
    causeNumberPosition: 'top-right',

    // Page Structure
    pageNumbering: true,
    pageNumberPosition: 'bottom-center',
    pageNumberFormat: 'simple',
    footerEnabled: true,
    footerFontSize: 10,

    // Paragraph & Heading
    paragraphIndent: profile.typography.bodyAlign === 'justify' ? 0.5 : 0,
    sectionHeadingStyle: 'bold-caps',
    titleStyle: 'bold-caps-centered',
    spacingBeforeHeading: 1,
    spacingBetweenParagraphs: 1,

    // Required Sections
    requiresCertificateOfService: profile.court.certificateSeparatePage,
    requiresSignatureBlock: true,
    requiresVerification: false,
    requiresCivilCaseInfoSheet: false,

    // E-Filing
    eFilingMandatory: false,
    redactionRequired: false,

    // Notes
    notes: [],
  };
}
