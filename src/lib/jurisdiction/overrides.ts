/**
 * Formatting Override Types + Normalization
 *
 * Typed override definitions for court formatting. Both the V2
 * structured schema (Convex) and legacy v.any() fields are
 * handled here.
 *
 * Rules:
 *   - Whitelist allowed keys
 *   - Range-check numeric values
 *   - Reject invalid enums
 *   - Ignore unknown keys
 *   - Never mutate source
 *   - Produce stable output
 */

// ═══════════════════════════════════════════════════════════════
// V2 Typed Override Type
// ═══════════════════════════════════════════════════════════════

export type FormattingOverridesV2 = {
  pageSize?: 'LETTER' | 'A4' | 'LEGAL';
  pageMarginsPt?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  defaultFont?: string;
  defaultFontSizePt?: number;
  lineSpacing?: number;
  exhibitLabelStyle?: 'alpha' | 'numeric' | 'party_numeric';
  batesEnabled?: boolean;
  certificateSeparatePage?: boolean;
  timelineAsTable?: boolean;
};

// ═══════════════════════════════════════════════════════════════
// Type Guard
// ═══════════════════════════════════════════════════════════════

/** Check if input looks like a FormattingOverridesV2 object. */
export function isFormattingOverridesV2(input: unknown): input is FormattingOverridesV2 {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;

  // V2 uses our canonical keys — check for at least one
  const v2Keys = [
    'pageSize', 'pageMarginsPt', 'defaultFont', 'defaultFontSizePt',
    'lineSpacing', 'exhibitLabelStyle', 'batesEnabled',
    'certificateSeparatePage', 'timelineAsTable',
  ];
  return v2Keys.some((k) => k in obj);
}

// ═══════════════════════════════════════════════════════════════
// V2 Normalization
// ═══════════════════════════════════════════════════════════════

const VALID_PAGE_SIZES = new Set(['LETTER', 'A4', 'LEGAL']);
const VALID_LABEL_STYLES = new Set(['alpha', 'numeric', 'party_numeric']);

/**
 * Normalize a V2 overrides input. Whitelists keys, validates
 * ranges, drops invalid values. Never throws.
 */
export function normalizeFormattingOverrides(
  input: unknown,
): FormattingOverridesV2 | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  const result: FormattingOverridesV2 = {};

  // pageSize
  if (typeof obj.pageSize === 'string' && VALID_PAGE_SIZES.has(obj.pageSize)) {
    result.pageSize = obj.pageSize as FormattingOverridesV2['pageSize'];
  }

  // pageMarginsPt
  if (obj.pageMarginsPt && typeof obj.pageMarginsPt === 'object') {
    const m = obj.pageMarginsPt as Record<string, unknown>;
    const top = safePositiveNumber(m.top);
    const right = safePositiveNumber(m.right);
    const bottom = safePositiveNumber(m.bottom);
    const left = safePositiveNumber(m.left);
    if (top != null && right != null && bottom != null && left != null) {
      result.pageMarginsPt = { top, right, bottom, left };
    }
  }

  // defaultFont
  if (typeof obj.defaultFont === 'string' && obj.defaultFont.trim().length > 0) {
    result.defaultFont = obj.defaultFont.trim();
  }

  // defaultFontSizePt
  const fontSize = safePositiveNumber(obj.defaultFontSizePt);
  if (fontSize != null && fontSize >= 6 && fontSize <= 72) {
    result.defaultFontSizePt = fontSize;
  }

  // lineSpacing
  const spacing = safePositiveNumber(obj.lineSpacing);
  if (spacing != null && spacing >= 0.5 && spacing <= 5) {
    result.lineSpacing = spacing;
  }

  // exhibitLabelStyle
  if (typeof obj.exhibitLabelStyle === 'string' && VALID_LABEL_STYLES.has(obj.exhibitLabelStyle)) {
    result.exhibitLabelStyle = obj.exhibitLabelStyle as FormattingOverridesV2['exhibitLabelStyle'];
  }

  // booleans
  if (typeof obj.batesEnabled === 'boolean') result.batesEnabled = obj.batesEnabled;
  if (typeof obj.certificateSeparatePage === 'boolean') result.certificateSeparatePage = obj.certificateSeparatePage;
  if (typeof obj.timelineAsTable === 'boolean') result.timelineAsTable = obj.timelineAsTable;

  return Object.keys(result).length > 0 ? result : undefined;
}

// ═══════════════════════════════════════════════════════════════
// Legacy Coercion
// ═══════════════════════════════════════════════════════════════

/**
 * Coerce a legacy v.any() formattingOverrides object into V2 shape.
 *
 * Legacy overrides use CourtFormattingRules field names:
 *   - paperWidth/paperHeight → pageSize
 *   - marginTop/marginBottom/marginLeft/marginRight → pageMarginsPt
 *   - fontFamily → defaultFont
 *   - fontSize → defaultFontSizePt
 *   - lineSpacing → lineSpacing
 *
 * Invalid or unknown keys are silently dropped.
 */
export function coerceLegacyFormattingOverrides(
  input: unknown,
): FormattingOverridesV2 | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  const result: FormattingOverridesV2 = {};

  // Paper size → pageSize
  const height = typeof obj.paperHeight === 'number' ? obj.paperHeight : undefined;
  if (height === 14) result.pageSize = 'LEGAL';
  else if (height && height > 11.5) result.pageSize = 'A4'; // 11.69
  // else default LETTER (don't set — let profile default win)

  // Margins → pageMarginsPt (legacy stores in inches, convert to pt)
  const mt = safePositiveNumber(obj.marginTop);
  const mr = safePositiveNumber(obj.marginRight);
  const mb = safePositiveNumber(obj.marginBottom);
  const ml = safePositiveNumber(obj.marginLeft);
  if (mt != null || mr != null || mb != null || ml != null) {
    result.pageMarginsPt = {
      top: Math.round((mt ?? 1) * 72),
      right: Math.round((mr ?? 1) * 72),
      bottom: Math.round((mb ?? 1) * 72),
      left: Math.round((ml ?? 1) * 72),
    };
  }

  // fontFamily → defaultFont
  if (typeof obj.fontFamily === 'string' && obj.fontFamily.trim()) {
    result.defaultFont = obj.fontFamily.trim();
  }

  // fontSize → defaultFontSizePt
  const fs = safePositiveNumber(obj.fontSize);
  if (fs != null && fs >= 6 && fs <= 72) result.defaultFontSizePt = fs;

  // lineSpacing stays as lineSpacing
  const ls = safePositiveNumber(obj.lineSpacing);
  if (ls != null && ls >= 0.5 && ls <= 5) result.lineSpacing = ls;

  return Object.keys(result).length > 0 ? result : undefined;
}

// ═══════════════════════════════════════════════════════════════
// Resolve Effective Overrides
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve effective formatting overrides from V2 + legacy fields.
 * Prefers V2 when present, falls back to coerced legacy.
 *
 * @param v2 - Typed V2 overrides from Convex
 * @param legacy - Raw legacy v.any() overrides from Convex
 * @returns Normalized overrides (or undefined if none valid)
 */
export function resolveEffectiveOverrides(
  v2: unknown,
  legacy: unknown,
): { overrides: FormattingOverridesV2 | undefined; source: 'v2' | 'legacy_coerced' | 'none' } {
  // Prefer V2
  if (v2 && isFormattingOverridesV2(v2)) {
    const normalized = normalizeFormattingOverrides(v2);
    if (normalized) {
      return { overrides: normalized, source: 'v2' };
    }
  }

  // Fallback to legacy
  const coerced = coerceLegacyFormattingOverrides(legacy);
  if (coerced) {
    return { overrides: coerced, source: 'legacy_coerced' };
  }

  return { overrides: undefined, source: 'none' };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Safely extract a positive number, or return undefined. */
function safePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}
