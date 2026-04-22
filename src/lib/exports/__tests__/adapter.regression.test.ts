/**
 * Adapter Regression Tests
 *
 * Verifies that adaptDraftedToCanonicalExport correctly routes
 * drafted sections to path-specific structural mappers.
 */

import { describe, expect, it } from 'vitest';
import {
  adaptDraftedToCanonicalExport,
  type AdaptToCanonicalParams,
} from '../adaptDraftedToCanonicalExport';

describe('adaptDraftedToCanonicalExport', () => {
  const baseDrafted = [
    { sectionId: 'intro', heading: 'Introduction', body: 'First para.\n\nSecond para.' },
    { sectionId: 'facts', heading: 'Facts', body: 'The facts.', numberedItems: ['item 1', 'item 2'] },
  ];

  it('maps court_document sections to kind=court_section', () => {
    const params: AdaptToCanonicalParams = {
      path: 'court_document',
      title: 'MOTION',
      draftedSections: baseDrafted,
    };

    const doc = adaptDraftedToCanonicalExport(params);
    expect(doc.path).toBe('court_document');
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].kind).toBe('court_section');
    expect(doc.sections[1].kind).toBe('court_section');
  });

  it('maps case_summary sections to kind=summary_section', () => {
    const params: AdaptToCanonicalParams = {
      path: 'case_summary',
      title: 'Summary',
      draftedSections: baseDrafted,
    };

    const doc = adaptDraftedToCanonicalExport(params);
    expect(doc.path).toBe('case_summary');
    expect(doc.sections[0].kind).toBe('summary_section');
  });

  it('maps exhibit_document sections with mapped sections', () => {
    const params: AdaptToCanonicalParams = {
      path: 'exhibit_document',
      title: 'Exhibits',
      draftedSections: [
        { sectionId: 'document_body', heading: 'Exhibit Content', body: 'Text content here.' },
      ],
      exhibitMappedSections: {
        generatedAt: new Date().toISOString(),
        indexEntries: [
          { label: 'A', title: 'Messages', date: '2026-03', source: 'app', linkedEvidenceId: '1', linkedNodeIds: [], issueTags: [] },
        ],
        groupedExhibits: [],
        coverSheetSummaries: [
          { label: 'A', heading: 'EXHIBIT A', summary: 'AI-drafted cover summary.', supportingIssues: ['Custody'] },
        ],
        supportingNodeIds: [],
      },
    };

    const doc = adaptDraftedToCanonicalExport(params);
    expect(doc.path).toBe('exhibit_document');

    const indexSections = doc.sections.filter(s => s.kind === 'exhibit_index');
    expect(indexSections).toHaveLength(1);

    const coverSections = doc.sections.filter(s => s.kind === 'exhibit_cover');
    expect(coverSections).toHaveLength(1);
    expect(coverSections[0].kind === 'exhibit_cover' && coverSections[0].summaryLines[0]).toBe('AI-drafted cover summary.');
  });

  it('preserves metadata fields', () => {
    const params: AdaptToCanonicalParams = {
      path: 'court_document',
      title: 'TEST',
      draftedSections: [],
      caseId: 'case-123',
      causeNumber: '2026-CV-001',
      jurisdiction: { state: 'Texas', county: 'Harris' },
    };

    const doc = adaptDraftedToCanonicalExport(params);
    expect(doc.metadata.caseId).toBe('case-123');
    expect(doc.metadata.causeNumber).toBe('2026-CV-001');
    expect(doc.metadata.jurisdiction?.state).toBe('Texas');
  });

  it('preserves signature and certificate blocks', () => {
    const params: AdaptToCanonicalParams = {
      path: 'court_document',
      title: 'TEST',
      draftedSections: [{ sectionId: 'body', heading: 'Body', body: 'Content.' }],
      signature: { intro: 'Respectfully,', signerLines: ['Jane Doe'] },
      certificate: { heading: 'CERTIFICATE', bodyLines: ['Cert body.'], signerLines: ['Jane'] },
    };

    const doc = adaptDraftedToCanonicalExport(params);
    expect(doc.signature?.intro).toBe('Respectfully,');
    expect(doc.certificate?.heading).toBe('CERTIFICATE');
  });

  it('splits double-newline paragraphs in body text', () => {
    const params: AdaptToCanonicalParams = {
      path: 'court_document',
      title: 'TEST',
      draftedSections: [
        { sectionId: 'body', heading: 'Body', body: 'Para one.\n\nPara two.\n\nPara three.' },
      ],
    };

    const doc = adaptDraftedToCanonicalExport(params);
    const section = doc.sections[0];
    if (section.kind === 'court_section') {
      expect(section.paragraphs).toHaveLength(3);
      expect(section.paragraphs?.[0]).toBe('Para one.');
    }
  });

  it('handles timeline_summary and incident_report paths', () => {
    for (const path of ['timeline_summary', 'incident_report'] as const) {
      const params: AdaptToCanonicalParams = {
        path,
        title: 'Timeline',
        draftedSections: [{ sectionId: 'timeline', heading: 'Events', body: 'Events listed.' }],
      };

      const doc = adaptDraftedToCanonicalExport(params);
      expect(doc.path).toBe(path);
      // Timeline sections are mapped as summary_section in the base adapter
      expect(doc.sections[0].kind).toBe('summary_section');
    }
  });
});
