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
});
