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
 * Includes internal values AND leaked metadata keys.
 */
const BLOCKED_PATTERNS = /\b(undefined|null|NaN|nodeId|nodeType|classifiedNodes|sentenceClassifications|exportRelevance)\b/;

/**
 * Structural headings that should appear exactly once.
 * These match line-start positions to avoid counting inline mentions
 * like "PRAYER FOR RELIEF" as a second occurrence of "PRAYER".
 */
const ONCE_ONLY_HEADINGS = [
  /(?:^|\n)\s*PRAYER\s*(?:\n|$)/gi,
  /(?:^|\n)\s*CERTIFICATE\s+OF\s+SERVICE\s*(?:\n|$)/gi,
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

  // Extract visible text from <body> only, stripping HTML tags
  // Invariant 7: scope to body to avoid scanning <title>, <head>, etc.
  let bodyContent = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) bodyContent = bodyMatch[1];

  // Build line-preserving text for heading detection
  // (block-level tags → newlines, inline tags → spaces)
  const visibleTextWithLines = bodyContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // remove style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // remove script blocks
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n') // block tags → newlines
    .replace(/<[^>]+>/g, ' ')                         // inline tags → spaces
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, ' ')  // collapse horizontal whitespace only
    .replace(/\n+/g, '\n')      // collapse blank lines
    .trim();

  // Flattened text for substring/regex checks
  const visibleText = visibleTextWithLines.replace(/\s+/g, ' ').trim();

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
      detail: 'Internal value or metadata key found in rendered HTML.',
      severity: 'blocker',
    });
  }

  // Check structural once-only headings (use line-preserving text)
  for (const pattern of ONCE_ONLY_HEADINGS) {
    const matches = visibleTextWithLines.match(pattern);
    if (matches && matches.length > 1) {
      violations.push({
        rule: 'duplicate_structural_heading',
        detail: `"${matches[0].trim()}" appears ${matches.length} times — should appear exactly once.`,
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
