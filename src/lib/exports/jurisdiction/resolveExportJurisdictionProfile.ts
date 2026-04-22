/**
 * Export Jurisdiction Profile Resolver
 *
 * Maps state/county/court → ExportJurisdictionProfile for the export pipeline.
 * Mirrors the Quick Generate resolver pattern but adds exhibit + summary rules.
 *
 * Also provides toExportFormattingRules() to bridge ExportJurisdictionProfile
 * → CourtFormattingRules for the existing renderHTMLToPDF() interface.
 */

import type { ExportJurisdictionProfile } from './types';
import type { CourtFormattingRules } from '@/lib/legal/types';

import { US_DEFAULT_EXPORT_PROFILE } from './profiles/us-default';
import { TX_DEFAULT_EXPORT_PROFILE } from './profiles/tx-default';
import { TX_FORT_BEND_387TH_EXPORT_PROFILE } from './profiles/tx-fort-bend-387th';
import { FL_DEFAULT_EXPORT_PROFILE } from './profiles/fl-default';
import { CA_DEFAULT_EXPORT_PROFILE } from './profiles/ca-default';
import { FEDERAL_DEFAULT_EXPORT_PROFILE } from './profiles/federal-default';

// ═══════════════════════════════════════════════════════════════
// Resolver
// ═══════════════════════════════════════════════════════════════

/** Minimal settings input for profile resolution. */
export type ExportSettingsInput = {
  state?: string;
  county?: string;
  courtName?: string;
  courtType?: string;
  district?: string;
} | null | undefined;

/**
 * Resolve the best-matching export jurisdiction profile.
 *
 * Resolution order:
 *   1. Federal detection (court name / court type)
 *   2. County-specific profiles (e.g. Fort Bend 387th)
 *   3. State-level defaults
 *   4. US neutral fallback
 *
 * @param settings - Court settings from Convex or export config
 * @returns Matched ExportJurisdictionProfile
 */
export function resolveExportJurisdictionProfile(
  settings: ExportSettingsInput,
): ExportJurisdictionProfile {
  if (!settings) return US_DEFAULT_EXPORT_PROFILE;

  const state = (settings.state || '').toLowerCase().trim();
  const county = (settings.county || '').toLowerCase().trim();
  const courtName = (settings.courtName || '').toLowerCase().trim();
  const courtType = (settings.courtType || '').toLowerCase().trim();

  // ── Federal detection ──
  const isFederal =
    courtType === 'federal' ||
    courtName.includes('united states district court') ||
    courtName.includes('u.s. district court') ||
    courtName.includes('us district court') ||
    /\busdc\b/.test(courtName) ||
    /\bu\.?s\.?d\.?c\.?\b/.test(courtName);

  if (isFederal) return FEDERAL_DEFAULT_EXPORT_PROFILE;

  // ── County-specific ──
  if (state === 'texas' && county === 'fort bend') {
    const venue = courtName + ' ' + (settings.district || '');
    if (/\b387(th)?\b/.test(venue)) {
      return TX_FORT_BEND_387TH_EXPORT_PROFILE;
    }
  }

  // ── State-level ──
  if (state === 'texas') return TX_DEFAULT_EXPORT_PROFILE;
  if (state === 'florida') return FL_DEFAULT_EXPORT_PROFILE;
  if (state === 'california') return CA_DEFAULT_EXPORT_PROFILE;

  // ── Neutral fallback ──
  return US_DEFAULT_EXPORT_PROFILE;
}

// ═══════════════════════════════════════════════════════════════
// Bridge: ExportJurisdictionProfile → CourtFormattingRules
// ═══════════════════════════════════════════════════════════════

/**
 * Map an ExportJurisdictionProfile to CourtFormattingRules.
 *
 * This adapter keeps renderHTMLToPDF() unchanged (Option A decision).
 * The export pipeline calls this before passing to the PDF renderer.
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
