/**
 * Jurisdiction Profile Resolver (Quick Generate)
 *
 * Resolves the best-matching JurisdictionProfile based on court
 * settings and parsed document metadata.
 *
 * DELEGATES to the shared resolver (src/lib/jurisdiction/) for
 * profile selection. This module provides:
 *   - QG-specific adapter: toCourtFormattingRules()
 *   - Convex settings loading: getEffectiveCourtSettings()
 *   - Domain mapping: mapSavedToCourtSettings()
 *   - Convenience wrapper: loadCourtSettings()
 *
 * Profile definitions live in src/lib/jurisdiction/profiles/.
 */

import type { JurisdictionProfile } from '@/lib/jurisdiction/types';
import type { CourtSettings } from './types';
import type { CourtFormattingRules } from '@/lib/legal/types';
import { resolveSharedJurisdictionProfile } from '@/lib/jurisdiction/resolveSharedJurisdictionProfile';
import { applyFormattingOverrides } from '@/lib/jurisdiction/applyFormattingOverrides';
import {
  resolveEffectiveOverrides,
  coerceLegacyFormattingOverrides,
} from '@/lib/jurisdiction/overrides';

// ═══════════════════════════════════════════════════════════════
// Saved Court Settings Shape (Convex-native)
// ═══════════════════════════════════════════════════════════════

/**
 * Shape of the Convex userCourtSettings record.
 * Accepts the real Convex record directly — no intermediate abstraction.
 */
export type SavedCourtSettings = {
  state: string;
  county: string;
  courtName?: string;
  judicialDistrict?: string;
  assignedJudge?: string;
  causeNumber?: string;
  petitionerLegalName?: string;
  respondentLegalName?: string;
  petitionerRole?: 'petitioner' | 'respondent';
  formattingOverrides?: Partial<CourtFormattingRules>;
  profileKey?: string;
  profileVersion?: string;
  formattingOverridesV2?: Record<string, unknown>;
} | null | undefined;

// ═══════════════════════════════════════════════════════════════
// Profile Resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve the best-matching jurisdiction profile.
 *
 * Accepts both `SavedCourtSettings` (Convex-native) and
 * `CourtSettings` (clean domain contract). Normalizes internally.
 *
 * Delegates to the shared resolver, then applies formatting overrides.
 */
export function resolveJurisdictionProfile(
  settings: SavedCourtSettings | CourtSettings | null | undefined,
): JurisdictionProfile {
  const input = normalizeSettingsInput(settings);
  const { profile } = resolveSharedJurisdictionProfile(input);

  // Apply formatting overrides from settings
  const overrides = extractOverrides(settings);
  return applyFormattingOverrides(profile, overrides);
}

/**
 * Normalize both CourtSettings and SavedCourtSettings into
 * the shared resolver input shape.
 */
function normalizeSettingsInput(
  settings: SavedCourtSettings | CourtSettings | null | undefined,
): { profileKey?: string; state?: string; county?: string; courtName?: string; courtType?: string; district?: string } | null {
  if (!settings) return null;

  // CourtSettings shape: has `.jurisdiction.state`
  if ('jurisdiction' in settings && settings.jurisdiction) {
    const j = settings.jurisdiction;
    return {
      state: j.state,
      county: j.county,
      courtName: j.courtName,
      courtType: j.courtType,
      district: j.district,
    };
  }

  // SavedCourtSettings shape: has `.state` directly
  if ('state' in settings) {
    return {
      profileKey: settings.profileKey,
      state: settings.state,
      county: settings.county,
      courtName: settings.courtName,
      district: settings.judicialDistrict,
    };
  }

  return null;
}

/**
 * Extract formatting overrides from settings.
 * Prefers V2, falls back to legacy coercion.
 */
function extractOverrides(
  settings: SavedCourtSettings | CourtSettings | null | undefined,
) {
  if (!settings) return undefined;

  // SavedCourtSettings with V2 or legacy overrides
  if ('formattingOverridesV2' in settings || 'formattingOverrides' in settings) {
    const saved = settings as NonNullable<SavedCourtSettings> & { formattingOverridesV2?: unknown };
    const { overrides } = resolveEffectiveOverrides(
      saved.formattingOverridesV2,
      saved.formattingOverrides,
    );
    return overrides;
  }

  // CourtSettings with formatting block — coerce to V2
  if ('formatting' in settings && settings.formatting) {
    const f = settings.formatting;
    return coerceLegacyFormattingOverrides({
      fontSize: f.defaultFontSizePt,
      fontFamily: f.defaultFont,
      lineSpacing: f.lineSpacing,
      paperHeight: f.pageSize === 'LEGAL' ? 14 : f.pageSize === 'A4' ? 11.69 : undefined,
      marginTop: f.pageMarginsPt ? f.pageMarginsPt.top / 72 : undefined,
      marginRight: f.pageMarginsPt ? f.pageMarginsPt.right / 72 : undefined,
      marginBottom: f.pageMarginsPt ? f.pageMarginsPt.bottom / 72 : undefined,
      marginLeft: f.pageMarginsPt ? f.pageMarginsPt.left / 72 : undefined,
    });
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════
// Adapter: JurisdictionProfile → CourtFormattingRules
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a JurisdictionProfile into CourtFormattingRules
 * so the existing pdfRenderer.ts can consume it unchanged.
 */
export function toCourtFormattingRules(profile: JurisdictionProfile): CourtFormattingRules {
  const caption = profile.caption;
  const pageNum = profile.pageNumbering;

  return {
    paperWidth: profile.page.widthIn,
    paperHeight: profile.page.heightIn,
    marginTop: profile.page.marginsPt.top / 72,
    marginBottom: profile.page.marginsPt.bottom / 72,
    marginLeft: profile.page.marginsPt.left / 72,
    marginRight: profile.page.marginsPt.right / 72,

    fontFamily: profile.typography.fontFamily.replace(/"/g, ''),
    fontSize: profile.typography.fontSizePt,
    lineSpacing: profile.typography.lineHeightPt / profile.typography.fontSizePt,
    footnoteFontSize: 10,
    bodyAlignment: profile.typography.bodyAlign,

    captionStyle: caption?.style === 'texas_pleading'
      ? 'section-symbol'
      : caption?.style === 'federal_caption'
        ? 'versus'
        : 'centered',
    captionColumnWidths: {
      left: caption?.leftWidthIn ?? 3.125,
      center: caption?.centerWidthIn ?? 0.083,
      right: caption?.rightWidthIn ?? 3.125,
    },
    causeNumberPosition: 'centered-above',

    pageNumbering: pageNum?.enabled ?? false,
    pageNumberPosition: pageNum?.position ?? 'bottom-center',
    pageNumberFormat: pageNum?.format ?? 'simple',
    footerEnabled: pageNum?.enabled ?? false,
    footerFontSize: 10,

    paragraphIndent: 0,
    sectionHeadingStyle: 'bold-caps',
    titleStyle: 'bold-caps-centered',
    spacingBeforeHeading: 1,
    spacingBetweenParagraphs: 1,

    requiresCertificateOfService: true,
    requiresSignatureBlock: true,
    requiresVerification: false,
    requiresCivilCaseInfoSheet: false,

    eFilingMandatory: false,
    redactionRequired: false,

    notes: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// Effective Court Settings Loader
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical precedence for determining effective court settings.
 *
 * Precedence:
 *   1. case-level saved settings (from Convex)
 *   2. user default saved settings (from Convex)
 *   3. body.courtSettings payload fallback
 *   4. null → resolver default profile
 */
export async function getEffectiveCourtSettings({
  convexQuery,
  payloadCourtSettings,
}: {
  convexQuery: () => Promise<SavedCourtSettings>;
  payloadCourtSettings?: Record<string, unknown> | null;
}): Promise<SavedCourtSettings> {
  try {
    const saved = await convexQuery();
    if (saved) {
      console.log('[LegalDocs] Using saved Convex court settings');
      return saved;
    }
  } catch (err) {
    console.warn('[LegalDocs] Failed to load Convex court settings, falling back to payload', err);
  }

  if (payloadCourtSettings && typeof payloadCourtSettings === 'object') {
    const p = payloadCourtSettings as Record<string, unknown>;
    if (p.state) {
      console.log('[LegalDocs] Using payload court settings as fallback');
      return {
        state: String(p.state || ''),
        county: String(p.county || ''),
        courtName: typeof p.courtName === 'string' ? p.courtName : undefined,
        judicialDistrict: typeof p.judicialDistrict === 'string' ? p.judicialDistrict : undefined,
        causeNumber: typeof p.causeNumber === 'string' ? p.causeNumber : undefined,
        petitionerLegalName: typeof p.petitionerLegalName === 'string' ? p.petitionerLegalName : undefined,
        respondentLegalName: typeof p.respondentLegalName === 'string' ? p.respondentLegalName : undefined,
        profileKey: typeof p.profileKey === 'string' ? p.profileKey : undefined,
        formattingOverrides:
          p.formattingOverrides && typeof p.formattingOverrides === 'object'
            ? (p.formattingOverrides as Partial<CourtFormattingRules>)
            : undefined,
        formattingOverridesV2:
          p.formattingOverridesV2 && typeof p.formattingOverridesV2 === 'object'
            ? (p.formattingOverridesV2 as Record<string, unknown>)
            : undefined,
      };
    }
  }

  console.log('[LegalDocs] No court settings found, using default jurisdiction profile');
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Domain Converter: SavedCourtSettings → CourtSettings
// ═══════════════════════════════════════════════════════════════

/**
 * Map Convex-native SavedCourtSettings to the clean external CourtSettings contract.
 */
export function mapSavedToCourtSettings(
  saved: SavedCourtSettings,
): CourtSettings {
  if (!saved) {
    return { jurisdiction: {} };
  }

  const overrides = saved.formattingOverrides;

  return {
    jurisdiction: {
      country: 'United States',
      state: saved.state || undefined,
      county: saved.county || undefined,
      courtName: saved.courtName,
      district: saved.judicialDistrict,
    },
    formatting: overrides
      ? {
          pleadingStyle: overrides.captionStyle === 'section-symbol'
            ? 'caption_table'
            : overrides.captionStyle === 'versus'
              ? 'federal_caption'
              : overrides.captionStyle === 'centered'
                ? 'simple_caption'
                : undefined,
          defaultFont: overrides.fontFamily
            ? `"${overrides.fontFamily}", Times, serif`
            : undefined,
          defaultFontSizePt: overrides.fontSize,
          lineSpacing: overrides.lineSpacing,
          pageSize: overrides.paperHeight === 14
            ? 'LEGAL'
            : overrides.paperHeight === 11 || !overrides.paperHeight
              ? 'LETTER'
              : undefined,
          pageMarginsPt:
            overrides.marginTop != null ||
            overrides.marginRight != null ||
            overrides.marginBottom != null ||
            overrides.marginLeft != null
              ? {
                  top: Math.round((overrides.marginTop ?? 1) * 72),
                  right: Math.round((overrides.marginRight ?? 1) * 72),
                  bottom: Math.round((overrides.marginBottom ?? 1) * 72),
                  left: Math.round((overrides.marginLeft ?? 1) * 72),
                }
              : undefined,
        }
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// Ergonomic Loader Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Load court settings for a user/case and return the clean domain contract.
 */
export async function loadCourtSettings({
  convexQuery,
  payloadFallback,
}: {
  convexQuery: () => Promise<SavedCourtSettings>;
  payloadFallback?: Record<string, unknown> | null;
}): Promise<CourtSettings> {
  const normalizedFallback: Record<string, unknown> | null | undefined = (() => {
    if (!payloadFallback || typeof payloadFallback !== 'object') return payloadFallback;

    const j = payloadFallback.jurisdiction as Record<string, unknown> | undefined;
    if (!j || typeof j !== 'object') return payloadFallback;

    return {
      state: typeof j.state === 'string' ? j.state : '',
      county: typeof j.county === 'string' ? j.county : '',
      courtName: typeof j.courtName === 'string' ? j.courtName : undefined,
      judicialDistrict: typeof j.district === 'string' ? j.district : undefined,
    };
  })();

  const saved = await getEffectiveCourtSettings({
    convexQuery,
    payloadCourtSettings: normalizedFallback,
  });
  return mapSavedToCourtSettings(saved);
}
