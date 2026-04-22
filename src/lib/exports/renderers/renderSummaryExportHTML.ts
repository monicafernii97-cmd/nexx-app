/**
 * Summary Export HTML Renderer
 *
 * Renders case summaries, workspace summaries, and report-style exports.
 * Uses report layout (NOT pleading layout): title, overview, sections,
 * bullet lists, timeline summary, evidence overview, next steps.
 */

import type { CanonicalExportDocument, SummarySection } from '../types';
import type { ExportJurisdictionProfile } from '../jurisdiction/types';
import { escapeHtml, renderPageShell } from './shared';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Render a case summary export to HTML.
 *
 * @param doc - CanonicalExportDocument with path='case_summary'
 * @param profile - Resolved export jurisdiction profile
 * @returns Complete HTML string ready for PDF rendering
 */
export function renderSummaryExportHTML(
  doc: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  const summarySections = doc.sections.filter(
    (s): s is SummarySection => s.kind === 'summary_section',
  );

  const bodyHTML = [
    `<div class="report-title">${escapeHtml(doc.title)}</div>`,
    doc.subtitle ? `<div class="report-subtitle">${escapeHtml(doc.subtitle)}</div>` : '',
    renderMetadata(doc),
    summarySections.map((s) => renderSummarySection(s, profile)).join('\n'),
  ]
    .filter(Boolean)
    .join('\n');

  return renderPageShell({
    title: doc.title,
    profile,
    bodyHTML,
    extraCSS: SUMMARY_CSS,
  });
}

// ═══════════════════════════════════════════════════════════════
// Metadata
// ═══════════════════════════════════════════════════════════════

function renderMetadata(doc: CanonicalExportDocument): string {
  const parts: string[] = [];

  if (doc.metadata.causeNumber) {
    parts.push(`<div class="meta-line">Cause No. ${escapeHtml(doc.metadata.causeNumber)}</div>`);
  }
  if (doc.metadata.jurisdiction?.state || doc.metadata.jurisdiction?.county) {
    const loc = [doc.metadata.jurisdiction.county, doc.metadata.jurisdiction.state]
      .filter(Boolean)
      .join(', ');
    parts.push(`<div class="meta-line">${escapeHtml(loc)}</div>`);
  }

  if (!parts.length) return '';
  return `<div class="meta-block">${parts.join('\n')}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// Summary Sections
// ═══════════════════════════════════════════════════════════════

function renderSummarySection(
  section: SummarySection,
  profile: ExportJurisdictionProfile,
): string {
  const headingStyle = profile.typography.uppercaseHeadings
    ? 'text-transform: uppercase;'
    : '';

  const heading = `<div class="summary-heading" style="${headingStyle}">${escapeHtml(section.heading)}</div>`;

  const paragraphs = (section.paragraphs ?? [])
    .map((p) => `<p class="summary-paragraph">${escapeHtml(p)}</p>`)
    .join('\n');

  const bullets = (section.bulletItems ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n');
  const bulletBlock = bullets ? `<ul class="summary-bullets">${bullets}</ul>` : '';

  return `${heading}\n${paragraphs}\n${bulletBlock}`;
}

// ═══════════════════════════════════════════════════════════════
// Summary-Specific CSS
// ═══════════════════════════════════════════════════════════════

const SUMMARY_CSS = `
  .report-title {
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 14pt;
    margin-bottom: 6pt;
  }

  .report-subtitle {
    text-align: center;
    margin-bottom: 12pt;
  }

  .meta-block {
    text-align: center;
    margin-bottom: 18pt;
  }
  .meta-line { margin-bottom: 3pt; }

  .summary-heading {
    font-weight: 700;
    margin: 16pt 0 6pt;
  }

  .summary-paragraph { margin-bottom: 10pt; }

  .summary-bullets {
    margin: 6pt 0 12pt 24pt;
    padding-left: 0;
  }
  .summary-bullets li { margin-bottom: 6pt; }
`;
