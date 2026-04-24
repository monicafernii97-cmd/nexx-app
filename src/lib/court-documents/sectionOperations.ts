/**
 * Section Operations — Immutable State Transitions
 *
 * Every function here takes a CourtDocumentDraftState and returns
 * a NEW state. No mutation. Every content change appends a revision.
 *
 * Rules:
 * - Never mutate original state
 * - Always append revision on content change
 * - Compute diff automatically
 * - Update metadata.isDirty and metadata.updatedAt
 */

import type {
  CourtDocumentDraftState,
  CourtDocumentSection,
  CourtSectionRevision,
  CourtSectionStatus,
  RevisionSource,
  DiffSegment,
} from './types';
import { computeWordDiff } from './sectionDiff';

// ═══════════════════════════════════════════════════════════════
// Update Section Content (Manual Edit)
// ═══════════════════════════════════════════════════════════════

/**
 * Update a section's content from a manual user edit.
 *
 * - Creates a new revision with diff
 * - Sets status to 'drafted'
 * - Sets source to 'user_edit'
 * - Marks state as dirty
 */
export function updateSectionContent(
  state: CourtDocumentDraftState,
  sectionId: string,
  newContent: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => {
    const before = section.content;
    if (before === newContent) return section; // No-op

    const revision = createRevision(before, newContent, 'user_edit');

    return {
      ...section,
      content: newContent,
      status: newContent.trim() ? 'drafted' : 'empty',
      source: 'user_edit',
      revisions: [...section.revisions, revision],
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// AI Draft (Generate Content for Empty Section)
// ═══════════════════════════════════════════════════════════════

/**
 * Set a section's content from AI-generated draft.
 *
 * - Creates a new revision with diff
 * - Sets status to 'drafted'
 * - Sets source to 'ai_draft'
 */
export function setAIDraftContent(
  state: CourtDocumentDraftState,
  sectionId: string,
  generatedContent: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => {
    const before = section.content;
    if (before === generatedContent) return section;

    const hasContent = generatedContent.trim().length > 0;
    const revision = createRevision(before, generatedContent, 'ai_draft');

    return {
      ...section,
      content: generatedContent,
      status: hasContent ? 'drafted' : 'empty',
      source: 'ai_draft',
      revisions: [...section.revisions, revision],
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Rewrite to Court Ready
// ═══════════════════════════════════════════════════════════════

/**
 * Apply an AI rewrite to make a section court-ready.
 *
 * - Creates a new revision with diff (green highlights)
 * - Sets status to 'court_ready'
 * - Sets source to 'ai_rewrite'
 */
export function rewriteSectionToCourtReady(
  state: CourtDocumentDraftState,
  sectionId: string,
  rewrittenContent: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => {
    const before = section.content;
    if (before === rewrittenContent) return section;

    const hasContent = rewrittenContent.trim().length > 0;
    const revision = createRevision(before, rewrittenContent, 'ai_rewrite');

    return {
      ...section,
      content: rewrittenContent,
      status: hasContent ? 'court_ready' : 'empty',
      source: 'ai_rewrite',
      revisions: [...section.revisions, revision],
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Lock / Unlock
// ═══════════════════════════════════════════════════════════════

/**
 * Lock a section — freezes it for export.
 * Does NOT create a revision (no content change).
 */
export function lockSection(
  state: CourtDocumentDraftState,
  sectionId: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => ({
    ...section,
    status: 'locked' as CourtSectionStatus,
  }));
}

/**
 * Unlock a section — returns it to court_ready.
 */
export function unlockSection(
  state: CourtDocumentDraftState,
  sectionId: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => ({
    ...section,
    status: section.content.trim() ? 'court_ready' : 'empty',
  }));
}

// ═══════════════════════════════════════════════════════════════
// Feedback Notes
// ═══════════════════════════════════════════════════════════════

/**
 * Add a feedback note to a section (for AI rewrite instructions).
 */
export function addFeedbackNote(
  state: CourtDocumentDraftState,
  sectionId: string,
  note: string,
): CourtDocumentDraftState {
  return updateSection(state, sectionId, (section) => ({
    ...section,
    feedbackNotes: [...(section.feedbackNotes ?? []), note],
  }));
}

// ═══════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a transformation to a specific section, returning a new state.
 * Always updates metadata.updatedAt and metadata.isDirty.
 */
function updateSection(
  state: CourtDocumentDraftState,
  sectionId: string,
  transform: (section: CourtDocumentSection) => CourtDocumentSection,
): CourtDocumentDraftState {
  const sectionIndex = state.sections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return state; // Section not found, no-op

  const updatedSection = transform(state.sections[sectionIndex]);

  // If transform returned the same object, nothing changed
  if (updatedSection === state.sections[sectionIndex]) return state;

  const newSections = [...state.sections];
  newSections[sectionIndex] = updatedSection;

  return {
    ...state,
    sections: newSections,
    metadata: {
      ...state.metadata,
      updatedAt: new Date().toISOString(),
      isDirty: true,
    },
  };
}

/**
 * Create a revision entry with auto-computed word diff.
 */
function createRevision(
  before: string,
  after: string,
  source: RevisionSource,
  note?: string,
): CourtSectionRevision {
  const diff: DiffSegment[] = computeWordDiff(before, after);

  return {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    before,
    after,
    diff,
    source,
    note,
  };
}
