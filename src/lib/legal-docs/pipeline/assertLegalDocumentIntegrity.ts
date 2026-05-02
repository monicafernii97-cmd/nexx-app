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
