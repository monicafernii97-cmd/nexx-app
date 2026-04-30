/**
 * Unit tests for splitPastedContent.
 *
 * Verifies the parser → paragraph fallback chain and
 * the structure of review items produced for the Review Hub.
 */

import { describe, it, expect } from 'vitest';
import { splitPastedContent } from '../services/splitPastedContent';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STRUCTURED_MOTION = `
CAUSE NO. 20-DCV-271717

IN THE 387TH JUDICIAL DISTRICT
FORT BEND COUNTY, TEXAS

IN THE INTEREST OF
J.D.F., A CHILD

MOTION TO MODIFY PARENT-CHILD RELATIONSHIP

TO THE HONORABLE JUDGE OF SAID COURT:

COMES NOW Monica Fernandez, Petitioner in the above-entitled and numbered cause, and files this Motion to Modify the Parent-Child Relationship.

I. DISCOVERY LEVEL

Discovery in this case is intended to be conducted under Level 2 of Rule 190.3 of the Texas Rules of Civil Procedure.

II. FACTUAL BACKGROUND

On or about January 15, 2020, the parties entered into an agreed final decree. Since that time, material and substantial changes have occurred.

III. REQUESTED MODIFICATIONS

Petitioner requests that the Court modify the current order to reflect the changed circumstances of the parties and the best interest of the child.

PRAYER

Petitioner prays that the Court grant the following relief:
1. Modification of conservatorship
2. Modification of possession schedule
3. Such other relief as the Court deems just

Respectfully submitted,

_________________________
Monica Fernandez
Pro Se Petitioner

CERTIFICATE OF SERVICE

I hereby certify that a true and correct copy of the foregoing document was served upon all parties of record on this date.

_________________________
Monica Fernandez
`;

const UNSTRUCTURED_TEXT = `This is some general text that doesn't follow legal document formatting.

It has multiple paragraphs but no roman numerals, no prayer block, no signature, and no certificate of service.

The parser should fall back to paragraph splitting for this content since it lacks the structure of a legal document.

This paragraph discusses the facts of the case in general terms without any specific legal headings or formatting conventions.`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('splitPastedContent', () => {
  describe('parser strategy (structured documents)', () => {
    it('should detect sections from a structured motion', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      expect(result.strategy).toBe('parser');
      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.meta.totalItems).toBeGreaterThanOrEqual(3);
    });

    it('should detect prayer block', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      expect(result.meta.hasPrayer).toBe(true);
      const prayerItem = result.items.find(i =>
        i.suggestedSections.includes('prayer'),
      );
      expect(prayerItem).toBeDefined();
    });

    it('should detect signature block', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      expect(result.meta.hasSignature).toBe(true);
      const sigItem = result.items.find(i =>
        i.suggestedSections.includes('signature'),
      );
      expect(sigItem).toBeDefined();
    });

    it('should detect certificate of service', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      expect(result.meta.hasCertificate).toBe(true);
      const certItem = result.items.find(i =>
        i.suggestedSections.includes('certificate_of_service'),
      );
      expect(certItem).toBeDefined();
    });

    it('should set all items as included in export', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      for (const item of result.items) {
        expect(item.includedInExport).toBe(true);
      }
    });

    it('should assign unique nodeIds to each item', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      const ids = result.items.map(i => i.nodeId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('paragraph fallback strategy', () => {
    it('should fall back to paragraph splitting for unstructured text', () => {
      const result = splitPastedContent(UNSTRUCTURED_TEXT);

      expect(result.strategy).toBe('paragraph_fallback');
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it('should assign lower confidence to paragraph items', () => {
      const result = splitPastedContent(UNSTRUCTURED_TEXT);

      for (const item of result.items) {
        expect(item.confidence).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = splitPastedContent('');

      expect(result.items).toHaveLength(0);
      expect(result.strategy).toBe('paragraph_fallback');
      expect(result.meta.totalItems).toBe(0);
    });

    it('should handle whitespace-only string', () => {
      const result = splitPastedContent('   \n\n   ');

      expect(result.items).toHaveLength(0);
    });

    it('should return parsedDocument when parser succeeds', () => {
      const result = splitPastedContent(STRUCTURED_MOTION);

      expect(result.parsedDocument).not.toBeNull();
      expect(result.parsedDocument?.sections.length).toBeGreaterThanOrEqual(1);
    });
  });
});
