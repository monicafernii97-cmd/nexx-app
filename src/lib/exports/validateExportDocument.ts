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

const courtChecks: CheckFn[] = [
  (doc) => {
    if (!doc.metadata.jurisdiction?.state) {
      return {
        id: 'court_missing_state',
        severity: 'warning',
        message: 'No state jurisdiction set. Default formatting will be used.',
      };
    }
    return null;
  },
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
    const hasEvents =
      doc.timelineVisual?.events?.length ||
      doc.sections.some((s) => s.kind === 'timeline_section');
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
