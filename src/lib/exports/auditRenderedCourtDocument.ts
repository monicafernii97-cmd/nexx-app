/**
 * Court Document Rendered Audit
 *
 * Post-render audits for court document HTML and PDF text.
 *
 * Invariant 7: Audit scans visible body text only.
 * Does NOT scan raw HTML class names, CSS, or internal variables.
 *
 * @module auditRenderedCourtDocument
 */

// ═══════════════════════════════════════════════════════════════
// Blocked Text
// ═══════════════════════════════════════════════════════════════

/**
 * Strings that must never appear in final visible text.
 * Presence of any blocker prevents PDF export.
 */
const BLOCKED_VISIBLE_TEXT = [
  '[CHILD NAME]',
  '[COURT NAME]',
  '[CAUSE NUMBER]',
  'COURT FILING DOCUMENT',
  'court_document',
  'personal_injury',
];

/**
 * Patterns that must never appear as standalone words in visible text.
 */
const BLOCKED_PATTERNS = /\b(undefined|null|NaN)\b/;

/**
 * Structural elements that should appear exactly once.
 */
const ONCE_ONLY_HEADINGS = [
  /\bPRAYER\b/g,
  /\bCERTIFICATE\s+OF\s+SERVICE\b/gi,
];

// ═══════════════════════════════════════════════════════════════
// Audit Result
// ═══════════════════════════════════════════════════════════════

export type AuditViolation = {
  rule: string;
  detail: string;
  severity: 'blocker' | 'warning';
};

export type AuditResult = {
  passed: boolean;
  violations: AuditViolation[];
};

// ═══════════════════════════════════════════════════════════════
// HTML Audit
// ═══════════════════════════════════════════════════════════════

/**
 * Audit rendered HTML for court document compliance.
 *
 * Scans visible body text only — strips HTML tags to get plain text,
 * then checks against blocked strings, patterns, and structural rules.
 *
 * Does NOT scan class names, CSS, or internal attributes.
 */
export function auditCourtHTML(html: string): AuditResult {
  const violations: AuditViolation[] = [];

  // Extract visible text by stripping HTML tags
  // Only scan text content, not attributes/CSS
  const visibleText = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // remove style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // remove script blocks
    .replace(/<[^>]+>/g, ' ')                         // strip tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Check blocked visible text
  for (const blocked of BLOCKED_VISIBLE_TEXT) {
    if (visibleText.includes(blocked)) {
      violations.push({
        rule: 'placeholder_text',
        detail: `Blocked text found in rendered HTML: "${blocked}"`,
        severity: 'blocker',
      });
    }
  }

  // Check blocked patterns
  if (BLOCKED_PATTERNS.test(visibleText)) {
    violations.push({
      rule: 'internal_value_leak',
      detail: 'Internal value (undefined/null/NaN) found in rendered HTML.',
      severity: 'blocker',
    });
  }

  // Check structural once-only headings
  for (const pattern of ONCE_ONLY_HEADINGS) {
    const matches = visibleText.match(pattern);
    if (matches && matches.length > 1) {
      violations.push({
        rule: 'duplicate_structural_heading',
        detail: `"${matches[0]}" appears ${matches.length} times — should appear exactly once.`,
        severity: 'blocker',
      });
    }
  }

  // Check representation/signature consistency
  const hasProSe = /\bPro\s+Se\b/i.test(visibleText);
  const hasAttorneyFor = /Attorney\s+for\b/i.test(visibleText);
  if (hasProSe && hasAttorneyFor) {
    violations.push({
      rule: 'signature_representation_mismatch',
      detail: 'Document contains both "Pro Se" and "Attorney for" language — representation status is contradictory.',
      severity: 'blocker',
    });
  }

  return {
    passed: violations.every(v => v.severity !== 'blocker'),
    violations,
  };
}

// ═══════════════════════════════════════════════════════════════
// PDF Text Audit
// ═══════════════════════════════════════════════════════════════

/**
 * Audit extracted PDF text for court document compliance.
 *
 * Uses actual extracted text from the rendered PDF (via pdf-parse or similar).
 * This is the final safety net before the document is returned to the user.
 */
export function auditCourtPDFText(pdfText: string): AuditResult {
  const violations: AuditViolation[] = [];

  // Check blocked visible text
  for (const blocked of BLOCKED_VISIBLE_TEXT) {
    if (pdfText.includes(blocked)) {
      violations.push({
        rule: 'pdf_placeholder_text',
        detail: `Blocked text found in final PDF: "${blocked}"`,
        severity: 'blocker',
      });
    }
  }

  // Check blocked patterns
  if (BLOCKED_PATTERNS.test(pdfText)) {
    violations.push({
      rule: 'pdf_internal_value_leak',
      detail: 'Internal value (undefined/null/NaN) found in final PDF text.',
      severity: 'blocker',
    });
  }

  // Check structural once-only headings
  for (const pattern of ONCE_ONLY_HEADINGS) {
    const matches = pdfText.match(pattern);
    if (matches && matches.length > 1) {
      violations.push({
        rule: 'pdf_duplicate_heading',
        detail: `"${matches[0]}" appears ${matches.length} times in PDF — should appear exactly once.`,
        severity: 'blocker',
      });
    }
  }

  // Signature/representation consistency
  const hasProSe = /\bPro\s+Se\b/i.test(pdfText);
  const hasAttorneyFor = /Attorney\s+for\b/i.test(pdfText);
  if (hasProSe && hasAttorneyFor) {
    violations.push({
      rule: 'pdf_signature_mismatch',
      detail: 'PDF contains both "Pro Se" and "Attorney for" — representation mismatch.',
      severity: 'blocker',
    });
  }

  return {
    passed: violations.every(v => v.severity !== 'blocker'),
    violations,
  };
}
