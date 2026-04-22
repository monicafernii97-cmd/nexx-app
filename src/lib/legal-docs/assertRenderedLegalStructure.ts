/**
 * Rendered Legal Structure Assertion
 *
 * Lightweight sanity check that rendered HTML contains expected
 * structural markers — catches "empty shell" PDFs where the
 * HTML wrapper renders but the body content is missing.
 *
 * Checks for CSS class markers that the legal renderer
 * (`renderLegalDocumentHTML`) always emits.
 */

// ═══════════════════════════════════════════════════════════════
// Structural Markers
// ═══════════════════════════════════════════════════════════════

/**
 * Minimum structural markers expected in rendered legal HTML.
 *
 * These correspond to CSS classes emitted by
 * `renderLegalDocumentHTML()` in all rendering paths.
 */
const STRUCTURE_CHECKS = [
  { marker: /class="title-main"/i, label: 'title block' },
  {
    marker: /class="(?:body-paragraph|numbered-list|bullet-list|lettered-list|section-heading)"/i,
    label: 'body content',
  },
] as const;

// ═══════════════════════════════════════════════════════════════
// Assertion
// ═══════════════════════════════════════════════════════════════

/**
 * Check that rendered HTML contains expected legal document
 * structural markers.
 *
 * @param html - Rendered HTML string
 * @returns List of missing markers (empty = pass)
 */
export function checkRenderedLegalStructure(html: string): string[] {
  const missing: string[] = [];

  for (const check of STRUCTURE_CHECKS) {
    if (!check.marker.test(html)) {
      missing.push(check.label);
    }
  }

  return missing;
}
