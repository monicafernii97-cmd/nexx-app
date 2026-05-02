/**
 * Legal Document Integrity Assertions
 *
 * Step 6: Hard fail rules. All violations THROW — none warn.
 *
 * 🔒 RULES:
 * 1. No raw text sections may reach the renderer
 * 2. No collapsed sections (heading + numbered items in same paragraph)
 * 3. No accidental uppercase body text (>80% uppercase ratio)
 * 4. No duplicate signature blocks
 * 5. No duplicate certificate blocks
 * 6. Title is required
 * 7. Caption is required for court documents
 */

import type { LegalDocument, LegalBlock } from '../types';

export class LegalDocumentIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegalDocumentIntegrityError';
  }
}

/**
 * Assert that a LegalDocument is structurally valid and ready for rendering.
 * Throws LegalDocumentIntegrityError on any violation.
 */
export function assertLegalDocumentIntegrity(doc: LegalDocument): void {
  // ── Rule 6: Title required ────────────────────────────────
  if (!doc.title?.main) {
    throw new LegalDocumentIntegrityError('LegalDocument missing title.');
  }

  // ── Rule 7: Caption required ──────────────────────────────
  if (!doc.caption) {
    throw new LegalDocumentIntegrityError('LegalDocument missing caption.');
  }

  // ── Rule 1 & 2: No raw text, no collapsed sections ───────
  for (const section of doc.sections) {
    assertBlocksIntegrity(section.blocks, section.heading);
  }

  // ── Rule 3: No accidental uppercase body text ─────────────
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type === 'paragraph' || block.type === 'numbered_paragraph') {
        const text = block.text;
        if (text.length > 30) {
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
