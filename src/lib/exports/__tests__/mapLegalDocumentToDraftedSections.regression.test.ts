import { describe, expect, it } from 'vitest';
import { mapLegalDocumentToDraftedSections } from '../mapLegalDocumentToDraftedSections';
import type { LegalDocument } from '@/lib/legal-docs/types';

describe('mapLegalDocumentToDraftedSections', () => {
  it('does not duplicate parsed list blocks into section body text', () => {
    const doc = {
      metadata: {},
      caption: null,
      title: { main: 'MOTION', subtitle: '(Pending Final Hearing)' },
      introBlocks: [],
      sections: [
        {
          id: 'background',
          heading: 'I. BACKGROUND',
          level: 'roman',
          blocks: [
            { type: 'paragraph', text: 'Opening paragraph.' },
            { type: 'numbered_paragraph', number: 1, text: 'First numbered item.' },
            { type: 'numbered_list', items: ['Second numbered item.'] },
            { type: 'bullet_list', items: ['First bullet.', 'Second bullet.'] },
          ],
        },
      ],
      prayer: null,
      signature: null,
      certificate: null,
      verification: null,
      rawText: '',
    } satisfies LegalDocument;

    const [section] = mapLegalDocumentToDraftedSections(doc);

    expect(section.body).toBe('Opening paragraph.');
    expect(section.numberedItems).toEqual(['First numbered item.', 'Second numbered item.']);
    expect(section.bulletItems).toEqual(['First bullet.', 'Second bullet.']);
  });

  it('splits parsed alpha subsection markers back into separate drafted sections', () => {
    const doc = {
      metadata: {},
      caption: null,
      title: { main: 'MOTION' },
      introBlocks: [],
      sections: [
        {
          id: 'requested-orders',
          heading: 'III. REQUESTED TEMPORARY ORDERS',
          level: 'roman',
          blocks: [
            { type: 'paragraph', text: 'Petitioner requests temporary orders.' },
            { type: 'paragraph', text: '__ALPHA_HEADING__A. ELECTRONIC COMMUNICATION' },
            { type: 'numbered_paragraph', number: 1, text: 'The parent not in possession shall have reasonable electronic communication.' },
            { type: 'paragraph', text: '__ALPHA_HEADING__B. STRUCTURED WRITTEN CO-PARENT COMMUNICATION' },
            { type: 'numbered_paragraph', number: 1, text: 'Routine co-parent communication shall occur through the application.' },
            { type: 'paragraph', text: '__ALPHA_HEADING__C. DEFINITION OF EMERGENCY COMMUNICATION' },
            { type: 'paragraph', text: 'Emergency communication shall be limited to:' },
            { type: 'bullet_list', items: ['Immediate risk of harm to the child', 'Urgent medical necessity'] },
            { type: 'paragraph', text: '__ALPHA_HEADING__D. MEDICAL COMMUNICATION AND CONDUCT' },
            { type: 'numbered_paragraph', number: 1, text: 'Each parent retains statutory rights to obtain medical information.' },
          ],
        },
      ],
      prayer: null,
      signature: null,
      certificate: null,
      verification: null,
      rawText: '',
    } satisfies LegalDocument;

    const sections = mapLegalDocumentToDraftedSections(doc);

    expect(sections.map((section) => section.sectionId)).toEqual([
      'requested-orders',
      'requested-orders_2',
      'requested-orders_3',
      'requested-orders_4',
      'requested-orders_5',
    ]);
    expect(sections.map((section) => section.heading)).toEqual([
      'III. REQUESTED TEMPORARY ORDERS',
      'A. ELECTRONIC COMMUNICATION',
      'B. STRUCTURED WRITTEN CO-PARENT COMMUNICATION',
      'C. DEFINITION OF EMERGENCY COMMUNICATION',
      'D. MEDICAL COMMUNICATION AND CONDUCT',
    ]);
    expect(sections[1].numberedItems).toEqual([
      'The parent not in possession shall have reasonable electronic communication.',
    ]);
    expect(sections[2].numberedItems).toEqual([
      'Routine co-parent communication shall occur through the application.',
    ]);
    expect(sections[3].body).toBe('Emergency communication shall be limited to:');
    expect(sections[3].bulletItems).toEqual([
      'Immediate risk of harm to the child',
      'Urgent medical necessity',
    ]);
    expect(sections[4].numberedItems).toEqual([
      'Each parent retains statutory rights to obtain medical information.',
    ]);
  });
});
