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
    title: 'MOTION TO MODIFY',
    metadata: {
      causeNumber: '2024-12345',
    },
    caption: {
      style: 'texas_pleading' as const,
      causeLine: 'CAUSE NO. 2024-12345',
      leftLines: ['IN THE INTEREST OF', 'J.D., A CHILD'],
      centerLines: ['§', '§', '§'],
      rightLines: ['IN THE DISTRICT COURT', 'HARRIS COUNTY, TEXAS'],
    },
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

    it('warns on missing title for non-court paths', () => {
      const result = validateExportDocument(makeDoc({
        path: 'case_summary',
        title: '',
        sections: [{ kind: 'summary_section', id: 'body', heading: 'Summary', paragraphs: ['text'] }],
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
        metadata: { causeNumber: '2024-12345', jurisdiction: {} },
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.issues.find(i => i.id === 'court_missing_state')?.severity).toBe('warning');
    });

    it('blocks on missing title', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        title: '',
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_missing_title')?.severity).toBe('blocker');
    });

    it('blocks on generic/forbidden title', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        title: 'COURT FILING DOCUMENT',
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_generic_title')?.severity).toBe('blocker');
    });

    it('blocks on missing caption', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        caption: undefined,
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_missing_caption')?.severity).toBe('blocker');
    });

    it('blocks on missing cause number', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        metadata: { causeNumber: '' },
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['text'] }],
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_missing_cause_number')?.severity).toBe('blocker');
    });

    it('blocks on placeholder in content', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['The child [CHILD NAME] was...'] }],
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_placeholder_detected')?.severity).toBe('blocker');
    });

    it('blocks on internal value leak', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        sections: [{ kind: 'court_section', id: 'body', paragraphs: ['The value is undefined here'] }],
      }));
      expect(result.canProceed).toBe(false);
      expect(result.issues.find(i => i.id === 'court_internal_value_leak')?.severity).toBe('blocker');
    });

    it('passes with valid court document', () => {
      const result = validateExportDocument(makeDoc({
        path: 'court_document',
        title: 'MOTION TO MODIFY',
        metadata: {
          causeNumber: '2024-12345',
          jurisdiction: { state: 'Texas', county: 'Harris' },
        },
        caption: {
          style: 'texas_pleading' as const,
          causeLine: 'CAUSE NO. 2024-12345',
          leftLines: ['IN THE INTEREST OF', 'J.D., A CHILD'],
          centerLines: ['§', '§', '§'],
          rightLines: ['IN THE DISTRICT COURT', 'HARRIS COUNTY, TEXAS'],
        },
        sections: [{ kind: 'court_section', id: 'body', heading: 'Facts', paragraphs: ['The parties were married.'] }],
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
