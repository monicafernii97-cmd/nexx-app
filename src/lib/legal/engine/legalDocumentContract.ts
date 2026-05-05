/**
 * Legal Document Finalization Contract
 *
 * Source of truth for all finalization rules enforced by the
 * NEXX Legal Document Engine. These rules apply ONLY when a
 * user attempts to generate, export, save, or download a
 * court-ready PDF. Drafting, review, and revision remain flexible.
 *
 * Non-negotiable system guarantees:
 * 1. No finalized document contains placeholders
 * 2. No finalized document contains generic party labels as identity substitutes
 * 3. No finalized document omits required legal identity fields
 * 4. No fallback values appear in exported PDFs
 * 5. Every exported document is structurally complete
 *
 * @module legalDocumentContract
 */

// ═══════════════════════════════════════════════════════════════
// Finalization Rules — the "contract" the engine enforces
// ═══════════════════════════════════════════════════════════════

/**
 * Core finalization rules. Each must pass before a court-ready
 * PDF is allowed to be generated.
 */
export const LEGAL_DOCUMENT_FINALIZATION_RULES = {
  /** No bracket placeholders like [Opposing Party] or [FACT NEEDED: ...] */
  NO_VISIBLE_PLACEHOLDERS: true,
  /** No generic labels used as party identity substitutes in legal sections */
  NO_GENERIC_PARTY_LABELS: true,
  /** No required identity/court field left empty */
  NO_EMPTY_REQUIRED_FIELDS: true,
  /** No silent string fallbacks (e.g., "Petitioner" when name is unknown) */
  NO_SILENT_FALLBACKS: true,
  /** All party names must be resolved from a verified source */
  REQUIRE_VERIFIED_PARTY_IDENTITY: true,
  /** Block PDF export if any rule fails */
  BLOCK_EXPORT_IF_INCOMPLETE: true,
} as const;

// ═══════════════════════════════════════════════════════════════
// Required Fields — by document context
// ═══════════════════════════════════════════════════════════════

/**
 * Required identity/court fields by document context.
 *
 * Keys combine export path + case type for precise control.
 * Values are dot-path field identifiers checked against the
 * resolved CourtIdentity.
 */
export const REQUIRED_FIELDS_BY_DOCUMENT_CONTEXT: Record<string, string[]> = {
  // ── Court Pleadings ────────────────────────────────────────
  court_pleading_sapcr: [
    'petitioner.name',
    'respondent.name',
    'child.name',
    'court.county',
    'court.name',
    'case.causeNumber',
  ],
  court_pleading_sapcr_modification: [
    'petitioner.name',
    'respondent.name',
    'child.name',
    'court.county',
    'court.name',
    'case.causeNumber',
  ],
  court_pleading_divorce: [
    'petitioner.name',
    'respondent.name',
    'court.county',
    'case.causeNumber',
  ],
  court_pleading_general: [
    'petitioner.name',
    'respondent.name',
  ],

  // ── Exhibit Documents ──────────────────────────────────────
  exhibit_document: [
    'court.name',
    'case.causeNumber',
  ],

  // ── Certificate of Service ─────────────────────────────────
  certificate_of_service: [
    'filingParty.name',
    'servedParty.name',
    'service.method',
  ],
};

/**
 * When true, allows cause number to be omitted for initiating filings
 * (e.g., original petitions where no cause number has been assigned yet).
 */
export const ALLOW_MISSING_CAUSE_NUMBER_FOR_NEW_CASE = true;

// ═══════════════════════════════════════════════════════════════
// Placeholder Patterns
// ═══════════════════════════════════════════════════════════════

/**
 * Patterns that should NEVER appear in a finalized court document.
 * These are always-blocked regardless of context.
 */
export const PLACEHOLDER_BRACKET_PATTERNS: RegExp[] = [
  /\[Opposing Party\]/gi,
  /\[Filing Party\]/gi,
  /\[Other Parent\]/gi,
  /\[FACT NEEDED:[^\]]*\]/gi,
  /\[Child(?:'s)? Name\]/gi,
  /\[method\]/gi,
  /\[TBD\]/gi,
  /\[Unknown\]/gi,
  /\[INSERT[^\]]*\]/gi,
  /\[PLACEHOLDER[^\]]*\]/gi,
  /\[YOUR NAME[^\]]*\]/gi,
];

/**
 * Generic party labels that are prohibited ONLY when used as identity
 * substitutes in legal-critical sections: captions, signature blocks,
 * certificates of service, party declarations, and court boilerplate.
 *
 * These are NOT blocked when they appear in explanatory body text
 * (e.g., "... the opposing party failed to comply ...").
 */
export const GENERIC_PARTY_LABEL_PATTERNS: RegExp[] = [
  /\bOpposing Party\b/i,
  /\bOther Parent\b/i,
  /\bUnknown\b/i,
  /\bTBD\b/i,
];

/**
 * Sections where generic party labels are prohibited.
 * The finalization guard only flags generic labels found within these sections.
 */
export const IDENTITY_CRITICAL_SECTIONS = new Set([
  'caption',
  'certificate',
  'signature',
  'boilerplate',
  'party_declaration',
  'verification',
]);
