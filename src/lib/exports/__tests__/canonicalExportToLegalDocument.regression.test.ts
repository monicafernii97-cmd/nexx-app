import { describe, expect, it } from 'vitest';
import { canonicalExportToLegalDocument } from '../canonicalExportToLegalDocument';
import type { CanonicalExportDocument } from '../types';

describe('canonicalExportToLegalDocument', () => {
  it('prefers parsed intro blocks over generated court boilerplate', () => {
    const doc: CanonicalExportDocument = {
      path: 'court_document',
      title: 'MOTION FOR TEMPORARY ORDERS',
      metadata: {},
      caption: null,
      sections: [
        {
          kind: 'court_section',
          id: 'background',
          heading: 'I. BACKGROUND',
          paragraphs: ['Facts.'],
        },
      ],
      signature: null,
      certificate: null,
      verification: null,
      exhibitPacket: null,
      timelineVisual: null,
    };

    const legalDoc = canonicalExportToLegalDocument(doc, {
      filingPartyName: 'Monica Fernandez',
      filingPartyRole: 'petitioner',
      isProSe: true,
      documentKind: 'motion',
      introBlocks: [
        {
          type: 'paragraph',
          text: 'COMES NOW Monica Fernandez, Petitioner, appearing pro se, and files this Second Amended Motion for Temporary Orders pursuant to Chapter 105 of the Texas Family Code.',
        },
      ],
    });

    expect(legalDoc.introBlocks).toHaveLength(1);
    expect(legalDoc.introBlocks[0]).toMatchObject({
      type: 'paragraph',
      text: expect.stringContaining('pursuant to Chapter 105'),
    });
  });
});
