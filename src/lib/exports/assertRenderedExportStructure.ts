/**
 * Export HTML Structure Assertions
 *
 * Path-specific structural sanity checks for rendered export HTML.
 * Verifies both shell structure and substantive content exist.
 *
 * Called by the export orchestrator after HTML rendering, before PDF.
 *
 * A document must prove both:
 *   - Shell structure exists (containers, headings via DOM queries)
 *   - Substantive content exists (body text, not just wrappers)
 *
 * Uses JSDOM for reliable DOM-based assertions — prevents false
 * positives from CSS class names in <style> blocks or HTML comments.
 */

import { JSDOM } from 'jsdom';
import type { ExportPath } from './types';

/** Minimum content length within structure (prevents empty shells). */
const MIN_SUBSTANTIVE_CONTENT_LENGTH = 50;

/**
 * Assert that rendered HTML contains the expected structural markers
 * for the given export path. Uses DOM queries for reliable matching.
 *
 * @throws Error with descriptive message on failure
 */
export function assertRenderedExportStructure(
  html: string,
  path: ExportPath,
): void {
  const checks = PATH_STRUCTURE_CHECKS[path];
  if (!checks) {
    throw new Error(`Unsupported export path for structure assertion: "${path}"`);
  }

  // Parse HTML into DOM for reliable structural queries.
  // This prevents false positives from CSS selectors in <style> blocks
  // or attribute values matching structural marker strings.
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const missing: string[] = [];

  for (const check of checks.required) {
    if (!document.querySelector(check.selector)) {
      missing.push(check.label);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Export HTML structure invalid for "${path}": missing ${missing.join(', ')}`,
    );
  }

  // Substantive content check — remove <style> and <script> nodes
  // from the DOM, then measure remaining text content.
  document.querySelectorAll('style, script').forEach((el) => el.remove());
  const textContent = (document.body?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (textContent.length < MIN_SUBSTANTIVE_CONTENT_LENGTH) {
    throw new Error(
      `Export HTML for "${path}" has only ${textContent.length} chars of text content (minimum ${MIN_SUBSTANTIVE_CONTENT_LENGTH}) — possible empty shell`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Path-Specific Structure Definitions
// ═══════════════════════════════════════════════════════════════

/** A single structural check — CSS selector + human-readable label. */
type StructureCheck = {
  required: Array<{ selector: string; label: string }>;
};

/**
 * Path-specific DOM selectors that must be present in rendered HTML.
 * Selectors match class names, IDs, or data attributes on actual elements.
 */
const PATH_STRUCTURE_CHECKS: Record<ExportPath, StructureCheck> = {
  court_document: {
    required: [
      { selector: '[class*="court-export"], .court-export, #court-export', label: 'court export container' },
      { selector: '[class*="report-title"], .report-title, h1', label: 'document title' },
    ],
  },
  case_summary: {
    required: [
      { selector: '[class*="report-title"], .report-title, h1', label: 'summary title' },
      { selector: '[class*="summary-section"], .summary-section, section', label: 'summary body' },
    ],
  },
  exhibit_document: {
    required: [
      { selector: '[class*="exhibit"], .exhibit, [data-exhibit]', label: 'exhibit container' },
    ],
  },
  timeline_summary: {
    required: [
      { selector: '[class*="timeline"], .timeline, [data-timeline]', label: 'timeline container' },
    ],
  },
  incident_report: {
    required: [
      { selector: '[class*="report-title"], .report-title, h1', label: 'incident report title' },
    ],
  },
};
