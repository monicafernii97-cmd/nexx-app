/**
 * Unit Tests — Court Document Core Engines
 *
 * Tests for:
 * - sectionDiff (word-level diffing)
 * - deriveRequiredSections (section derivation)
 * - validatePreflight (preflight gating)
 * - sectionOperations (immutable state transitions)
 * - buildCourtDocumentDraftState (builder)
 */

import { computeWordDiff, renderDiffHTML } from '../sectionDiff';
import { deriveRequiredSections, getRequiredSectionIds } from '../deriveRequiredSections';
import { validatePreflight } from '../validatePreflight';
import { buildCourtDocumentDraftState } from '../buildCourtDocumentDraftState';
import {
  updateSectionContent,
  setAIDraftContent,
  rewriteSectionToCourtReady,
  lockSection,
  unlockSection,
  addFeedbackNote,
} from '../sectionOperations';
import type { CourtDocumentDraftState } from '../types';

// ═══════════════════════════════════════════════════════════════
// Section Diff
// ═══════════════════════════════════════════════════════════════

describe('sectionDiff', () => {
  test('identical strings produce single unchanged segment', () => {
    const segments = computeWordDiff('hello world', 'hello world');
    expect(segments).toEqual([{ text: 'hello world', type: 'unchanged' }]);
  });

  test('detects added words', () => {
    const segments = computeWordDiff('hello', 'hello world');
    const added = segments.filter(s => s.type === 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.some(s => s.text.includes('world'))).toBe(true);
  });

  test('detects removed words', () => {
    const segments = computeWordDiff('hello world', 'hello');
    const removed = segments.filter(s => s.type === 'removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.some(s => s.text.includes('world'))).toBe(true);
  });

  test('handles empty strings', () => {
    const segments = computeWordDiff('', 'new content');
    expect(segments.some(s => s.type === 'added')).toBe(true);
  });

  test('renderDiffHTML produces correct HTML', () => {
    const segments = computeWordDiff('old text', 'new text');
    const html = renderDiffHTML(segments);
    expect(html).toContain('section-change-');
    expect(typeof html).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════
// Required Sections
// ═══════════════════════════════════════════════════════════════

describe('deriveRequiredSections', () => {
  test('motion returns ordered sections including caption and prayer', () => {
    const sections = deriveRequiredSections('motion');
    const ids = sections.map(s => s.id);
    expect(ids).toContain('caption');
    expect(ids).toContain('title');
    expect(ids).toContain('prayer');
    expect(ids).toContain('signature');
    expect(ids).toContain('argument');
    // Order: caption before argument
    expect(ids.indexOf('caption')).toBeLessThan(ids.indexOf('argument'));
  });

  test('petition includes verification', () => {
    const sections = deriveRequiredSections('petition');
    const ids = sections.map(s => s.id);
    expect(ids).toContain('verification');
  });

  test('unknown type returns fallback sections', () => {
    const sections = deriveRequiredSections('unknown');
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.id === 'body')).toBe(true);
  });

  test('getRequiredSectionIds filters to required only', () => {
    const ids = getRequiredSectionIds('motion');
    expect(ids).toContain('caption');
    expect(ids).toContain('argument');
    // introduction is not required for motion
    expect(ids).not.toContain('introduction');
  });
});

// ═══════════════════════════════════════════════════════════════
// Build Draft State
// ═══════════════════════════════════════════════════════════════

describe('buildCourtDocumentDraftState', () => {
  test('creates state with correct document type', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    expect(state.documentType).toBe('motion');
    expect(state.sections.length).toBeGreaterThan(0);
    expect(state.metadata.isDirty).toBe(false);
    expect(state.metadata.source).toBe('manual_start');
    expect(state.persistence.storage).toBe('client');
  });

  test('all sections start empty without parsed content', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    state.sections.forEach(s => {
      expect(s.status).toBe('empty');
      expect(s.source).toBe('blank_template');
      expect(s.revisions).toEqual([]);
    });
  });

  test('sections are ordered', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    for (let i = 0; i < state.sections.length; i++) {
      expect(state.sections[i].order).toBe(i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Section Operations
// ═══════════════════════════════════════════════════════════════

describe('sectionOperations', () => {
  let baseState: CourtDocumentDraftState;

  beforeEach(() => {
    baseState = buildCourtDocumentDraftState({ documentType: 'motion' });
  });

  describe('updateSectionContent', () => {
    test('updates content and creates revision', () => {
      const newState = updateSectionContent(baseState, 'caption', 'IN THE DISTRICT COURT');
      const section = newState.sections.find(s => s.id === 'caption')!;
      expect(section.content).toBe('IN THE DISTRICT COURT');
      expect(section.status).toBe('drafted');
      expect(section.source).toBe('user_edit');
      expect(section.revisions.length).toBe(1);
      expect(section.revisions[0].source).toBe('user_edit');
    });

    test('does not mutate original state', () => {
      const original = { ...baseState };
      updateSectionContent(baseState, 'caption', 'New content');
      expect(baseState.sections[0].content).toBe(original.sections[0].content);
    });

    test('marks state as dirty', () => {
      const newState = updateSectionContent(baseState, 'caption', 'content');
      expect(newState.metadata.isDirty).toBe(true);
    });

    test('no-op when content is unchanged', () => {
      const stateWithContent = updateSectionContent(baseState, 'caption', 'test');
      const sameState = updateSectionContent(stateWithContent, 'caption', 'test');
      expect(sameState).toBe(stateWithContent); // Same reference
    });
  });

  describe('setAIDraftContent', () => {
    test('sets content from AI and creates revision', () => {
      const newState = setAIDraftContent(baseState, 'introduction', 'AI generated intro');
      const section = newState.sections.find(s => s.id === 'introduction')!;
      expect(section.content).toBe('AI generated intro');
      expect(section.status).toBe('drafted');
      expect(section.source).toBe('ai_draft');
      expect(section.revisions[0].source).toBe('ai_draft');
    });
  });

  describe('rewriteSectionToCourtReady', () => {
    test('rewrites content and sets court_ready', () => {
      const drafted = updateSectionContent(baseState, 'argument', 'rough argument');
      const rewritten = rewriteSectionToCourtReady(drafted, 'argument', 'polished legal argument');
      const section = rewritten.sections.find(s => s.id === 'argument')!;
      expect(section.content).toBe('polished legal argument');
      expect(section.status).toBe('court_ready');
      expect(section.source).toBe('ai_rewrite');
      expect(section.revisions.length).toBe(2); // user_edit + ai_rewrite
      // Diff should contain segments
      const lastRevision = section.revisions[section.revisions.length - 1];
      expect(lastRevision.diff.length).toBeGreaterThan(0);
    });
  });

  describe('lockSection / unlockSection', () => {
    test('lock sets status to locked', () => {
      const drafted = updateSectionContent(baseState, 'caption', 'content');
      const locked = lockSection(drafted, 'caption');
      expect(locked.sections.find(s => s.id === 'caption')!.status).toBe('locked');
    });

    test('unlock returns to court_ready or drafted', () => {
      const drafted = updateSectionContent(baseState, 'caption', 'content');
      const locked = lockSection(drafted, 'caption');
      const unlocked = unlockSection(locked, 'caption');
      expect(unlocked.sections.find(s => s.id === 'caption')!.status).not.toBe('locked');
    });

    test('lock does NOT create a revision', () => {
      const drafted = updateSectionContent(baseState, 'caption', 'content');
      const revCount = drafted.sections.find(s => s.id === 'caption')!.revisions.length;
      const locked = lockSection(drafted, 'caption');
      expect(locked.sections.find(s => s.id === 'caption')!.revisions.length).toBe(revCount);
    });
  });

  describe('addFeedbackNote', () => {
    test('appends note to section', () => {
      const noted = addFeedbackNote(baseState, 'argument', 'Make it more formal');
      const section = noted.sections.find(s => s.id === 'argument')!;
      expect(section.feedbackNotes).toContain('Make it more formal');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Preflight Validation
// ═══════════════════════════════════════════════════════════════

describe('validatePreflight', () => {
  test('all empty required sections → blockers, canExport = false', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    const result = validatePreflight(state);
    expect(result.canExport).toBe(false);
    expect(result.blockers).toBeGreaterThan(0);
  });

  test('drafted sections do NOT block export', () => {
    let state = buildCourtDocumentDraftState({ documentType: 'motion' });
    // Fill all required sections with drafted content
    const requiredIds = getRequiredSectionIds('motion');
    for (const id of requiredIds) {
      state = updateSectionContent(state, id, `Content for ${id}`);
    }
    const result = validatePreflight(state);
    expect(result.canExport).toBe(true);
    expect(result.blockers).toBe(0);
  });

  test('locked sections count as complete', () => {
    let state = buildCourtDocumentDraftState({ documentType: 'motion' });
    const requiredIds = getRequiredSectionIds('motion');
    for (const id of requiredIds) {
      state = updateSectionContent(state, id, `Content for ${id}`);
      state = lockSection(state, id);
    }
    const result = validatePreflight(state);
    expect(result.canExport).toBe(true);
    expect(result.completionPct).toBeGreaterThan(50);
  });

  test('completionPct is between 0 and 100', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    const result = validatePreflight(state);
    expect(result.completionPct).toBeGreaterThanOrEqual(0);
    expect(result.completionPct).toBeLessThanOrEqual(100);
  });

  test('items have sectionId for Fix Now navigation', () => {
    const state = buildCourtDocumentDraftState({ documentType: 'motion' });
    const result = validatePreflight(state);
    const sectionItems = result.items.filter(i => i.sectionId);
    expect(sectionItems.length).toBeGreaterThan(0);
  });
});
