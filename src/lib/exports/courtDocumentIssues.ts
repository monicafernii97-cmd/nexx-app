/**
 * Court Document Issue Schema — Shared between frontend and backend.
 *
 * This is the single canonical issue ID list for all court-document
 * validation, clarification, and integrity enforcement.
 *
 * Pure logic only. No React. No Node-only dependencies.
 * Both `detectCourtDocumentIssues()` and `route.ts` import from here.
 *
 * @module courtDocumentIssues
 */

import type { CourtIdentity } from './resolveCourtIdentity';
import { COURT_ISSUE_COPY } from './courtIssueCopy';

// ═══════════════════════════════════════════════════════════════
// Issue IDs — Single Canonical List
// ═══════════════════════════════════════════════════════════════

/** All known court-document issue IDs. Backend and frontend share this exact list. */
export type CourtDocumentIssueId =
  | 'generic_title_detected'
  | 'missing_document_title'
  | 'missing_subtitle_when_context_requires'
  | 'missing_sapcr_child_name'
  | 'wrong_caption_format'
  | 'missing_cause_number'
  | 'missing_judicial_district'
  | 'missing_court_name'
  | 'missing_county_or_state'
  | 'missing_filing_party_role'
  | 'missing_opposing_party'
  | 'missing_motion_intro'
  | 'missing_prayer'
  | 'missing_certificate'
  | 'duplicate_section_content'
  | 'malformed_section_headings'
  | 'numbered_paragraph_structure_missing'
  | 'internal_metadata_leak_detected'
  | 'placeholder_text_detected'
  | 'missing_signature_block'
  | 'missing_attorney_signature'
  | 'pro_se_language_with_counsel'
  | 'attorney_language_in_pro_se';

// ═══════════════════════════════════════════════════════════════
// Modal Modes
// ═══════════════════════════════════════════════════════════════

/** ClarificationModal mode determined by issue type. */
export type ClarificationModalMode =
  | 'missing_structure'
  | 'court_required_fields'
  | 'court_caption_repair'
  | 'court_title_repair'
  | 'court_prayer_repair'
  | 'court_certificate_repair'
  | 'court_signature_repair'
  | 'duplicate_content_repair';

// ═══════════════════════════════════════════════════════════════
// Issue Object
// ═══════════════════════════════════════════════════════════════

/** A single court document validation issue with user-facing copy and resolution hints. */
export type CourtDocumentIssue = {
  id: CourtDocumentIssueId;
  severity: 'blocker' | 'warning';
  title: string;
  message: string;
  whyItMatters?: string;
  fieldKey?: string;
  currentValue?: string | null;
  suggestedValue?: string | null;
  suggestedValues?: string[];
  sourceSuggestion?:
    | 'court_settings'
    | 'nex_profile'
    | 'personal_profile'
    | 'jurisdiction_profile'
    | 'ai_suggested'
    | 'manual';
  canAutoFill: boolean;
  requiresUserConfirmation: boolean;
  actionType:
    | 'autofill_from_profile'
    | 'choose_suggestion'
    | 'manual_input'
    | 'send_to_nexchat'
    | 'regenerate_structure'
    | 'block_until_fixed';
};

// ═══════════════════════════════════════════════════════════════
// Resolution Types
// ═══════════════════════════════════════════════════════════════

/** Result of resolving issues through ClarificationModal. */
export type ClarificationResolution =
  | { type: 'replace_document_text'; resolvedText: string }
  | { type: 'patch_court_identity'; patch: Partial<CourtIdentity>; resolvedText?: string; saveToProfile?: boolean }
  | { type: 'patch_review_items'; overrides: { nodeId: string; editedText: string }[] }
  | { type: 'send_to_nexchat' };

// ═══════════════════════════════════════════════════════════════
// Issue → Mode Mapping
// ═══════════════════════════════════════════════════════════════

/** Maps each issue ID to the ClarificationModal mode that handles it. */
export const ISSUE_TO_MODE: Record<CourtDocumentIssueId, ClarificationModalMode> = {
  generic_title_detected: 'court_title_repair',
  missing_document_title: 'court_title_repair',
  missing_subtitle_when_context_requires: 'court_title_repair',
  missing_sapcr_child_name: 'court_caption_repair',
  wrong_caption_format: 'court_caption_repair',
  missing_cause_number: 'court_caption_repair',
  missing_judicial_district: 'court_caption_repair',
  missing_court_name: 'court_caption_repair',
  missing_county_or_state: 'court_caption_repair',
  missing_filing_party_role: 'court_required_fields',
  missing_opposing_party: 'court_required_fields',
  missing_motion_intro: 'court_required_fields',
  missing_prayer: 'court_prayer_repair',
  missing_certificate: 'court_certificate_repair',
  duplicate_section_content: 'duplicate_content_repair',
  malformed_section_headings: 'missing_structure',
  numbered_paragraph_structure_missing: 'missing_structure',
  internal_metadata_leak_detected: 'court_required_fields',
  placeholder_text_detected: 'court_required_fields',
  missing_signature_block: 'court_signature_repair',
  missing_attorney_signature: 'court_signature_repair',
  pro_se_language_with_counsel: 'court_signature_repair',
  attorney_language_in_pro_se: 'court_signature_repair',
};

/**
 * Priority ordering for ClarificationModal issue resolution.
 *
 * When multiple issues exist, handle in this order:
 * 1. Caption / court identity (who, where, what case)
 * 2. Title (what is this document)
 * 3. Structure / headings
 * 4. Prayer
 * 5. Certificate
 * 6. Signature
 * 7. Duplicates
 */
export const MODE_PRIORITY: ClarificationModalMode[] = [
  'court_caption_repair',
  'court_required_fields',
  'court_title_repair',
  'missing_structure',
  'court_prayer_repair',
  'court_certificate_repair',
  'court_signature_repair',
  'duplicate_content_repair',
];

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Treat undefined, null, empty string, and whitespace-only as missing. (Invariant P3) */
function isMissing(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

/**
 * Titles that are forbidden for court documents.
 * These are template labels or generic fallbacks, not real filing titles.
 */
const FORBIDDEN_TITLES = [
  'court document',
  'court filing document',
  'legal document',
  'document export',
  'untitled document',
  'court filing',
];

/**
 * Strings that must never appear in final visible text.
 * Presence of any of these triggers `placeholder_text_detected` blocker.
 */
export const FORBIDDEN_VISIBLE_TEXT = [
  '[CHILD NAME]',
  '[COURT NAME]',
  '[CAUSE NUMBER]',
  '[FILING PARTY NAME]',
  '[JUDGE NAME]',
  'COURT FILING DOCUMENT',
  'court_document',
  'personal_injury',
];

/**
 * Patterns that indicate internal values leaked into visible text.
 * Matched with word boundaries to avoid false positives.
 */
const FORBIDDEN_WORD_PATTERNS = /\b(undefined|null|NaN)\b/;

/**
 * Document kinds that require a prayer section.
 */
const PRAYER_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'petition',
]);

/**
 * Document kinds that require a certificate of service.
 */
const CERTIFICATE_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'response', 'petition', 'objection',
]);

/**
 * Document kinds that require a COMES NOW intro block.
 */
const INTRO_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'response', 'petition',
]);

// ═══════════════════════════════════════════════════════════════
// Detection — Shared between frontend and backend
// ═══════════════════════════════════════════════════════════════

/**
 * Detect court-document structural and identity issues.
 *
 * This function is the shared validation engine:
 * - Frontend calls it for immediate UI feedback during review
 * - Backend calls it as the final authority before completing export
 *
 * @param identity - Partial court identity (merged from all sources)
 * @param config   - Export config (documentType, path, etc.)
 * @param reviewItemTexts - Flattened text of review items (for content scanning)
 * @returns Array of court document issues sorted by modal priority
 */
export function detectCourtDocumentIssues(
  identity: Partial<CourtIdentity>,
  config: Record<string, unknown>,
  reviewItemTexts?: string[],
): CourtDocumentIssue[] {
  const issues: CourtDocumentIssue[] = [];
  const allText = reviewItemTexts?.join('\n') ?? '';
  const documentKind = (identity.documentKind ?? config.documentType ?? '') as string;

  const copy = COURT_ISSUE_COPY;

  // ── Title ──────────────────────────────────────────────────
  if (isMissing(identity.resolvedTitle)) {
    issues.push({
      ...copy.missing_document_title,
      id: 'missing_document_title',
      severity: 'blocker',
      canAutoFill: false,
      requiresUserConfirmation: false,
      actionType: 'manual_input',
    });
  } else if (FORBIDDEN_TITLES.some(f => identity.resolvedTitle!.toLowerCase().includes(f))) {
    issues.push({
      ...copy.generic_title_detected,
      id: 'generic_title_detected',
      severity: 'blocker',
      currentValue: identity.resolvedTitle,
      canAutoFill: false,
      requiresUserConfirmation: false,
      actionType: 'manual_input',
    });
  }

  // ── Subtitle (warning only) ────────────────────────────────
  if (isMissing(identity.resolvedSubtitle) && config.requireSubtitle === true) {
    issues.push({
      ...copy.missing_subtitle_when_context_requires,
      id: 'missing_subtitle_when_context_requires',
      severity: 'warning',
      canAutoFill: false,
      requiresUserConfirmation: false,
      actionType: 'manual_input',
    });
  }

  // ── Caption / Court Identity ───────────────────────────────
  const isSAPCR =
    identity.caseTitleFormat === 'in_interest_of' ||
    (identity.childrenNames?.length ?? 0) > 0 ||
    /sapcr|parent.child|custody|modification/i.test(identity.caseType ?? '');

  if (isSAPCR && (identity.childrenNames?.length ?? 0) === 0) {
    issues.push({
      ...copy.missing_sapcr_child_name,
      id: 'missing_sapcr_child_name',
      severity: 'blocker',
      fieldKey: 'childrenNames',
      suggestedValue: null,
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  if (isSAPCR && identity.caseTitleFormat === 'name_v_name') {
    issues.push({
      ...copy.wrong_caption_format,
      id: 'wrong_caption_format',
      severity: 'blocker',
      currentValue: 'name_v_name',
      suggestedValue: 'in_interest_of',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'choose_suggestion',
    });
  }

  if (isMissing(identity.causeNumber)) {
    issues.push({
      ...copy.missing_cause_number,
      id: 'missing_cause_number',
      severity: 'blocker',
      fieldKey: 'causeNumber',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  if (isMissing(identity.judicialDistrict)) {
    issues.push({
      ...copy.missing_judicial_district,
      id: 'missing_judicial_district',
      severity: 'blocker',
      fieldKey: 'judicialDistrict',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  if (isMissing(identity.courtName)) {
    issues.push({
      ...copy.missing_court_name,
      id: 'missing_court_name',
      severity: 'blocker',
      fieldKey: 'courtName',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  if (isMissing(identity.county) || isMissing(identity.state)) {
    issues.push({
      ...copy.missing_county_or_state,
      id: 'missing_county_or_state',
      severity: 'blocker',
      fieldKey: 'county',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  // ── Filing party ───────────────────────────────────────────
  if (isMissing(identity.filingPartyLegalName) || !identity.filingPartyRole) {
    issues.push({
      ...copy.missing_filing_party_role,
      id: 'missing_filing_party_role',
      severity: 'blocker',
      canAutoFill: true,
      requiresUserConfirmation: true,
      actionType: 'autofill_from_profile',
    });
  }

  // ── Motion-specific ────────────────────────────────────────
  if (INTRO_REQUIRED_KINDS.has(documentKind)) {
    const hasIntro = /comes\s+now/i.test(allText);
    if (!hasIntro) {
      issues.push({
        ...copy.missing_motion_intro,
        id: 'missing_motion_intro',
        severity: 'blocker',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'regenerate_structure',
      });
    }
  }

  if (PRAYER_REQUIRED_KINDS.has(documentKind)) {
    const hasPrayer = /\bPRAYER\b/i.test(allText) ||
      /\bWHEREFORE\b/i.test(allText);
    if (!hasPrayer) {
      issues.push({
        ...copy.missing_prayer,
        id: 'missing_prayer',
        severity: 'blocker',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'regenerate_structure',
      });
    }
  }

  if (CERTIFICATE_REQUIRED_KINDS.has(documentKind)) {
    const hasCert = /CERTIFICATE\s+OF\s+SERVICE/i.test(allText);
    if (!hasCert) {
      issues.push({
        ...copy.missing_certificate,
        id: 'missing_certificate',
        severity: 'blocker',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'regenerate_structure',
      });
    }
  }

  // ── Signature enforcement ──────────────────────────────────
  if (identity.isProSe === true) {
    // Pro se must have signature block
    const hasProSeSignature =
      /Pro\s+Se/i.test(allText) &&
      /_{3,}/.test(allText);  // signature line
    if (!hasProSeSignature) {
      issues.push({
        ...copy.missing_signature_block,
        id: 'missing_signature_block',
        severity: 'blocker',
        canAutoFill: true,
        requiresUserConfirmation: false,
        actionType: 'autofill_from_profile',
      });
    }

    // Pro se must not have attorney language
    if (/Attorney\s+for\b/i.test(allText) || /Counsel\s+for\b/i.test(allText) || /\bBar\s+No\b/i.test(allText)) {
      issues.push({
        ...copy.attorney_language_in_pro_se,
        id: 'attorney_language_in_pro_se',
        severity: 'blocker',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'block_until_fixed',
      });
    }
  } else if (identity.isProSe === false) {
    // Represented must not have pro se language
    if (/\bPro\s+Se\b/i.test(allText) || /appearing\s+pro\s+se/i.test(allText)) {
      issues.push({
        ...copy.pro_se_language_with_counsel,
        id: 'pro_se_language_with_counsel',
        severity: 'blocker',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'block_until_fixed',
      });
    }

    // Represented with missing attorney signature → warning + confirmation
    const hasAttorneyBlock =
      /Attorney\s+for\b/i.test(allText) ||
      /\[Attorney\s+signature\s+block/i.test(allText);
    if (!hasAttorneyBlock) {
      issues.push({
        ...copy.missing_attorney_signature,
        id: 'missing_attorney_signature',
        severity: 'warning',
        canAutoFill: false,
        requiresUserConfirmation: true,
        actionType: 'manual_input',
      });
    }
  }

  // ── Content quality ────────────────────────────────────────
  // Duplicate content (>80 chars normalized match)
  if (reviewItemTexts && reviewItemTexts.length > 1) {
    const normalized = reviewItemTexts.map(t =>
      t.toLowerCase().replace(/\s+/g, ' ').replace(/[""'']/g, '"').replace(/[–—]/g, '-').trim()
    );
    const seen = new Set<string>();
    let hasDupes = false;
    for (const n of normalized) {
      if (n.length > 80 && seen.has(n)) {
        hasDupes = true;
        break;
      }
      if (n.length > 80) seen.add(n);
    }
    if (hasDupes) {
      issues.push({
        ...copy.duplicate_section_content,
        id: 'duplicate_section_content',
        severity: 'warning',
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'regenerate_structure',
      });
    }
  }

  // ── Placeholder / metadata leak ────────────────────────────
  for (const forbidden of FORBIDDEN_VISIBLE_TEXT) {
    if (allText.includes(forbidden)) {
      issues.push({
        ...copy.placeholder_text_detected,
        id: 'placeholder_text_detected',
        severity: 'blocker',
        currentValue: forbidden,
        canAutoFill: false,
        requiresUserConfirmation: false,
        actionType: 'block_until_fixed',
      });
      break; // One issue for all placeholder detections
    }
  }

  // Check for internal values with word boundaries (avoids false positives)
  if (FORBIDDEN_WORD_PATTERNS.test(allText)) {
    issues.push({
      ...copy.placeholder_text_detected,
      id: 'placeholder_text_detected',
      severity: 'blocker',
      currentValue: allText.match(FORBIDDEN_WORD_PATTERNS)?.[0] ?? 'internal value',
      canAutoFill: false,
      requiresUserConfirmation: false,
      actionType: 'block_until_fixed',
    });
  }

  // Metadata leak: internal JSON/code patterns in visible text
  if (/\b(nodeId|nodeType|classifiedNodes|sentenceClassifications|exportRelevance)\b/.test(allText)) {
    issues.push({
      ...copy.internal_metadata_leak_detected,
      id: 'internal_metadata_leak_detected',
      severity: 'blocker',
      canAutoFill: false,
      requiresUserConfirmation: false,
      actionType: 'block_until_fixed',
    });
  }

  // ── Sort by modal priority ─────────────────────────────────
  issues.sort((a, b) => {
    const modeA = ISSUE_TO_MODE[a.id];
    const modeB = ISSUE_TO_MODE[b.id];
    return MODE_PRIORITY.indexOf(modeA) - MODE_PRIORITY.indexOf(modeB);
  });

  return issues;
}

/**
 * Determine which ClarificationModal mode to show first
 * based on the highest-priority issue.
 */
export function determineClarificationMode(
  issues: CourtDocumentIssue[],
): ClarificationModalMode | null {
  if (issues.length === 0) return null;
  // Issues are already sorted by priority
  return ISSUE_TO_MODE[issues[0].id];
}
