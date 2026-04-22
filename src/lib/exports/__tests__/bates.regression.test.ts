/**
 * Bates Numbering Regression Tests
 */

import { describe, expect, it } from 'vitest';
import { formatBatesNumber } from '../bates/applyBatesNumbering';

describe('formatBatesNumber', () => {
  it('formats with default start number', () => {
    expect(formatBatesNumber(0, { enabled: true })).toBe('00001');
    expect(formatBatesNumber(1, { enabled: true })).toBe('00002');
    expect(formatBatesNumber(99, { enabled: true })).toBe('00100');
  });

  it('formats with custom start number', () => {
    expect(formatBatesNumber(0, { enabled: true, startNumber: 500 })).toBe('00500');
    expect(formatBatesNumber(1, { enabled: true, startNumber: 500 })).toBe('00501');
  });

  it('formats with prefix', () => {
    expect(formatBatesNumber(0, { enabled: true, prefix: 'PET' })).toBe('PET00001');
    expect(formatBatesNumber(9, { enabled: true, prefix: 'RESP' })).toBe('RESP00010');
  });

  it('formats with prefix and custom start', () => {
    expect(formatBatesNumber(0, { enabled: true, prefix: 'DEF', startNumber: 100 })).toBe('DEF00100');
  });

  it('handles large numbers', () => {
    expect(formatBatesNumber(99998, { enabled: true })).toBe('99999');
    expect(formatBatesNumber(99999, { enabled: true })).toBe('100000');
  });
});
