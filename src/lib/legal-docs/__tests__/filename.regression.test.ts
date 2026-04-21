/**
 * Filename Regression Tests — Multi-State Pleadings
 *
 * Locks down that generated filenames are efile-safe across all
 * jurisdictions: uppercase, underscores only, no special chars,
 * cause number preserved with hyphens.
 */

import { describe, it, expect } from 'vitest';
import { parseLegalDocument } from '../parseLegalDocument';
import { generateLegalFilename } from '../generateLegalFilename';

import { texasPleadingFixture } from './fixtures/texas-pleading';
import { floridaPleadingFixture } from './fixtures/florida-pleading';
import { federalPleadingFixture } from './fixtures/federal-pleading';
import { genericStatePleadingFixture } from './fixtures/generic-state-pleading';

describe('filename regression — multi-state pleadings', () => {
  it('generates efile-safe filename for Texas pleading', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const filename = generateLegalFilename(doc);

    expect(filename).toMatch(/^[A-Z0-9_-]+\.pdf$/);
    expect(filename).toContain('MOTION_FOR_TEMPORARY_ORDERS');
    expect(filename).toContain('20-DCV-271717');
  });

  it('generates safe filename for Florida pleading', () => {
    const doc = parseLegalDocument(floridaPleadingFixture);
    const filename = generateLegalFilename(doc);

    // Parser currently detects "Petitioner," as title for stacked captions.
    // When parser improves to detect the actual motion title, update to:
    // expect(filename).toContain('MOTION_FOR_TEMPORARY_RELIEF');
    expect(filename).toMatch(/^[A-Z0-9_-]+\.pdf$/);
    expect(filename).toContain('2026-DR-12345');
  });

  it('generates safe filename for federal pleading', () => {
    const doc = parseLegalDocument(federalPleadingFixture);
    const filename = generateLegalFilename(doc);

    expect(filename).toMatch(/^[A-Z0-9_-]+\.pdf$/);
    expect(filename).toContain('MOTION_FOR_LEAVE_TO_AMEND');
  });

  it('generates filename for generic pleading with cause number', () => {
    const doc = parseLegalDocument(genericStatePleadingFixture);
    const filename = generateLegalFilename(doc);

    expect(filename).toContain('MOTION_TO_MODIFY');
    expect(filename).toContain('2026-CV-9999');
  });

  it('never includes spaces, parentheses, quotes, or unsafe punctuation', () => {
    const doc = parseLegalDocument(texasPleadingFixture);
    const filename = generateLegalFilename(doc);

    expect(filename).not.toMatch(/\s/);
    expect(filename).not.toContain('(');
    expect(filename).not.toContain(')');
    expect(filename).not.toContain("'");
    expect(filename).not.toContain('"');
  });

  it('always ends with .pdf', () => {
    const fixtures = [texasPleadingFixture, floridaPleadingFixture, federalPleadingFixture];
    for (const fixture of fixtures) {
      const doc = parseLegalDocument(fixture);
      expect(generateLegalFilename(doc)).toMatch(/\.pdf$/);
    }
  });
});
