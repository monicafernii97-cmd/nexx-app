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

  // ── (b) Multi-caseType templates: first entry is stable ──
  it('petition-divorce-children infers "divorce_with_children"', () => {
    const tmpl = getTemplate('petition-divorce-children');
    expect(tmpl).toBeDefined();
    expect(tmpl!.caseTypes[0]).toBe('divorce_with_children');
  });

  it('motion-temporary-orders infers "divorce_with_children" (first of multi)', () => {
    const tmpl = getTemplate('motion-temporary-orders');
    expect(tmpl).toBeDefined();
    // This template supports multiple case types — first entry determines caption
    expect(tmpl!.caseTypes.length).toBeGreaterThan(1);
    expect(tmpl!.caseTypes[0]).toBe('divorce_with_children');
  });

  it('petition-modify-pcr infers "custody_modification"', () => {
    const tmpl = getTemplate('petition-modify-pcr');
    expect(tmpl).toBeDefined();
    expect(tmpl!.caseTypes[0]).toBe('custody_modification');
  });

  // ── Guard: every template has at least one caseType ──
  it('all templates have non-empty caseTypes arrays', () => {
    for (const tmpl of TEMPLATE_LIBRARY) {
      expect(tmpl.caseTypes.length, `${tmpl.id} has empty caseTypes`).toBeGreaterThan(0);
    }
  });
});
