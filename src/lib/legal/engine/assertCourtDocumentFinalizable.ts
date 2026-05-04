/**
 * Court Document Finalization Guard
 *
 * THE HARD BLOCKER — runs after HTML rendering but before PDF generation.
 * Inspects the final rendered HTML AND a text-normalized version of the
 * document to enforce the Legal Document Finalization Contract.
 *
 * This guard applies ONLY to final court PDF export. Drafting, review,
 * and revision remain flexible.
 *
 * Enforcement sequence:
 *   resolve identity → render HTML → assertCourtDocumentFinalizable → generate PDF → upload
 *
 * If this function throws, NO PDF is generated, NO file is saved,
 * and the user is returned to the resolution step.
 *
 * @module assertCourtDocumentFinalizable
 */

import {
  PLACEHOLDER_BRACKET_PATTERNS,
  GENERIC_PARTY_LABEL_PATTERNS,
  REQUIRED_FIELDS_BY_DOCUMENT_CONTEXT,
  ALLOW_MISSING_CAUSE_NUMBER_FOR_NEW_CASE,
} from './legalDocumentContract';
import type { FinalizationGuardResult, FinalizationError } from './documentReadiness';
import type { CourtIdentity } from '@/lib/exports/resolveCourtIdentity';

// ═══════════════════════════════════════════════════════════════
// HTML → Text Extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract visible text from HTML by stripping tags.
 * Lightweight — no DOM parser needed for pattern scanning.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Section Extraction (for contextual generic label detection)
// ═══════════════════════════════════════════════════════════════

/**
 * Extract identity-critical sections from HTML for contextual scanning.
 * Generic party labels are only blocked in these sections, not in body text.
 */
function extractIdentityCriticalText(html: string): string {
  const sections: string[] = [];

  // Caption section — typically the first major section
  const captionMatch = html.match(
    /(?:<div[^>]*class="[^"]*caption[^"]*"[^>]*>)([\s\S]*?)(?:<\/div>)/i,
  );
  if (captionMatch) sections.push(captionMatch[1]);

  // Certificate of service
  const certMatch = html.match(
    /CERTIFICATE\s+OF\s+SERVICE[\s\S]*?(?=<div|<section|$)/i,
  );
  if (certMatch) sections.push(certMatch[0]);

  // Signature block — look for signature line patterns
  const sigMatch = html.match(
    /_{5,}[\s\S]*?(?:Pro\s+Se|Attorney|Esquire|Bar\s+No)/i,
  );
  if (sigMatch) sections.push(sigMatch[0]);

  // Verification/jurat
  const verifMatch = html.match(
    /(?:VERIFICATION|JURAT|SWORN\s+TO)[\s\S]*?(?=<div|<section|$)/i,
  );
  if (verifMatch) sections.push(verifMatch[0]);

  return sections.join(' ');
}

// ═══════════════════════════════════════════════════════════════
// Field Resolution Helper
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a dot-path field identifier against the CourtIdentity.
 * Maps field paths like "petitioner.name" to actual resolved values.
 */
function resolveFieldValue(
  fieldPath: string,
  identity: CourtIdentity,
): string | undefined {
  const map: Record<string, string | undefined> = {
    'petitioner.name': identity.captionPetitionerName,
    'respondent.name': identity.captionRespondentName,
    'child.name': identity.childrenNames?.[0],
    'court.county': identity.county,
    'court.name': identity.courtName,
    'case.causeNumber': identity.causeNumber,
    'filingParty.name': identity.filingPartyLegalName,
    'servedParty.name': identity.opposingPartyLegalName,
    'service.method': undefined, // Handled by ClarificationModal, not identity
  };
  return map[fieldPath];
}

// ═══════════════════════════════════════════════════════════════
// Document Context Key Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a document context key for required field lookup.
 * Combines export path + case type for precise field requirements.
 */
function buildContextKey(
  exportPath: string,
  caseType: string,
): string {
  const normalized = caseType.toLowerCase().replace(/[\s-]+/g, '_');

  // Try specific key first, then general fallbacks
  const candidates = [
    `court_pleading_${normalized}`,
    `${exportPath}_${normalized}`,
    exportPath,
    'court_pleading_general',
  ];

  for (const key of candidates) {
    if (REQUIRED_FIELDS_BY_DOCUMENT_CONTEXT[key]) {
      return key;
    }
  }

  return 'court_pleading_general';
}

// ═══════════════════════════════════════════════════════════════
// Main Guard Function
// ═══════════════════════════════════════════════════════════════

/**
 * Assert that a court document is ready for final PDF generation.
 *
 * Inspects the rendered HTML output AND the resolved identity to enforce
 * the Legal Document Finalization Contract. This guard distinguishes
 * between draft mode and final PDF mode — it only blocks finalization.
 *
 * @param html - The final rendered HTML from the document renderer
 * @param identity - The resolved CourtIdentity with all field sources
 * @param context - Export context (path, case type, initiating filing flag)
 * @returns FinalizationGuardResult — either ok:true or ok:false with errors
 */
export function assertCourtDocumentFinalizable(
  html: string,
  identity: CourtIdentity,
  context: {
    exportPath: string;
    caseType: string;
    /** Set to true for original petitions where no cause number exists yet. */
    isInitiatingFiling?: boolean;
  },
): FinalizationGuardResult {
  const errors: FinalizationError[] = [];

  // ── 1. Scan for bracket placeholders ───────────────────────
  const visibleText = htmlToText(html);

  for (const pattern of PLACEHOLDER_BRACKET_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const match = pattern.exec(visibleText);
    if (match) {
      errors.push({
        message: `Unresolved placeholder detected: "${match[0]}"`,
        location: 'unknown',
        severity: 'blocking',
      });
    }
  }

  // ── 2. Check required identity fields ──────────────────────
  const contextKey = buildContextKey(context.exportPath, context.caseType);
  const requiredFields = REQUIRED_FIELDS_BY_DOCUMENT_CONTEXT[contextKey] ?? [];

  for (const fieldPath of requiredFields) {
    // Allow missing cause number for initiating filings
    if (
      fieldPath === 'case.causeNumber' &&
      context.isInitiatingFiling &&
      ALLOW_MISSING_CAUSE_NUMBER_FOR_NEW_CASE
    ) {
      continue;
    }

    // Skip service.method — handled by ClarificationModal before we get here
    if (fieldPath === 'service.method') continue;

    const value = resolveFieldValue(fieldPath, identity);
    if (!value || value.trim() === '') {
      errors.push({
        field: fieldPath,
        message: `Missing required field: ${fieldPath}`,
        severity: 'blocking',
      });
    }
  }

  // ── 3. Scan identity-critical sections for generic party labels ─
  const criticalText = extractIdentityCriticalText(html);
  if (criticalText.length > 0) {
    const criticalPlainText = htmlToText(criticalText);
    for (const pattern of GENERIC_PARTY_LABEL_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(criticalPlainText);
      if (match) {
        // Determine which section contained the match
        const location = criticalPlainText.includes('CERTIFICATE')
          ? 'certificate' as const
          : criticalPlainText.includes('____')
            ? 'signature' as const
            : 'caption' as const;

        errors.push({
          message: `Generic party label "${match[0]}" used as identity substitute`,
          location,
          severity: 'blocking',
        });
      }
    }
  }

  // ── Result ─────────────────────────────────────────────────
  const blockingErrors = errors.filter(e => e.severity === 'blocking');

  if (blockingErrors.length === 0) {
    return { ok: true, readiness: 'ready_for_final_pdf' };
  }

  // Determine the primary readiness blocker category
  const hasPlaceholders = blockingErrors.some(e =>
    e.message.includes('placeholder'),
  );
  const hasMissingFields = blockingErrors.some(e =>
    e.message.includes('Missing required field'),
  );
  const hasGenericLabels = blockingErrors.some(e =>
    e.message.includes('Generic party label'),
  );

  const readiness = hasPlaceholders
    ? 'blocked_placeholders_present' as const
    : hasMissingFields
      ? 'blocked_missing_required_fields' as const
      : hasGenericLabels
        ? 'blocked_generic_party_labels' as const
        : 'blocked_silent_fallbacks' as const;

  return {
    ok: false,
    readiness,
    code: 'DOCUMENT_NOT_FINALIZABLE',
    errors: blockingErrors,
  };
}
