/**
 * Test Utilities for Legal Document Regression Tests
 */

import { expect } from 'vitest';

/** Assert that a string contains all of the given substrings. */
export function expectStringToContainAll(haystack: string, needles: string[]) {
  for (const needle of needles) {
    expect(haystack).toContain(needle);
  }
}
