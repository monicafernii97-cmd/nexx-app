/**
 * Canonical Pipeline Stage Contracts
 *
 * Typed input/output contracts for each orchestrator stage.
 * Both Quick Generate and Create Export pipelines use these
 * canonical shapes to enforce strict stage boundaries.
 *
 * Rule: No inline return shapes allowed in stage helpers.
 * Every stage helper must return one of these typed contracts.
 */

import type { JurisdictionProfile, ProfileResolutionMeta } from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Profile Resolution
// ═══════════════════════════════════════════════════════════════

/** Result of the profile resolution stage. */
export type ResolvedProfileStageResult = {
  /** The resolved jurisdiction profile. */
  profile: JurisdictionProfile;
  /** How the profile was selected — for observability. */
  meta: ProfileResolutionMeta;
};

// ═══════════════════════════════════════════════════════════════
// HTML Rendering
// ═══════════════════════════════════════════════════════════════

/** Result of the HTML rendering stage. */
export type RenderedHTMLStageResult = {
  /** The rendered HTML string. */
  html: string;
  /** Length of the rendered HTML. */
  htmlLength: number;
};

// ═══════════════════════════════════════════════════════════════
// PDF Rendering
// ═══════════════════════════════════════════════════════════════

/** Result of the PDF rendering stage. */
export type RenderedPDFStageResult = {
  /** The raw PDF buffer. */
  pdfBuffer: Buffer;
  /** Byte length of the PDF. */
  byteLength: number;
};

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

/** Result of the PDF validation stage. */
export type ValidatedPDFStageResult = {
  /** Whether the PDF passed validation. */
  valid: boolean;
  /** Byte length of the validated PDF. */
  byteLength: number;
  /** Optional validation message. */
  message?: string;
};
