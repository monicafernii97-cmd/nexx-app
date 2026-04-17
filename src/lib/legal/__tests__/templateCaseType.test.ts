/**
 * Regression tests for caseType inference semantics.
 *
 * When the caller omits caseType, the generate stream route infers it via:
 *   body.caseType = template.caseTypes[0] ?? 'other'
 *
 * These tests lock down the first-entry ordering so future template
 * edits don't silently change caption behavior.
 */

import { describe, it, expect } from 'vitest';
import { getTemplate, TEMPLATE_LIBRARY } from '../templates';

describe('caseType inference from templates', () => {
  // ── (a) General fallback template ──
  it('general template exists and infers caseType "other"', () => {
    const general = getTemplate('general');
    expect(general).toBeDefined();
    expect(general!.caseTypes[0]).toBe('other');
  });

  const inferenceCases = [
    { id: 'petition-divorce-children', expected: 'divorce_with_children', minLen: 1 },
    { id: 'motion-temporary-orders', expected: 'divorce_with_children', minLen: 2 },
    { id: 'petition-modify-pcr', expected: 'custody_modification', minLen: 1 },
  ] as const;

  it.each(inferenceCases)('$id infers "$expected" from first caseType entry', ({ id, expected, minLen }) => {
    const tmpl = getTemplate(id);
    expect(tmpl).toBeDefined();
    expect(tmpl!.caseTypes.length).toBeGreaterThanOrEqual(minLen);
    expect(tmpl!.caseTypes[0]).toBe(expected);
  });

  // ── Guard: every template has at least one caseType ──
  it('all templates have non-empty caseTypes arrays', () => {
    for (const tmpl of TEMPLATE_LIBRARY) {
      expect(tmpl.caseTypes.length, `${tmpl.id} has empty caseTypes`).toBeGreaterThan(0);
    }
  });
});
