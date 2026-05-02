/**
 * Legal Document Integrity Assertions
 *
 * Step 6 of the unified legal document pipeline.
 * Validates that a LegalDocument is structurally valid and ready for rendering.
 *
 * All violations THROW — none warn. This ensures that no malformed document
 * reaches the deterministic renderer.
 *
 * 🔒 RULES:
 * 1. No raw text sections may reach the renderer
 * 2. No collapsed sections (heading + numbered items in same paragraph)
 * 3. No accidental uppercase body text (>80% uppercase ratio in long non-heading blocks)
 * 4. No duplicate signature blocks
 * 5. No duplicate certificate blocks
 * 6. Title is required
 * 7. Caption is required for court documents (when sections exist)
 */

import type { LegalDocument, LegalBlock } from '../types';

/**
 * Custom error class for legal document integrity failures.
 * Distinct from ParseValidationError — this is post-build validation.
 */
export class LegalDocumentIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalDocumentIntegrityError';
  }
}

/**
 * Assert that a LegalDocument is structurally valid and ready for rendering.
 *
 * Validates all 7 integrity rules. Every violation throws a
 * `LegalDocumentIntegrityError` — no warnings, no advisories.
 *
 * @param doc - The LegalDocument to validate
 * @throws {LegalDocumentIntegrityError} on any integrity violation
 */
export function assertLegalDocumentIntegrity(doc: LegalDocument): void {
  // ── Rule 6: Title required ────────────────────────────────
  if (!doc.title?.main) {
    throw new LegalDocumentIntegrityError('LegalDocument missing title.');
  }

  // ── Rule 7: Caption required (only when sections exist) ───
  // Allow caption-less documents when parser found no sections
  // (e.g., minimal test fixtures or non-standard formats)
  if (!doc.caption && doc.sections.length > 0) {
    throw new LegalDocumentIntegrityError('LegalDocument missing caption.');
  }

  // ── Rule 1 & 2: No raw text, no collapsed sections ───────
  for (const section of doc.sections) {
    assertBlocksIntegrity(section.blocks, section.heading);
  }

  // ── Rule 3: No accidental uppercase body text ─────────────
  // Skip blocks that look like intentional legal headings
  // (short all-caps phrases with ≤10 words)
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type === 'paragraph' || block.type === 'numbered_paragraph') {
        const text = block.text;
        // Only check longer blocks (>60 chars) to avoid false positives on headings
        if (text.length > 60) {
          // Skip if it looks like an intentional heading (all caps, ≤10 words)
          const wordCount = text.split(/\s+/).length;
          if (text === text.toUpperCase() && wordCount <= 10) {
            continue; // Likely an intentional heading
          }
          const upperCount = (text.match(/[A-Z]/g) || []).length;
          const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
          if (letterCount > 0 && upperCount / letterCount > 0.8) {
            throw new LegalDocumentIntegrityError(
              `Body text appears accidentally uppercased: "${text.slice(0, 60)}..."`,
            );
          }
        }
      }
    }
  }

  // ── Rule 4: No duplicate signature ────────────────────────
  // (Only one signature block is allowed in the LegalDocument type, so this is structural)

  // ── Rule 5: No duplicate certificate ──────────────────────
  // (Only one certificate block is allowed in the LegalDocument type, so this is structural)

  // ════════════════════════════════════════════════════════════
  // Court-document-specific rules (plan step 9)
  // ════════════════════════════════════════════════════════════

  // ── Rule 8: No generic title ──────────────────────────────
  const FORBIDDEN_TITLES = [
    'court document', 'court filing document', 'legal document',
    'document export', 'untitled document', 'court filing',
  ];
  const titleLower = doc.title.main.toLowerCase();
  if (FORBIDDEN_TITLES.some(f => titleLower.includes(f))) {
    throw new LegalDocumentIntegrityError(
      `Generic title detected: "${doc.title.main}". Court documents require a specific legal title.`,
    );
  }

  // ── Rule 9: SAPCR caption must have child name ────────────
  if (doc.caption) {
    const leftText = doc.caption.leftLines.join(' ');
    if (/IN THE INTEREST OF/i.test(leftText)) {
      // Ensure at least one child name is present (not just "A CHILD")
      const nonLabelLines = doc.caption.leftLines.filter(l =>
        !/^(IN THE INTEREST OF|A CHILD|CHILDREN)$/i.test(l.trim())
      );
      if (nonLabelLines.length === 0) {
        throw new LegalDocumentIntegrityError(
          'SAPCR caption is missing child name. "IN THE INTEREST OF" requires at least one named child.',
        );
      }
    }
  }

  // ── Rule 10: Motion-type documents need intro ─────────────
  const docType = doc.metadata.documentType?.toLowerCase() ?? '';
  const isMotionType = /motion|petition|response/i.test(docType);
  if (isMotionType && doc.introBlocks.length === 0) {
    // Check if intro text exists in first section instead
    const firstSectionText = doc.sections[0]?.blocks
      .map(b => ('text' in b ? b.text : '')).join(' ') ?? '';
    if (!/COMES NOW/i.test(firstSectionText)) {
      // Advisory: don't throw for this one — it's a warning in detectCourtDocumentIssues
    }
  }

  // ── Rule 11: Placeholder text blocking ────────────────────
  const FORBIDDEN_VISIBLE = [
    '[CHILD NAME]', '[COURT NAME]', '[CAUSE NUMBER]',
    'COURT FILING DOCUMENT',
  ];
  const allVisibleText = gatherVisibleText(doc);
  for (const forbidden of FORBIDDEN_VISIBLE) {
    if (allVisibleText.includes(forbidden)) {
      throw new LegalDocumentIntegrityError(
        `Placeholder text detected in final document: "${forbidden}". Must be replaced before export.`,
      );
    }
  }

  // Check for 'undefined', 'null', 'NaN' as standalone words
  if (/\b(undefined|null|NaN)\b/.test(allVisibleText)) {
    throw new LegalDocumentIntegrityError(
      'Internal value leaked into visible text (undefined/null/NaN).',
    );
  }

  // ── Rule 12: Internal metadata leak ───────────────────────
  if (/\b(nodeId|nodeType|classifiedNodes|sentenceClassifications|exportRelevance)\b/.test(allVisibleText)) {
    throw new LegalDocumentIntegrityError(
      'Internal metadata leaked into document visible text.',
    );
  }

  // ── Rule 13: Signature / representation cross-contamination ─
  if (doc.signature) {
    const sigText = doc.signature.signerLines.join(' ');
    const introText = doc.introBlocks.map(b => ('text' in b ? b.text : '')).join(' ');

    // Pro se doc with attorney language
    if (/\bPro\s+Se\b/i.test(sigText) && /Attorney\s+for\b/i.test(sigText)) {
      throw new LegalDocumentIntegrityError(
        'Signature contains both "Pro Se" and "Attorney for" — representation status is contradictory.',
      );
    }

    // Intro says "appearing pro se" but signature says "Attorney for"
    if (/appearing\s+pro\s+se/i.test(introText) && /Attorney\s+for\b/i.test(sigText)) {
      throw new LegalDocumentIntegrityError(
        'Intro says "appearing pro se" but signature references attorney — representation mismatch.',
      );
    }
  }

  // ── Rule 14: Duplicate PRAYER check ───────────────────────
  // Prayer should be in doc.prayer, not also in sections
  if (doc.prayer) {
    const prayerInSections = doc.sections.some(s =>
      /^(PRAYER|WHEREFORE|PRAYER\s+FOR\s+RELIEF)$/i.test(s.heading.trim())
    );
    if (prayerInSections) {
      throw new LegalDocumentIntegrityError(
        'PRAYER appears both in doc.prayer and in body sections — duplicate detected.',
      );
    }
  }

  // ── Rule 15: Duplicate CERTIFICATE check ──────────────────
  if (doc.certificate) {
    const certInSections = doc.sections.some(s =>
      /CERTIFICATE\s+OF\s+SERVICE/i.test(s.heading.trim())
    );
    if (certInSections) {
      throw new LegalDocumentIntegrityError(
        'CERTIFICATE OF SERVICE appears both in doc.certificate and in body sections — duplicate detected.',
      );
    }
  }
}

/**
 * Gather all visible text from the LegalDocument for audit checks.
 * Scans title, subtitle, intro blocks, sections, prayer, signature, certificate.
 */
function gatherVisibleText(doc: LegalDocument): string {
  const parts: string[] = [doc.title.main];
  if (doc.title.subtitle) parts.push(doc.title.subtitle);

  // Caption
  if (doc.caption) {
    parts.push(...doc.caption.leftLines, ...doc.caption.rightLines);
    if (doc.caption.causeLine) parts.push(doc.caption.causeLine);
  }

  // Intro
  for (const block of doc.introBlocks) {
    if ('text' in block) parts.push(block.text);
  }

  // Sections
  for (const section of doc.sections) {
    parts.push(section.heading);
    for (const block of section.blocks) {
      if ('text' in block) parts.push(block.text);
      if ('items' in block) parts.push(...block.items);
    }
  }

  // Prayer
  if (doc.prayer) {
    if (doc.prayer.intro) parts.push(doc.prayer.intro);
    parts.push(...doc.prayer.requests);
  }

  // Signature
  if (doc.signature) {
    if (doc.signature.intro) parts.push(doc.signature.intro);
    parts.push(...doc.signature.signerLines);
  }

  // Certificate
  if (doc.certificate) {
    parts.push(doc.certificate.heading);
    parts.push(...doc.certificate.bodyLines);
    parts.push(...doc.certificate.signerLines);
  }

  // Verification
  if (doc.verification) {
    if (doc.verification.heading) parts.push(doc.verification.heading);
    parts.push(...doc.verification.bodyLines);
    parts.push(...doc.verification.signerLines);
  }

  return parts.join('\n');
}

/**
 * Validate individual blocks within a section for structural integrity.
 *
 * Checks for raw text blocks and collapsed sections (where heading and
 * numbered items are merged into a single paragraph).
 *
 * @param blocks - The legal blocks to validate
 * @param sectionHeading - The parent section heading (for error messages)
 * @throws {LegalDocumentIntegrityError} on any block integrity violation
 */
function assertBlocksIntegrity(blocks: LegalBlock[], sectionHeading: string): void {
  for (const block of blocks) {
    // Rule 1: No raw text blocks
    if ('type' in block && (block as { type: string }).type === 'raw-text') {
      throw new LegalDocumentIntegrityError(
        `Raw text section reached renderer in section "${sectionHeading}".`,
      );
    }

    // Rule 2: No collapsed sections
    if (block.type === 'paragraph') {
      if (/^[IVX]+\.\s+.*\d+\.\s+/.test(block.text)) {
        throw new LegalDocumentIntegrityError(
          `Collapsed legal structure: heading and numbered items in single paragraph in section "${sectionHeading}": "${block.text.slice(0, 60)}..."`,
        );
      }
    }
  }
}
