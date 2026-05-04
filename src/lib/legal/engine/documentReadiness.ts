/**
 * Document Readiness State Machine
 *
 * Defines the lifecycle states a legal document passes through
 * from initial drafting to court-ready PDF export.
 *
 * Rule: A document cannot reach `ready_for_final_pdf` unless
 * ALL finalization contract rules pass.
 *
 * @module documentReadiness
 */

// ═══════════════════════════════════════════════════════════════
// Readiness States
// ═══════════════════════════════════════════════════════════════

/**
 * The readiness lifecycle of a legal document.
 *
 * - `draft` — Work in progress, editable, incomplete is OK
 * - `needs_review` — Drafted but not yet validated
 * - `blocked_missing_required_fields` — Required identity/court fields are empty
 * - `blocked_placeholders_present` — Bracket placeholders remain in text
 * - `blocked_generic_party_labels` — Generic labels used as identity substitutes
 * - `blocked_silent_fallbacks` — Fallback values detected in legal sections
 * - `ready_for_final_pdf` — All contract rules pass, PDF export is allowed
 */
export type DocumentReadiness =
  | 'draft'
  | 'needs_review'
  | 'blocked_missing_required_fields'
  | 'blocked_placeholders_present'
  | 'blocked_generic_party_labels'
  | 'blocked_silent_fallbacks'
  | 'ready_for_final_pdf';

// ═══════════════════════════════════════════════════════════════
// Finalization Guard Result Types
// ═══════════════════════════════════════════════════════════════

/**
 * Result of the finalization guard check.
 *
 * When `ok: true`, the document is ready for PDF generation.
 * When `ok: false`, the document is blocked with specific errors.
 */
export type FinalizationGuardResult =
  | {
      ok: true;
      readiness: 'ready_for_final_pdf';
    }
  | {
      ok: false;
      readiness:
        | 'blocked_missing_required_fields'
        | 'blocked_placeholders_present'
        | 'blocked_generic_party_labels'
        | 'blocked_silent_fallbacks';
      code: 'DOCUMENT_NOT_FINALIZABLE';
      errors: FinalizationError[];
    };

/**
 * A single finalization error describing what failed and where.
 */
export type FinalizationError = {
  /** The identity/court field that is missing, if applicable. */
  field?: string;
  /** Human-readable description of the issue. */
  message: string;
  /** Where in the document the issue was found. */
  location?: 'caption' | 'body' | 'certificate' | 'signature' | 'boilerplate' | 'unknown';
  /** Whether this error blocks export or is advisory. */
  severity: 'blocking' | 'warning';
};
