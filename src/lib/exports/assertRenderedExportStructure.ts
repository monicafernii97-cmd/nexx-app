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
 * Uses JSDOM for reliable DOM-based assertions — loaded dynamically
 * to avoid ESM/CJS crashes on Vercel serverless (jsdom's dependency
 * chain includes ESM-only packages that fail when externalized).
 * Falls back to regex checks if jsdom is unavailable.
 */

import type { ExportPath } from './types';

/** Minimum content length within structure (prevents empty shells). */
const MIN_SUBSTANTIVE_CONTENT_LENGTH = 50;

/**
 * Assert that rendered HTML contains the expected structural markers
 * for the given export path. Uses DOM queries for reliable matching.
 * Falls back to regex-based checks if jsdom is unavailable.
 *
 * @throws Error with descriptive message on failure
 */
export async function assertRenderedExportStructure(
  html: string,
  path: ExportPath,
): Promise<void> {
  const checks = PATH_STRUCTURE_CHECKS[path];
  if (!checks) {
    throw new Error(`Unsupported export path for structure assertion: "${path}"`);
  }

  try {
    // Dynamic import to avoid pulling jsdom into the module graph at load time.
    const { JSDOM } = await import('jsdom');

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
  } catch (err) {
    // If jsdom itself failed to load (ESM compat), fall back to regex checks
    if (err instanceof Error && err.message.includes('ERR_REQUIRE_ESM')) {
      console.warn('[assertRenderedExportStructure] jsdom unavailable, using regex fallback');
      assertWithRegexFallback(html, path, checks);
      return;
    }
    // Re-throw structural assertion errors
    throw err;
  }
}

/** Regex fallback when jsdom is unavailable on Vercel. */
function assertWithRegexFallback(
  html: string,
  path: ExportPath,
  checks: StructureCheck,
): void {
  const missing: string[] = [];
  for (const check of checks.required) {
    // Convert CSS selectors to simple class/tag regex patterns
    const patterns = check.selector.split(',').map(s => s.trim());
    const found = patterns.some(pat => {
      const classMatch = pat.match(/\.([a-z0-9_-]+)/i);
      const tagMatch = pat.match(/^([a-z1-6]+)/i);
      if (classMatch) return html.includes(`class="${classMatch[1]}"`) || html.includes(`class~="${classMatch[1]}"`);
      if (tagMatch) return new RegExp(`<${tagMatch[1]}[\\s>]`, 'i').test(html);
      return false;
    });
    if (!found) missing.push(check.label);
  }
  if (missing.length > 0) {
    throw new Error(
      `Export HTML structure invalid for "${path}" (regex fallback): missing ${missing.join(', ')}`,
    );
  }
  // Substantive content: strip tags, measure text
  const textOnly = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (textOnly.length < MIN_SUBSTANTIVE_CONTENT_LENGTH) {
    throw new Error(
      `Export HTML for "${path}" has only ${textOnly.length} chars of text content (minimum ${MIN_SUBSTANTIVE_CONTENT_LENGTH}) — possible empty shell`,
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
      { selector: '.caption-block, .caption-table, .rule', label: 'court export container' },
      { selector: '.title, h1, [class~="report-title"]', label: 'document title' },
    ],
  },
  case_summary: {
    required: [
      { selector: '.report-title, h1, .title', label: 'summary title' },
      { selector: '.summary-heading, .summary-paragraph, .summary-bullets, section', label: 'summary body' },
    ],
  },
  exhibit_document: {
    required: [
      { selector: '.exhibit-content-page, .exhibit-cover-page, .exhibit-index-page, [data-exhibit]', label: 'exhibit container' },
    ],
  },
  timeline_summary: {
    required: [
      { selector: '.timeline-wrapper, .timeline-event, .timeline-table, [data-timeline]', label: 'timeline container' },
    ],
  },
  incident_report: {
    required: [
      { selector: '.report-title, .title, .timeline-title, h1', label: 'incident report title' },
    ],
  },
};
