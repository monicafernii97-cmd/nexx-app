/**
 * Court Document Pipeline — Foundation Types
 *
 * CourtDocumentDraftState is the SINGLE SOURCE OF TRUTH for
 * all document content in the Review Hub. Every mutation must
 * produce a new state via pure functions in sectionOperations.ts.
 *
 * These types are consumed by:
 *  - Core engines (sectionDiff, validatePreflight, sectionOperations)
 *  - AI integration layer (generateSection, rewriteSection)
 *  - UI components (SectionBox, DiffViewer, PracticalPreflightSidebar)
 *  - Export bridge (draftStateToLegalDocument)
 */

import type { DocumentType } from '@/lib/legal-docs/classifyDocumentType';

// Re-export for convenience — consumers import from this file
export type { DocumentType };

// ═══════════════════════════════════════════════════════════════
// Top-Level Draft State
// ═══════════════════════════════════════════════════════════════

export type CourtDocumentDraftState = {
  documentId: string;
  documentType: DocumentType;
  jurisdiction: JurisdictionContext;

  sections: CourtDocumentSection[];

  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;

    isDirty: boolean;
    version: number;

    source: 'parsed_input' | 'manual_start' | 'ai_generated';
  };

  persistence: {
    storage: 'client' | 'localStorage' | 'convex';
    lastSavedAt?: string;
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  };
};

// ═══════════════════════════════════════════════════════════════
// Section
// ═══════════════════════════════════════════════════════════════

export type CourtSectionStatus = 'empty' | 'drafted' | 'court_ready' | 'locked';

export type CourtSectionSource =
  | 'blank_template'
  | 'parsed_input'
  | 'user_edit'
  | 'ai_draft'
  | 'ai_rewrite';

export type CourtDocumentSection = {
  id: string;
  heading: string;
  order: number;

  content: string;

  status: CourtSectionStatus;

  source: CourtSectionSource;

  revisions: CourtSectionRevision[];

  feedbackNotes?: string[];
};

// ═══════════════════════════════════════════════════════════════
// Revision
// ═══════════════════════════════════════════════════════════════

export type RevisionSource = 'user_edit' | 'ai_draft' | 'ai_rewrite';

export type CourtSectionRevision = {
  id: string;
  timestamp: string;

  before: string;
  after: string;

  diff: DiffSegment[];

  source: RevisionSource;

  note?: string;
};

// ═══════════════════════════════════════════════════════════════
// Diff
// ═══════════════════════════════════════════════════════════════

export type DiffSegmentType = 'unchanged' | 'added' | 'removed';

export type DiffSegment = {
  text: string;
  type: DiffSegmentType;
};

// ═══════════════════════════════════════════════════════════════
// Preflight
// ═══════════════════════════════════════════════════════════════

export type PreflightCheckStatus = 'complete' | 'warning' | 'missing';

export type PreflightCheckItem = {
  id: string;
  label: string;
  status: PreflightCheckStatus;
  description?: string;
  /** Links this check to a specific section for "Fix Now" navigation */
  sectionId?: string;
};

export type PreflightResult = {
  items: PreflightCheckItem[];
  completionPct: number;
  blockers: number;
  warnings: number;

  /** True when blockers === 0 */
  canExport: boolean;
};

// ═══════════════════════════════════════════════════════════════
// Jurisdiction Context
// ═══════════════════════════════════════════════════════════════

/**
 * Minimal jurisdiction context carried within draft state.
 * Full JurisdictionProfile is resolved at export time via
 * resolveJurisdictionProfile().
 */
export type JurisdictionContext = {
  state?: string;
  county?: string;
  courtName?: string;
  district?: string;
};

// ═══════════════════════════════════════════════════════════════
// Section Definition (for deriveRequiredSections)
// ═══════════════════════════════════════════════════════════════

export type RequiredSectionDef = {
  id: string;
  heading: string;
  required: boolean;
  /** Default placeholder prompt text */
  placeholder?: string;
};
