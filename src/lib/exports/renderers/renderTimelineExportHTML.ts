/**
 * Timeline / Incident Export HTML Renderer
 *
 * Renders timeline summaries and incident reports with two modes:
 * - Visual timeline: vertical line with event cards
 * - Table mode: structured table (for jurisdictions that prefer it)
 *
 * Profile-driven mode selection via `summary.timelineAsTable`.
 */

import type { CanonicalExportDocument, TimelineEventDisplay, TimelineSection } from '../types';
import type { ExportJurisdictionProfile } from '../jurisdiction/types';
import { escapeHtml, renderPageShell } from './shared';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Render a timeline/incident export to HTML.
 *
 * @param doc - CanonicalExportDocument with path='timeline_summary' or 'incident_report'
 * @param profile - Resolved export jurisdiction profile
 * @returns Complete HTML string ready for PDF rendering
 */
export function renderTimelineExportHTML(
  doc: CanonicalExportDocument,
  profile: ExportJurisdictionProfile,
): string {
  // Prefer timelineVisual events, fall back to timeline sections
  const events = doc.timelineVisual?.events ?? extractEventsFromSections(doc);

  const bodyHTML = [
    `<div class="timeline-title">${escapeHtml(doc.title || 'Timeline Export')}</div>`,
    doc.subtitle ? `<div class="timeline-subtitle">${escapeHtml(doc.subtitle)}</div>` : '',
    profile.summary.timelineAsTable
      ? renderTimelineTable(events)
      : renderVisualTimeline(events),
  ]
    .filter(Boolean)
    .join('\n');

  return renderPageShell({
    title: doc.title || 'Timeline Export',
    profile,
    bodyHTML,
    extraCSS: TIMELINE_CSS(profile),
  });
}

// ═══════════════════════════════════════════════════════════════
// Event Extraction
// ═══════════════════════════════════════════════════════════════

function extractEventsFromSections(doc: CanonicalExportDocument): TimelineEventDisplay[] {
  const timelineSections = doc.sections.filter(
    (s): s is TimelineSection => s.kind === 'timeline_section',
  );
  return timelineSections.flatMap((s) => s.events);
}

// ═══════════════════════════════════════════════════════════════
// Visual Timeline Mode
// ═══════════════════════════════════════════════════════════════

function renderVisualTimeline(events: TimelineEventDisplay[]): string {
  if (!events.length) return '<p>No timeline events available.</p>';

  return `
  <div class="timeline-wrapper">
    <div class="timeline-line"></div>
    ${events.map(renderTimelineEventCard).join('')}
  </div>`;
}

function renderTimelineEventCard(event: TimelineEventDisplay): string {
  return `
  <div class="timeline-event">
    <div class="timeline-dot"></div>
    ${event.date ? `<div class="timeline-date">${escapeHtml(event.date)}</div>` : ''}
    <div class="timeline-event-title">${escapeHtml(event.title)}</div>
    ${event.description ? `<div class="timeline-description">${escapeHtml(event.description)}</div>` : ''}
    ${
      event.sourceRefs?.length
        ? `<div class="timeline-sources">Sources: ${event.sourceRefs.map(escapeHtml).join('; ')}</div>`
        : ''
    }
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// Table Mode
// ═══════════════════════════════════════════════════════════════

function renderTimelineTable(events: TimelineEventDisplay[]): string {
  if (!events.length) return '<p>No timeline events available.</p>';

  return `
  <table class="timeline-table">
    <thead>
      <tr>
        <th style="width: 22%">Date</th>
        <th style="width: 26%">Event</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      ${events
        .map(
          (event) => `
        <tr>
          <td>${escapeHtml(event.date || '')}</td>
          <td>${escapeHtml(event.title)}</td>
          <td>${escapeHtml(event.description || '')}</td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

// ═══════════════════════════════════════════════════════════════
// Timeline-Specific CSS
// ═══════════════════════════════════════════════════════════════

function TIMELINE_CSS(profile: ExportJurisdictionProfile): string {
  return `
  .timeline-title {
    text-align: center;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 18pt;
  }
  .timeline-subtitle {
    text-align: center;
    margin-bottom: 20pt;
  }

  .timeline-wrapper {
    position: relative;
    padding-left: 26pt;
  }
  .timeline-line {
    position: absolute;
    top: 0; bottom: 0; left: 10pt;
    width: 1.5pt;
    background: #000;
  }
  .timeline-event {
    position: relative;
    margin: 0 0 18pt 0;
    padding-left: 20pt;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .timeline-dot {
    position: absolute;
    left: 4pt; top: 5pt;
    width: 10pt; height: 10pt;
    border: 1pt solid #000;
    border-radius: 50%;
    background: #fff;
    box-sizing: border-box;
  }
  .timeline-date { font-weight: 700; margin-bottom: 3pt; }
  .timeline-event-title { font-weight: 700; margin-bottom: 2pt; }
  .timeline-description {
    margin-bottom: 2pt;
    text-align: ${profile.typography.bodyAlign};
  }
  .timeline-sources {
    font-size: ${Math.max(9, profile.typography.fontSizePt - 2)}pt;
  }

  .timeline-table { width: 100%; border-collapse: collapse; }
  .timeline-table th, .timeline-table td {
    border: 1pt solid #000;
    padding: 6pt;
    vertical-align: top;
  }
  .timeline-table th {
    text-align: left;
    font-weight: 700;
    text-transform: uppercase;
  }`;
}
