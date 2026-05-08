import { describe, expect, it } from 'vitest';
import {
  extractCourtMetadataFromText,
  extractSapcrChildNameRobust,
} from '../extractCourtMetadataFromText';
import { resolveCourtIdentity } from '../resolveCourtIdentity';

const REAL_SECTION_SYMBOL_TWO_COLUMN_CAPTION = [
  'CAUSE NO. 20-DCV-271717',
  '',
  `IN THE INTEREST OF \u00A7 IN THE DISTRICT COURT`,
  '\u00A7',
  `AMELIA SOFIA FERNANDEZ PUGLIESE, \u00A7 387TH JUDICIAL DISTRICT`,
  '\u00A7',
  `A CHILD \u00A7 FORT BEND COUNTY, TEXAS`,
].join('\n');

function buildExtractedFromText(pastedText: string): Record<string, string | undefined> {
  const extracted = extractCourtMetadataFromText(pastedText);
  const flat: Record<string, string | undefined> = {};

  for (const [key, field] of Object.entries(extracted)) {
    if (field && typeof field === 'object' && 'value' in field) {
      flat[key] = field.value;
    }
  }

  return flat;
}

describe('SAPCR real section-symbol extraction', () => {
  it('extracts the child name from a Texas two-column caption with real section symbols', () => {
    expect(extractSapcrChildNameRobust(REAL_SECTION_SYMBOL_TWO_COLUMN_CAPTION)).toBe(
      'AMELIA SOFIA FERNANDEZ PUGLIESE',
    );
  });

  it('does not mistake court text for the SAPCR child name', () => {
    const extracted = extractCourtMetadataFromText(REAL_SECTION_SYMBOL_TWO_COLUMN_CAPTION);

    expect(extracted.childrenNames?.value).toBe('AMELIA SOFIA FERNANDEZ PUGLIESE');
    expect(extracted.childrenNames?.value).not.toBe('IN THE DISTRICT COURT');
  });

  it('hands the extracted child name into court identity resolution', () => {
    const identity = resolveCourtIdentity({
      extractedFromText: buildExtractedFromText(REAL_SECTION_SYMBOL_TWO_COLUMN_CAPTION),
      draftTitle: 'Motion for Temporary Orders',
      draftDocumentKind: 'motion',
    });

    expect(identity.caseTitleFormat).toBe('in_interest_of');
    expect(identity.childrenNames).toEqual(['AMELIA SOFIA FERNANDEZ PUGLIESE']);
  });
});
