import { describe, expect, it } from 'vitest';
import {
  normalizeLegalInput,
  parseLegalDocumentStructure,
} from '../pipeline/prepareLegalDocument';

describe('legal document pipeline inline emphasis', () => {
  it('adds bold runs for the court salutation and COMES NOW intro', () => {
    const normalized = normalizeLegalInput(`
TO THE HONORABLE JUDGE OF SAID COURT:

COMES NOW Monica Fernandez, Petitioner, appearing pro se, and files this Motion.

I. BACKGROUND
1. Facts.
`);

    const parsed = parseLegalDocumentStructure(normalized.cleanedText);

    expect(parsed.introBlocks[0]).toMatchObject({
      type: 'paragraph',
      text: 'TO THE HONORABLE JUDGE OF SAID COURT:',
      runs: [{ text: 'TO THE HONORABLE JUDGE OF SAID COURT:', bold: true }],
    });
    expect(parsed.introBlocks[1]).toMatchObject({
      type: 'paragraph',
      runs: [
        { text: 'COMES NOW', bold: true },
        { text: expect.stringContaining('Monica Fernandez') },
      ],
    });
  });

  it('adds bold runs for WHEREFORE prayer intro language', () => {
    const normalized = normalizeLegalInput(`
I. BACKGROUND
1. Facts.

PRAYER

WHEREFORE, PREMISES CONSIDERED, Petitioner respectfully requests relief.
1. Grant relief.
`);

    const parsed = parseLegalDocumentStructure(normalized.cleanedText);

    expect(parsed.prayer?.introRuns).toEqual([
      { text: 'WHEREFORE, PREMISES CONSIDERED,', bold: true },
      { text: ' Petitioner respectfully requests relief.' },
    ]);
  });
});
