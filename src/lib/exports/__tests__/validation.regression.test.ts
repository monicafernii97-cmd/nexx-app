/**
 * Export Validation Regression Tests
 *
 * Verifies blocker/warning detection per export path.
 */

import { describe, expect, it } from 'vitest';
import { validateExportDocument } from '../validateExportDocument';
import type { CanonicalExportDocument } from '../types';

function makeDoc(overrides: Partial<CanonicalExportDocument>): CanonicalExportDocument {
  return {
    path: 'court_document',
    title: 'TEST DOCUMENT',
    metadata: {},
    sections: [],
    ...overrides,
  };
}

describe('validateExportDocument', () => {
  describe('common checks', () => {
    it('blocks on empty sections', () => {
      const result = validateExportDocument(makeDoc({ sections: [] }));
      expect(result.canProceed).toBe(false);
      expect(result.blockerCount).toBeGreaterThan(0);
      expect(result.issues.find(i => i.id === 'no_sections')?.severity).toBe('blocker');
    });

    it('warns on missing title', () => {
      const result = validateExportDocument(makeDoc({
        title: '',
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.canProceed).toBe(true);
      expect(result.issues.find(i => i.id === 'missing_title')?.severity).toBe('warning');
    });
  });

  describe('court_document', () => {
    it('blocks on no court_section sections', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        sections: [{ kind: 'summary_section', id: 'wrong', heading: 'Summary', paragraphs: ['text'] }],
      }));
      // Has sections (not empty), but no court_section → blocker
      expect(result.issues.find(i => i.id === 'court_no_body_sections')?.severity).toBe('blocker');
    });

    it('warns on missing state jurisdiction', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        metadata: { jurisdiction: {} },
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'court_missing_state')?.severity).toBe('warning');
    });

    it('passes with valid court document', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        metadata: { jurisdiction: { state: 'Texas', county: 'Harris' } },
        sections: [{ kind: 'court_section', id: 'body', heading: 'Facts', paragraphs: ['text'] }],
      }));
      expect(result.canProceed).toBe(true);
      expect(result.blockerCount).toBe(0);
    });
  });

  describe('exhibit_document', () => {
    it('blocks on no exhibit content', () => {
      const result = validateExportDocument(makeDoc({
        path: 'exhibit_document',
        sections: [{ kind: 'exhibit_index', id: 'idx', heading: 'Index', entries: [] }],
      }));
      expect(result.issues.find(i => i.id === 'exhibit_no_content')?.severity).toBe('blocker');
    });

    it('warns on missing packet config', () => {
      const result = validateExportDocument(makeDoc({
        path: 'exhibit_document',
        sections: [{ kind: 'exhibit_content', id: 'c1', exhibitLabel: 'A', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'exhibit_no_packet_config')?.severity).toBe('warning');
    });
  });

  describe('case_summary', () => {
    it('warns on no summary sections', () => {
      const result = validateExportDocument(makeDoc({
        path: 'case_summary',
        sections: [{ kind: 'court_section', id: 'wrong', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'summary_no_sections')?.severity).toBe('warning');
    });
  });

  describe('timeline_summary', () => {
    it('warns on no timeline events when sections have wrong kind', () => {
      const result = validateExportDocument(makeDoc({
        path: 'timeline_summary',
        sections: [{ kind: 'court_section', id: 'wrong', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'timeline_no_events')?.severity).toBe('warning');
    });

    it('does not warn when summary_section narrative content exists', () => {
      const result = validateExportDocument(makeDoc({
        path: 'timeline_summary',
        sections: [{ kind: 'summary_section', id: 's', heading: 'Summary', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'timeline_no_events')).toBeUndefined();
    });
  });
});
