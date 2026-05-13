/**
 * Export Path Matrix Regression Tests
 *
 * Verifies that every supported export path renders meaningful HTML,
 * passes structure validation, and generates a deterministic filename.
 */

import { describe, it, expect } from 'vitest';
import { renderExportHTML, MIN_RENDERED_EXPORT_HTML_LENGTH } from '../renderExportHTML';
import { assertRenderedExportStructure } from '../assertRenderedExportStructure';
import type { CanonicalExportDocument, ExportPath } from '../types';
import { PROFILE_REGISTRY } from '@/lib/jurisdiction/profiles/registry';
import { assertExportProfile } from '@/lib/jurisdiction/assertProfileForPipeline';
import {
  generateExportDisplayTitle,
  generateExportFilename,
  generateFilenameFromTitle,
} from '../generateExportPDF';

const profile = assertExportProfile(PROFILE_REGISTRY.get('us-default')!);

/** Helper to build a minimal but valid canonical doc for a given path. */
function makeDocForPath(path: ExportPath): CanonicalExportDocument {
  const doc: CanonicalExportDocument = {
    path,
    title: `TEST ${path.toUpperCase()}`,
    metadata: {},
    sections: [
      { kind: 'court_section' as const, id: 'body', heading: 'Summary of Facts', paragraphs: ['The plaintiff alleges that...'] },
    ],
  };

  // case_summary uses summary renderer — needs summary_section kind
  if (path === 'case_summary') {
    doc.sections = [
      { kind: 'summary_section' as const, id: 'sum-1', heading: 'Summary of Facts', paragraphs: ['The plaintiff alleges that the defendant caused significant damages.'] },
    ];
  }

  // Exhibit-specific enrichments
  if (path === 'exhibit_document') {
    doc.sections = [
      {
        kind: 'exhibit_content' as const,
        id: 'ex-1',
        exhibitLabel: 'Exhibit A',
        heading: 'Exhibit A',
        paragraphs: ['Attached hereto is Exhibit A.'],
      },
    ];
  }

  // Timeline-specific enrichments (timeline_summary + incident_report share renderer)
  if (path === 'timeline_summary' || path === 'incident_report') {
    doc.sections = [
      {
        kind: 'timeline_section' as const,
        id: 'tl-1',
        heading: 'Timeline of Events',
        events: [
          { date: '2024-01-15', title: 'Incident Report', description: 'Incident reported to police.' },
        ],
      },
    ];
  }

  return doc;
}

const EXPORT_PATHS: ExportPath[] = [
  'court_document',
  'case_summary',
  'exhibit_document',
  'timeline_summary',
  'incident_report',
];

describe('export path matrix — all 5 paths', () => {
  for (const path of EXPORT_PATHS) {
    describe(`path: ${path}`, () => {
      const doc = makeDocForPath(path);

      it('renders non-empty HTML above minimum length', () => {
        const html = renderExportHTML(doc, profile);
        expect(html.length).toBeGreaterThan(MIN_RENDERED_EXPORT_HTML_LENGTH);
      });

      it('passes structure assertion', () => {
        const html = renderExportHTML(doc, profile);
        expect(() => assertRenderedExportStructure(html, path)).not.toThrow();
      });

      it('generates a valid filename via production helper', () => {
        const filename = generateExportFilename({
          caseType: 'personal_injury',
          exportPath: path,
          runId: 'abc123xyz',
        });
        expect(filename).toMatch(/\.pdf$/);
        expect(filename).toContain('personal_injury');
        expect(filename).toContain(path);
        expect(filename.length).toBeGreaterThan(10);
      });
    });
  }
});

describe('export filename/title generation', () => {
  it('uses title case display titles and clean snake_case filenames without run IDs', () => {
    const displayTitle = generateExportDisplayTitle("PETITIONER'S SECOND AMENDED MOTION FOR TEMPORARY ORDERS");
    expect(displayTitle).toBe("Petitioner's Second Amended Motion For Temporary Orders");
    expect(generateFilenameFromTitle(displayTitle)).toBe('petitioners_second_amended_motion_for_temporary_orders.pdf');

    const filename = generateExportFilename({
      caseType: 'personal_injury',
      exportPath: 'court_document',
      runId: 'abc123xyz',
    });
    expect(filename).toBe('personal_injury_court_document.pdf');
    expect(filename).not.toContain('abc123xyz');
    expect(filename).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Federal profile variant (table-mode timeline)
// ═══════════════════════════════════════════════════════════════

const federalProfile = assertExportProfile(PROFILE_REGISTRY.get('federal-default')!);
const TIMELINE_PATHS: ExportPath[] = ['timeline_summary', 'incident_report'];

describe('export path matrix — federal profile (table-mode)', () => {
  for (const path of TIMELINE_PATHS) {
    describe(`path: ${path} (federal)`, () => {
      const doc = makeDocForPath(path);

      it('renders non-empty HTML with federal profile', () => {
        const html = renderExportHTML(doc, federalProfile);
        expect(html.length).toBeGreaterThan(MIN_RENDERED_EXPORT_HTML_LENGTH);
      });

      it('passes structure assertion with federal profile', () => {
        const html = renderExportHTML(doc, federalProfile);
        expect(() => assertRenderedExportStructure(html, path)).not.toThrow();
      });
    });
  }
});
