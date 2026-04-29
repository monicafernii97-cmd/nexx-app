/**
 * Shared Renderer Primitives
 *
 * Base layout, typography, page shell, HTML escaping, and helpers
 * shared across ALL export renderers. No duplicated layout logic.
 */

import type { ExportJurisdictionProfile } from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Page Shell
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap body HTML in a complete HTML document with page layout,
 * typography, and shared CSS from the jurisdiction profile.
 */
export function renderPageShell(params: {
  title: string;
  profile: ExportJurisdictionProfile;
  bodyHTML: string;
  extraCSS?: string;
}): string {
  const { title, profile, bodyHTML, extraCSS } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: ${pageSize(profile)};
    margin: ${profile.page.marginsPt.top}pt ${profile.page.marginsPt.right}pt ${profile.page.marginsPt.bottom}pt ${profile.page.marginsPt.left}pt;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-family: ${profile.typography.fontFamily};
    font-size: ${profile.typography.fontSizePt}pt;
    line-height: ${profile.typography.lineHeightPt}pt;
    color: #000;
    text-align: ${profile.typography.bodyAlign};
  }

  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  ${extraCSS || ''}
</style>
</head>
<body>
  <div class="document">
    ${bodyHTML}
  </div>
</body>
</html>`.trim();
}

// ═══════════════════════════════════════════════════════════════
// HTML Escaping
// ═══════════════════════════════════════════════════════════════

/** Shared escaping implementation — all XSS-relevant characters. */
function escapeCommon(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape HTML special characters in text content. */
export function escapeHtml(input: string): string {
  return escapeCommon(input);
}

/** Escape HTML attribute values (all XSS-relevant characters). */
export function escapeAttribute(input: string): string {
  return escapeCommon(input);
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Convert profile page size to CSS @page size value. */
function pageSize(profile: ExportJurisdictionProfile): string {
  switch (profile.page.size) {
    case 'Letter':
      return '8.5in 11in';
    case 'Legal':
      return '8.5in 14in';
    case 'A4':
      return '210mm 297mm';
    default:
      return '8.5in 11in';
  }
}
