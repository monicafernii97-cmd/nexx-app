/**
 * SAPCR Caption Handoff — Regression Test
 *
 * Proves the full chain:
 * 1. resolveCourtIdentity extracts childrenNames from pasted text
 * 2. buildExportCaption produces correct SAPCR leftLines
 * 3. assertLegalDocumentIntegrity passes with a populated child name
 *
 * Regression guard for the bug where childrenNames was resolved but
 * never passed to the caption builder, causing integrity failures.
 */

import { describe, expect, it } from 'vitest';
import { resolveCourtIdentity } from '../resolveCourtIdentity';
import { buildExportCaption } from '../buildExportCaption';
import { extractCourtMetadataFromText } from '../extractCourtMetadataFromText';
import { assertLegalDocumentIntegrity } from '@/lib/legal-docs/pipeline/assertLegalDocumentIntegrity';
import type { LegalDocument } from '@/lib/legal-docs/types';

// ═════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════

const PASTED_CAPTION =
  'CAUSE NO. 20-DCV-271717 IN THE INTEREST OF AMELIA SOFIA FERNANDEZ PUGLIESE, A CHILD § § § § § IN THE DISTRICT COURT 387TH JUDICIAL DISTRICT FORT BEND COUNTY, TEXAS';

/** Build extractedFromText the same way ReviewHubContent and the export route do. */
function buildExtractedFromText(pastedText: string): Record<string, string | undefined> {
  const extracted = extractCourtMetadataFromText(pastedText);
  const flat: Record<string, string | undefined> = {};
  const keyMap: Record<string, string> = {
    petitionerName: 'captionPetitionerName',
    respondentName: 'captionRespondentName',
    documentTitle: 'resolvedTitle',
    documentSubtitle: 'resolvedSubtitle',
  };
  for (const [key, field] of Object.entries(extracted)) {
    if (field && typeof field === 'object' && 'value' in field) {
      flat[keyMap[key] ?? key] = field.value;
    }
  }
  return flat;
}

/** Minimal LegalDocument fixture for integrity checks. */
function buildMinimalLegalDoc(
  caption: ReturnType<typeof buildExportCaption>['caption'],
): LegalDocument {
  return {
    metadata: {
      causeNumber: '20-DCV-271717',
      court: 'DISTRICT COURT',
      district: '387TH JUDICIAL DISTRICT',
      county: 'FORT BEND',
      jurisdiction: 'TEXAS',
      documentType: 'motion',
    },
    caption,
    title: { main: 'MOTION TO MODIFY PARENT-CHILD RELATIONSHIP' },
    introBlocks: [],
    sections: [
      {
        id: 'section_1',
        heading: 'BACKGROUND',
        level: 'roman',
        blocks: [{ type: 'paragraph', text: 'Petitioner respectfully shows the Court the following.' }],
      },
    ],
    prayer: {
      heading: 'PRAYER',
      intro: 'WHEREFORE, PREMISES CONSIDERED, Petitioner respectfully requests that the Court grant the requested relief.',
      requests: ['Grant the requested modification.'],
    },
    signature: {
      intro: 'Respectfully submitted,',
      signerLines: ['_________________________', 'Monica Fernandez', 'Pro Se'],
    },
    certificate: {
      heading: 'CERTIFICATE OF SERVICE',
      bodyLines: ['I certify that a true and correct copy was served on May 5, 2026.'],
      signerLines: ['Monica Fernandez'],
    },
    rawText: '',
    verification: null,
  };
}

// ═════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════

describe('SAPCR Caption Handoff', () => {
  it('Step 1: resolveCourtIdentity extracts childrenNames from pasted text', () => {
    const extractedFromText = buildExtractedFromText(PASTED_CAPTION);

    const identity = resolveCourtIdentity({
      extractedFromText,
    });

    expect(identity.childrenNames).toBeDefined();
    expect(identity.childrenNames.length).toBeGreaterThan(0);
    expect(identity.childrenNames[0]).toMatch(/AMELIA SOFIA FERNANDEZ PUGLIESE/i);
    expect(identity.caseTitleFormat).toBe('in_interest_of');
  });

  it('Step 2: buildExportCaption produces correct SAPCR leftLines with child name', () => {
    const extractedFromText = buildExtractedFromText(PASTED_CAPTION);
    const identity = resolveCourtIdentity({ extractedFromText });

    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: identity.causeNumber,
      courtName: identity.courtName,
      judicialDistrict: identity.judicialDistrict,
      captionPetitionerName: identity.captionPetitionerName,
      captionRespondentName: identity.captionRespondentName,
      childrenNames: identity.childrenNames,
      state: identity.state,
      county: identity.county,
      caseType: identity.caseType,
      caseTitleFormat: identity.caseTitleFormat,
    });

    // Must be a texas SAPCR caption
    expect(caption.style).toBe('texas_pleading');
    expect(caption.leftLines).toContain('IN THE INTEREST OF');

    // Must include the actual child name (uppercased)
    const childNameLine = caption.leftLines.find(l =>
      /AMELIA SOFIA FERNANDEZ PUGLIESE/i.test(l),
    );
    expect(childNameLine).toBeDefined();

    // Must include child label
    expect(caption.leftLines).toContain('A CHILD');

    // Caption structure: IN THE INTEREST OF, then child name, then label
    const interestIdx = caption.leftLines.indexOf('IN THE INTEREST OF');
    const childIdx = caption.leftLines.findIndex(l =>
      /AMELIA SOFIA FERNANDEZ PUGLIESE/i.test(l),
    );
    const labelIdx = caption.leftLines.indexOf('A CHILD');
    expect(interestIdx).toBeLessThan(childIdx);
    expect(childIdx).toBeLessThan(labelIdx);
  });

  it('Step 3: assertLegalDocumentIntegrity passes with populated child name', () => {
    const extractedFromText = buildExtractedFromText(PASTED_CAPTION);
    const identity = resolveCourtIdentity({ extractedFromText });

    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: identity.causeNumber,
      childrenNames: identity.childrenNames,
      county: identity.county,
      courtName: identity.courtName,
      judicialDistrict: identity.judicialDistrict,
      caseTitleFormat: identity.caseTitleFormat,
    });

    const doc = buildMinimalLegalDoc(caption);

    // Must NOT throw — the child name is present
    expect(() => assertLegalDocumentIntegrity(doc)).not.toThrow();
  });

  it('assertLegalDocumentIntegrity throws when child name is missing', () => {
    // Build a SAPCR caption WITHOUT child names → should fail integrity
    const { caption } = buildExportCaption({
      style: 'texas_pleading',
      causeNumber: '20-DCV-271717',
      childrenNames: [], // empty!
      county: 'Fort Bend',
      caseType: 'sapcr_modification', // forces SAPCR
    });

    const doc = buildMinimalLegalDoc(caption);

    expect(() => assertLegalDocumentIntegrity(doc)).toThrow(
      /SAPCR caption is missing child name/,
    );
  });
});
