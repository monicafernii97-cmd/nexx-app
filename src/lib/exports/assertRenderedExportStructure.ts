/**
 * Export HTML Structure Assertions
 *
 * Path-specific structural sanity checks for rendered export HTML.
 * Verifies both shell structure and substantive content exist.
 *
 * Called by the export orchestrator after HTML rendering, before PDF.
 *
 * A document must prove both:
 *   - Shell structure exists (containers, headings)
 *   - Substantive content exists (body text, not just wrappers)
 */

import type { ExportPath } from './types';

/** Minimum content length within structure (prevents empty shells). */
const MIN_SUBSTANTIVE_CONTENT_LENGTH = 50;

/**
 * Assert that rendered HTML contains the expected structural markers
 * for the given export path.
 *
 * @throws Error with descriptive message on failure
 */
export function assertRenderedExportStructure(
  html: string,
  path: ExportPath,
): void {
  const checks = PATH_STRUCTURE_CHECKS[path];
  if (!checks) {
    // Unknown path — skip structural checks (validation handles this)
    return;
  }

  // Strip <style> and <script> blocks to prevent false positives
  // from CSS class names or script text matching structural markers.
  const bodyHtml = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  const missing: string[] = [];

  for (const check of checks.required) {
    if (!bodyHtml.includes(check.marker)) {
      missing.push(check.label);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Export HTML structure invalid for "${path}": missing ${missing.join(', ')}`,
    );
  }

  // Substantive content check — strip tags and check remaining text length
  const textContent = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (textContent.length < MIN_SUBSTANTIVE_CONTENT_LENGTH) {
    throw new Error(
      `Export HTML for "${path}" has only ${textContent.length} chars of text content (minimum ${MIN_SUBSTANTIVE_CONTENT_LENGTH}) — possible empty shell`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Path-Specific Structure Definitions
// ═══════════════════════════════════════════════════════════════

type StructureCheck = {
  required: Array<{ marker: string; label: string }>;
};

const PATH_STRUCTURE_CHECKS: Record<ExportPath, StructureCheck> = {
  court_document: {
    required: [
      { marker: 'court-export', label: 'court export container' },
      { marker: 'report-title', label: 'document title' },
    ],
  },
  case_summary: {
    required: [
      { marker: 'report-title', label: 'summary title' },
      { marker: 'summary-section', label: 'summary body' },
    ],
  },
  exhibit_document: {
    required: [
      { marker: 'exhibit', label: 'exhibit container' },
    ],
  },
  timeline_summary: {
    required: [
      { marker: 'timeline', label: 'timeline container' },
    ],
  },
  incident_report: {
    required: [
      { marker: 'report-title', label: 'incident report title' },
    ],
  },
};
