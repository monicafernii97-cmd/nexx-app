/**
 * Exhibit Label Regression Tests
 *
 * Verifies alpha (A-Z, AA, AB...), numeric (1, 2...), and party_numeric formatting.
 */

import { describe, expect, it } from 'vitest';
import { formatExhibitLabel, indexToAlpha } from '../exhibits/formatExhibitLabel';

describe('formatExhibitLabel', () => {
  describe('alpha style', () => {
    it('formats 0-25 as A-Z', () => {
      expect(formatExhibitLabel(0, 'alpha')).toBe('A');
      expect(formatExhibitLabel(1, 'alpha')).toBe('B');
      expect(formatExhibitLabel(25, 'alpha')).toBe('Z');
    });

    it('overflows to AA, AB, ...', () => {
      expect(formatExhibitLabel(26, 'alpha')).toBe('AA');
      expect(formatExhibitLabel(27, 'alpha')).toBe('AB');
      expect(formatExhibitLabel(51, 'alpha')).toBe('AZ');
      expect(formatExhibitLabel(52, 'alpha')).toBe('BA');
    });
  });

  describe('numeric style', () => {
    it('formats as 1-based numbers', () => {
      expect(formatExhibitLabel(0, 'numeric')).toBe('1');
      expect(formatExhibitLabel(9, 'numeric')).toBe('10');
      expect(formatExhibitLabel(99, 'numeric')).toBe('100');
    });
  });

  describe('party_numeric style', () => {
    it('includes party name with exhibit number', () => {
      expect(formatExhibitLabel(0, 'party_numeric', 'Petitioner')).toBe("PETITIONER'S EXHIBIT 1");
      expect(formatExhibitLabel(4, 'party_numeric', 'Respondent')).toBe("RESPONDENT'S EXHIBIT 5");
    });

    it('defaults to PETITIONER when no party name', () => {
      expect(formatExhibitLabel(0, 'party_numeric')).toBe("PETITIONER'S EXHIBIT 1");
    });
  });
});

describe('indexToAlpha', () => {
  it('handles deep overflow', () => {
    // 702 = AAA (26^2 + 26 + 0)
    const result = indexToAlpha(702);
    expect(result).toBe('AAA');
  });
});
