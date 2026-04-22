/**
 * Export HTML Renderer — Master Dispatcher
 *
 * Routes a CanonicalExportDocument to the correct path-specific renderer.
 * This is the ONLY function the export pipeline calls to produce HTML.
 * Renderers never receive raw drafted content — only canonical documents.
 */

import type { CanonicalExportDocument } from './types';
import type { ExportJurisdictionProfile } from './jurisdiction/types';
import { renderCourtExportHTML } from './renderers/renderCourtExportHTML';
import { renderSummaryExportHTML } from './renderers/renderSummaryExportHTML';
import { renderExhibitPacketHTML } from './renderers/renderExhibitPacketHTML';
import { renderTimelineExportHTML } from './renderers/renderTimelineExportHTML';

/** Minimum HTML length for a valid rendered export document. */
export const MIN_RENDERED_EXPORT_HTML_LENGTH = 200;

/**
 * Render a CanonicalExportDocument to HTML using path-specific renderers.
 *
 * @param doc - The canonical export document (ONLY input to renderers)
 * @param profile - Resolved export jurisdiction profile
 * @returns Complete HTML string ready for PDF rendering
 * @throws If rendered HTML is below minimum length threshold
 */
export function renderExportHTML(
  doc: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  let html: string;

  switch (doc.path) {
    case 'court_document':
      html = renderCourtExportHTML(doc, profile);
      break;

    case 'case_summary':
      html = renderSummaryExportHTML(doc, profile);
      break;

    case 'exhibit_document':
      html = renderExhibitPacketHTML(doc, profile);
      break;

    case 'timeline_summary':
    case 'incident_report':
      html = renderTimelineExportHTML(doc, profile);
      break;

    default:
      // Unknown path — use summary as safest fallback
      html = renderSummaryExportHTML(doc, profile);
      break;
  }

  // Validate rendered HTML length
  if (html.length < MIN_RENDERED_EXPORT_HTML_LENGTH) {
    throw new Error(
      `Rendered HTML too short (${html.length} chars). Minimum: ${MIN_RENDERED_EXPORT_HTML_LENGTH}. ` +
      `Export path: ${doc.path}, sections: ${doc.sections.length}`,
    );
  }

  return html;
}
