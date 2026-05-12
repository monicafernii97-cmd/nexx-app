import { describe, expect, it } from 'vitest';
import { extractExhibitMentions, matchExhibitReferences } from '../exhibits/matchExhibitReferences';

describe('exhibit reference matching', () => {
  it('extracts exhibit labels from common references', () => {
    const mentions = extractExhibitMentions('See Exhibit A, Ex. B, and Exhibit 12.');

    expect(mentions.map(mention => mention.normalizedLabel)).toEqual(['A', 'B', '12']);
  });

  it('confirms a clear existing Exhibit Hub match by label', () => {
    const result = matchExhibitReferences('Attached as Exhibit A is the school email chain.', [
      { id: 'pin_1', title: 'Exhibit A - School email chain', content: 'school email chain', source: 'case_pin' },
      { id: 'pin_2', title: 'Exhibit B - Medical receipt', content: 'medical receipt', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].match.exhibit.id).toBe('pin_1');
    expect(result.ambiguous).toHaveLength(0);
  });

  it('matches explicit exhibit references when label is stored canonically', () => {
    const result = matchExhibitReferences('Attached as Exhibit A is the supporting document.', [
      { id: 'pin_1', title: 'School email chain', label: 'A', source: 'case_pin' },
      { id: 'pin_2', title: 'Medical receipt', label: 'B', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].match.exhibit.id).toBe('pin_1');
    expect(result.ambiguous).toHaveLength(0);
  });

  it('keeps dotted title suffixes distinct from filename extensions', () => {
    const result = matchExhibitReferences('The filing references Schedule A.2.', [
      { id: 'pin_1', title: 'Schedule A.1', source: 'case_pin' },
      { id: 'pin_2', title: 'Schedule A.2', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].match.exhibit.id).toBe('pin_2');
    expect(result.ambiguous).toHaveLength(0);
  });

  it('confirms a clear existing Exhibit Hub match by filename', () => {
    const result = matchExhibitReferences('The document relies on school-email-chain.pdf for notice.', [
      { id: 'pin_1', title: 'School email chain', filename: 'school-email-chain.pdf', source: 'case_pin' },
      { id: 'pin_2', title: 'Medical receipt', filename: 'medical-receipt.pdf', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(1);
    expect(result.confirmed[0].match.exhibit.id).toBe('pin_1');
  });

  it('keeps separate mentions that resolve to the same exhibit', () => {
    const result = matchExhibitReferences(
      'Attached as Exhibit A and referenced again as school-email-chain.pdf.',
      [
        { id: 'pin_1', title: 'Exhibit A - School email chain', filename: 'school-email-chain.pdf', source: 'case_pin' },
        { id: 'pin_2', title: 'Exhibit B - Medical receipt', filename: 'medical-receipt.pdf', source: 'case_pin' },
      ],
    );

    expect(result.confirmed).toHaveLength(2);
    expect(result.confirmed.map(match => match.match.exhibit.id)).toEqual(['pin_1', 'pin_1']);
    expect(result.ambiguous).toHaveLength(0);
  });

  it('does not let document-wide signals override an explicit exhibit label', () => {
    const result = matchExhibitReferences(
      'Attached as Exhibit B. The school email chain is discussed in the same paragraph.',
      [
        { id: 'pin_1', title: 'Exhibit A - School email chain', filename: 'school-email-chain.pdf', source: 'case_pin' },
        { id: 'pin_2', title: 'Exhibit B - Medical receipt', filename: 'medical-receipt.pdf', source: 'case_pin' },
      ],
    );

    const explicitMatch = result.confirmed.find(match => match.mention.raw === 'Exhibit B');
    expect(explicitMatch?.match.exhibit.id).toBe('pin_2');
    expect(explicitMatch?.mention.normalizedLabel).toBe('B');
  });

  it('marks close competing matches as ambiguous', () => {
    const result = matchExhibitReferences('Attached as Exhibit A is the receipt.', [
      { id: 'pin_1', title: 'Exhibit A - School receipt', content: 'receipt', source: 'case_pin' },
      { id: 'pin_2', title: 'Exhibit A - Medical receipt', content: 'receipt', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates.map(candidate => candidate.exhibit.id)).toEqual(['pin_1', 'pin_2']);
  });

  it('asks for clarification when a reference has no confident match', () => {
    const result = matchExhibitReferences('Attached as Exhibit C is the photo.', [
      { id: 'pin_1', title: 'Exhibit A - School email chain', content: 'school email chain', source: 'case_pin' },
      { id: 'pin_2', title: 'Exhibit B - Medical receipt', content: 'medical receipt', source: 'case_pin' },
    ]);

    expect(result.confirmed).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates).toHaveLength(2);
  });
});
