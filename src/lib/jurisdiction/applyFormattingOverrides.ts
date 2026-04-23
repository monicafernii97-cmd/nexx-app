/**
 * Formatting Override Application
 *
 * Pure, deterministic merge utility. Applies FormattingOverridesV2
 * on top of a JurisdictionProfile without mutating the source.
 *
 * Merge order (lowest → highest):
 *   system defaults → shared jurisdiction profile → overrides
 *
 * This function is the ONLY place overrides are applied to profiles.
 * Renderers receive a fully-resolved profile — never raw overrides.
 */

import type { JurisdictionProfile } from './types';
import type { FormattingOverridesV2 } from './overrides';

/**
 * Apply formatting overrides on top of a base profile.
 *
 * Returns a new profile object — never mutates the input.
 *
 * @param base - The resolved base profile
 * @param overrides - Normalized V2 overrides (or undefined to skip)
 * @returns New profile with overrides merged
 */
export function applyFormattingOverrides(
  base: JurisdictionProfile,
  overrides: FormattingOverridesV2 | undefined,
): JurisdictionProfile {
  if (!overrides) return base;

  return {
    ...base,
    page: mergePageOverrides(base.page, overrides),
    typography: mergeTypographyOverrides(base.typography, overrides),
    sections: base.sections
      ? mergeSectionsOverrides(base.sections, overrides)
      : base.sections,
    exhibit: base.exhibit
      ? mergeExhibitOverrides(base.exhibit, overrides)
      : base.exhibit,
    summary: base.summary
      ? mergeSummaryOverrides(base.summary, overrides)
      : base.summary,
    court: base.court
      ? mergeCourtOverrides(base.court, overrides)
      : base.court,
  };
}

// ═══════════════════════════════════════════════════════════════
// Internal Merge Helpers
// ═══════════════════════════════════════════════════════════════

function mergePageOverrides(
  page: JurisdictionProfile['page'],
  overrides: FormattingOverridesV2,
): JurisdictionProfile['page'] {
  const size = overrides.pageSize
    ? mapPageSize(overrides.pageSize)
    : page.size;

  const dims = getPageDimensions(size);

  return {
    ...page,
    size,
    widthIn: dims.widthIn,
    heightIn: dims.heightIn,
    marginsPt: overrides.pageMarginsPt ?? page.marginsPt,
  };
}

function mergeTypographyOverrides(
  typo: JurisdictionProfile['typography'],
  overrides: FormattingOverridesV2,
): JurisdictionProfile['typography'] {
  const fontSizePt = overrides.defaultFontSizePt ?? typo.fontSizePt;
  const lineHeightPt = overrides.lineSpacing
    ? Math.round(fontSizePt * overrides.lineSpacing)
    : overrides.defaultFontSizePt
      ? Math.round(overrides.defaultFontSizePt * (typo.lineHeightPt / typo.fontSizePt))
      : typo.lineHeightPt;

  return {
    ...typo,
    fontFamily: overrides.defaultFont
      ? `"${overrides.defaultFont}", Times, serif`
      : typo.fontFamily,
    fontSizePt,
    lineHeightPt,
  };
}

function mergeSectionsOverrides(
  sections: NonNullable<JurisdictionProfile['sections']>,
  overrides: FormattingOverridesV2,
): NonNullable<JurisdictionProfile['sections']> {
  return {
    ...sections,
    certificateSeparatePage: overrides.certificateSeparatePage ?? sections.certificateSeparatePage,
  };
}

function mergeExhibitOverrides(
  exhibit: NonNullable<JurisdictionProfile['exhibit']>,
  overrides: FormattingOverridesV2,
): NonNullable<JurisdictionProfile['exhibit']> {
  return {
    ...exhibit,
    labelStyleDefault: overrides.exhibitLabelStyle ?? exhibit.labelStyleDefault,
    batesEnabledDefault: overrides.batesEnabled ?? exhibit.batesEnabledDefault,
  };
}

function mergeSummaryOverrides(
  summary: NonNullable<JurisdictionProfile['summary']>,
  overrides: FormattingOverridesV2,
): NonNullable<JurisdictionProfile['summary']> {
  return {
    ...summary,
    timelineAsTable: overrides.timelineAsTable ?? summary.timelineAsTable,
  };
}

function mergeCourtOverrides(
  court: NonNullable<JurisdictionProfile['court']>,
  overrides: FormattingOverridesV2,
): NonNullable<JurisdictionProfile['court']> {
  return {
    ...court,
    certificateSeparatePage: overrides.certificateSeparatePage ?? court.certificateSeparatePage,
  };
}

// ═══════════════════════════════════════════════════════════════
// Page Size Helpers
// ═══════════════════════════════════════════════════════════════

function mapPageSize(size: 'LETTER' | 'A4' | 'LEGAL'): 'Letter' | 'A4' | 'Legal' {
  switch (size) {
    case 'LETTER': return 'Letter';
    case 'A4': return 'A4';
    case 'LEGAL': return 'Legal';
  }
}

function getPageDimensions(size: 'Letter' | 'A4' | 'Legal'): { widthIn: number; heightIn: number } {
  switch (size) {
    case 'A4': return { widthIn: 8.27, heightIn: 11.69 };
    case 'Legal': return { widthIn: 8.5, heightIn: 14 };
    default: return { widthIn: 8.5, heightIn: 11 };
  }
}
