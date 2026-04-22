/**
 * Renderer Dispatch Regression Tests
 *
 * Verifies that renderExportHTML correctly routes each export path
 * to its dedicated renderer and rejects below-minimum HTML.
 */

import { describe, expect, it } from 'vitest';
import { renderExportHTML, MIN_RENDERED_EXPORT_HTML_LENGTH } from '../renderExportHTML';
import type { CanonicalExportDocument } from '../types';
import type { ExportJurisdictionProfile } from '../jurisdiction/types';
import { US_DEFAULT_EXPORT_PROFILE } from '../jurisdiction/profiles/us-default';
import { TX_DEFAULT_EXPORT_PROFILE } from '../jurisdiction/profiles/tx-default';
import { FEDERAL_DEFAULT_EXPORT_PROFILE } from '../jurisdiction/profiles/federal-default';

function makeDoc(overrides: Partial<CanonicalExportDocument>): CanonicalExportDocument {
  return {
    path: 'court_document',
    title: 'TEST DOCUMENT',
    metadata: {},
    sections: [{ kind: 'court_section', id: 'body', heading: 'Facts', paragraphs: ['The facts of the case.'] }],
    ...overrides,
  };
}

describe('renderExportHTML — dispatch', () => {
  it('routes court_document to court renderer', () => {
    const html = renderExportHTML(makeDoc({ path: 'court_document' }), US_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('TEST DOCUMENT');
    expect(html).toContain('The facts of the case.');
  });

  it('routes case_summary to summary renderer', () => {
    const doc = makeDoc({
      path: 'case_summary',
      sections: [{ kind: 'summary_section', id: 's1', heading: 'Overview', paragraphs: ['Summary content.'] }],
    });
    const html = renderExportHTML(doc, US_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('report-title');
    expect(html).toContain('Summary content.');
  });

  it('routes exhibit_document to exhibit renderer', () => {
    const doc = makeDoc({
      path: 'exhibit_document',
      title: 'EXHIBIT PACKET',
      sections: [
        {
          kind: 'exhibit_content',
          id: 'c1',
          exhibitLabel: 'A',
          heading: 'Messages',
          paragraphs: ['Text content.'],
        },
      ],
      exhibitPacket: {
        packetTitle: 'Exhibit Packet',
        organizationMode: 'chronological',
        labelStyle: 'alpha',
      },
    });
    const html = renderExportHTML(doc, TX_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('EXHIBIT PACKET');
    expect(html).toContain('Text content.');
  });

  it('routes timeline_summary to timeline renderer', () => {
    const doc = makeDoc({
      path: 'timeline_summary',
      title: 'TIMELINE',
      sections: [],
      timelineVisual: {
        mode: 'summary',
        title: 'Timeline',
        events: [{ date: '2026-01-01', title: 'Event 1', description: 'Something happened.' }],
      },
    });
    const html = renderExportHTML(doc, FEDERAL_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('TIMELINE');
    // Federal profile uses table mode
    expect(html).toContain('timeline-table');
  });

  it('routes incident_report to timeline renderer', () => {
    const doc = makeDoc({
      path: 'incident_report',
      title: 'INCIDENT REPORT',
      sections: [],
      timelineVisual: {
        mode: 'exhibit',
        title: 'Incidents',
        events: [{ date: '2026-03-01', title: 'Incident 1' }],
      },
    });
    const html = renderExportHTML(doc, US_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('INCIDENT REPORT');
  });

  it('falls back to summary renderer for unknown path', () => {
    const doc = makeDoc({
      path: 'unknown_path' as any,
      sections: [{ kind: 'summary_section', id: 's1', heading: 'Test', paragraphs: ['Content.'] }],
    });
    const html = renderExportHTML(doc, US_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain('report-title');
  });

  it('uses profile typography', () => {
    const html = renderExportHTML(makeDoc({}), TX_DEFAULT_EXPORT_PROFILE);
    expect(html).toContain("'Times New Roman'");
    expect(html).toContain('12pt');
    expect(html).toContain('justify');
  });

  it('exports MIN_RENDERED_EXPORT_HTML_LENGTH constant', () => {
    expect(MIN_RENDERED_EXPORT_HTML_LENGTH).toBe(200);
  });
});
