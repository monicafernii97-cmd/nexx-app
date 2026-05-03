/**
 * Export Document Validator
 *
 * Two-stage validation:
 * 1. Structure + path-specific blockers/warnings (before rendering)
 * 2. PDF buffer validation (after rendering, via validatePdfBuffer)
 *
 * This file implements stage 1. Stage 2 is handled by validatePdfBuffer
 * in src/lib/pdf/validatePdf.ts.
 */

import type { CanonicalExportDocument, ExportPath } from './types';
import { FORBIDDEN_VISIBLE_TEXT } from './courtDocumentIssues';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Severity for validation issues. */
export type ExportValidationSeverity = 'blocker' | 'warning';

/** A single validation issue. */
export type ExportValidationIssue = {
  id: string;
  severity: ExportValidationSeverity;
  message: string;
};

/** Result of export document validation. */
export type ExportValidationResult = {
  issues: ExportValidationIssue[];
  blockerCount: number;
  warningCount: number;
  canProceed: boolean;
};

// ═══════════════════════════════════════════════════════════════
// Validator
// ═══════════════════════════════════════════════════════════════

/**
 * Validate a CanonicalExportDocument for structural completeness.
 *
 * Must run BEFORE the document is sent to renderers.
 * Returns blockers (generation stops) and warnings (advisory).
 *
 * @param doc - The canonical export document
 * @returns Validation result with issues list and canProceed flag
 */
export function validateExportDocument(
  doc: CanonicalExportDocument,
): ExportValidationResult {
  const issues: ExportValidationIssue[] = [];

  // ── Common checks ──
  if (!doc.title?.trim()) {
    issues.push({
      id: 'missing_title',
      severity: 'warning',
      message: 'Document has no title. A default title will be used.',
    });
  }

  if (doc.sections.length === 0) {
    issues.push({
      id: 'no_sections',
      severity: 'blocker',
      message: 'Document has no sections. Cannot render an empty export.',
    });
  }

  // ── Path-specific checks ──
  const pathChecks = getPathChecks(doc.path);
  for (const check of pathChecks) {
    const issue = check(doc);
    if (issue) issues.push(issue);
  }

  const blockerCount = issues.filter((i) => i.severity === 'blocker').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    issues,
    blockerCount,
    warningCount,
    canProceed: blockerCount === 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// Path-Specific Check Registries
// ═══════════════════════════════════════════════════════════════

type CheckFn = (doc: CanonicalExportDocument) => ExportValidationIssue | null;

function getPathChecks(path: ExportPath): CheckFn[] {
  switch (path) {
    case 'court_document':
      return courtChecks;
    case 'exhibit_document':
      return exhibitChecks;
    case 'timeline_summary':
    case 'incident_report':
      return timelineChecks;
    case 'case_summary':
    default:
      return summaryChecks;
  }
}

// ── Court Document Checks ──

/** Check if jurisdiction indicates a federal court. */
function isFederalCourt(jurisdiction?: { courtType?: string; courtName?: string }): boolean {
  const name = jurisdiction?.courtName?.toLowerCase() ?? '';
  return !!(
    jurisdiction?.courtType === 'federal' ||
    name.includes('united states district court') ||
    name.includes('u.s. district court') ||
    name.includes('usdc')
  );
}

/**
 * Titles that indicate a generic/template title leaked through.
 * Must match courtDocumentIssues.ts FORBIDDEN_TITLES.
 */
const FORBIDDEN_COURT_TITLES = [
  'court document',
  'court filing document',
  'legal document',
  'document export',
  'untitled document',
  'court filing',
];

/**
 * Document kinds that require a prayer section.
 * Must match courtDocumentIssues.ts PRAYER_REQUIRED_KINDS.
 */
const PRAYER_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'petition',
]);

/**
 * Document kinds that require a certificate of service.
 * Must match courtDocumentIssues.ts CERTIFICATE_REQUIRED_KINDS.
 */
const CERTIFICATE_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'response', 'petition', 'objection',
]);

const courtChecks: CheckFn[] = [
  // ── Title checks ──────────────────────────────────────────
  (doc) => {
    if (!doc.title?.trim()) {
      return {
        id: 'court_missing_title',
        severity: 'blocker',
        message: 'Court document has no title.',
      };
    }
    return null;
  },
  (doc) => {
    if (doc.title && FORBIDDEN_COURT_TITLES.some(f => doc.title!.toLowerCase().includes(f))) {
      return {
        id: 'court_generic_title',
        severity: 'blocker',
        message: `Court document has a generic/forbidden title: "${doc.title}".`,
      };
    }
    return null;
  },

  // ── Caption checks ────────────────────────────────────────
  (doc) => {
    if (!doc.caption) {
      return {
        id: 'court_missing_caption',
        severity: 'blocker',
        message: 'Court document has no caption.',
      };
    }
    return null;
  },
  (doc) => {
    if (!doc.metadata.causeNumber?.trim()) {
      return {
        id: 'court_missing_cause_number',
        severity: 'blocker',
        message: 'Court document has no cause number.',
      };
    }
    return null;
  },

  // ── Jurisdiction ──────────────────────────────────────────
  (doc) => {
    if (!isFederalCourt(doc.metadata.jurisdiction) && !doc.metadata.jurisdiction?.state) {
      return {
        id: 'court_missing_state',
        severity: 'warning',
        message: 'No state jurisdiction set. Default formatting will be used.',
      };
    }
    return null;
  },
  (doc) => {
    if (!isFederalCourt(doc.metadata.jurisdiction) && !doc.metadata.jurisdiction?.county?.trim()) {
      return {
        id: 'court_missing_county',
        severity: 'warning',
        message: 'No county set for state-level court document.',
      };
    }
    return null;
  },

  // ── Body sections ─────────────────────────────────────────
  (doc) => {
    const courtSections = doc.sections.filter((s) => s.kind === 'court_section');
    if (courtSections.length === 0) {
      return {
        id: 'court_no_body_sections',
        severity: 'blocker',
        message: 'Court document has no body sections.',
      };
    }
    return null;
  },

  // ── Prayer (kind-aware) ───────────────────────────────────
  (doc) => {
    const kind = doc.metadata.documentType ?? '';
    if (PRAYER_REQUIRED_KINDS.has(kind)) {
      const hasPrayer = doc.sections.some(
        (s) => s.heading && /^(prayer|prayer\s+for\s+relief|wherefore)/i.test(s.heading.trim()),
      );
      // Also check for structured prayer in metadata
      const hasStructuredPrayer =
        (doc.metadata as Record<string, unknown>).prayerRequests != null;
      if (!hasPrayer && !hasStructuredPrayer) {
        return {
          id: 'court_missing_prayer',
          severity: 'warning',
          message: `Document type "${kind}" typically requires a prayer section.`,
        };
      }
    }
    return null;
  },

  // ── Certificate (kind-aware) ──────────────────────────────
  (doc) => {
    const kind = doc.metadata.documentType ?? '';
    if (CERTIFICATE_REQUIRED_KINDS.has(kind)) {
      const hasCert = doc.certificate != null ||
        doc.sections.some(
          (s) => s.heading && /certificate\s+of\s+service/i.test(s.heading.trim()),
        );
      if (!hasCert) {
        return {
          id: 'court_missing_certificate',
          severity: 'warning',
          message: `Document type "${kind}" typically requires a certificate of service.`,
        };
      }
    }
    return null;
  },

  // ── Signature ─────────────────────────────────────────────
  (doc) => {
    const hasSignature = doc.signature != null;
    const hasSignatureSection = doc.sections.some(
      (s) => s.heading && /signature/i.test(s.heading.trim()),
    );
    if (!hasSignature && !hasSignatureSection) {
      return {
        id: 'court_missing_signature',
        severity: 'warning',
        message: 'Court document has no signature block.',
      };
    }
    return null;
  },

  // ── Placeholder leak scan ─────────────────────────────────
  (doc) => {
    const allText = [
      doc.title ?? '',
      doc.subtitle ?? '',
      // Caption lines
      ...(doc.caption?.leftLines ?? []),
      ...(doc.caption?.centerLines ?? []),
      ...(doc.caption?.rightLines ?? []),
      doc.caption?.causeLine ?? '',
      // Sections
      ...doc.sections.flatMap(s => {
        const parts: string[] = [s.heading ?? ''];
        // Safe access — ExportSection is a union, not all variants have these fields
        const asAny = s as Record<string, unknown>;
        if (typeof asAny.body === 'string') parts.push(asAny.body);
        if (Array.isArray(asAny.paragraphs)) parts.push(...asAny.paragraphs as string[]);
        if (Array.isArray(asAny.numberedItems)) parts.push(...asAny.numberedItems as string[]);
        return parts;
      }),
      // Signature block
      doc.signature?.intro ?? '',
      ...(doc.signature?.signerLines ?? []),
      // Certificate of Service
      doc.certificate?.heading ?? '',
      ...(doc.certificate?.bodyLines ?? []),
      ...(doc.certificate?.signerLines ?? []),
      // Verification
      ...(doc.verification?.bodyLines ?? []),
      ...(doc.verification?.signerLines ?? []),
    ].join(' ');

    // Check for unresolved placeholders (shared constant from courtDocumentIssues)
    const placeholderTokens = FORBIDDEN_VISIBLE_TEXT.filter(t => t.startsWith('['));
    for (const p of placeholderTokens) {
      if (allText.includes(p)) {
        return {
          id: 'court_placeholder_detected',
          severity: 'blocker',
          message: `Unresolved placeholder "${p}" found in document content.`,
        };
      }
    }

    // Check for leaked internal values
    if (/\b(undefined|null|NaN)\b/.test(allText)) {
      return {
        id: 'court_internal_value_leak',
        severity: 'blocker',
        message: 'Internal value (undefined/null/NaN) found in document content.',
      };
    }

    return null;
  },
];

// ── Exhibit Document Checks ──

const exhibitChecks: CheckFn[] = [
  (doc) => {
    if (!doc.exhibitPacket) {
      return {
        id: 'exhibit_no_packet_config',
        severity: 'warning',
        message: 'No exhibit packet configuration. Default settings will be used.',
      };
    }
    return null;
  },
  (doc) => {
    const contentSections = doc.sections.filter(
      (s) => s.kind === 'exhibit_content' || s.kind === 'exhibit_image' || s.kind === 'exhibit_chart',
    );
    if (contentSections.length === 0) {
      return {
        id: 'exhibit_no_content',
        severity: 'blocker',
        message: 'Exhibit packet has no content sections.',
      };
    }
    return null;
  },
];

// ── Summary Checks ──

const summaryChecks: CheckFn[] = [
  (doc) => {
    const summarySections = doc.sections.filter((s) => s.kind === 'summary_section');
    if (summarySections.length === 0) {
      return {
        id: 'summary_no_sections',
        severity: 'warning',
        message: 'Summary has no sections. Output may be minimal.',
      };
    }
    return null;
  },
];

// ── Timeline Checks ──

const timelineChecks: CheckFn[] = [
  (doc) => {
    // Count timeline visual events, dedicated timeline sections,
    // AND narrative summary_sections (adapter emits these for timeline paths)
    const hasEvents =
      (doc.timelineVisual?.events?.length ?? 0) > 0 ||
      doc.sections.some(
        (s) => s.kind === 'timeline_section' || s.kind === 'summary_section',
      );
    if (!hasEvents) {
      return {
        id: 'timeline_no_events',
        severity: 'warning',
        message: 'No timeline events found. Output may be empty.',
      };
    }
    return null;
  },
];
