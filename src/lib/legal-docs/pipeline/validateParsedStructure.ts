/**
 * Parsed Structure Validator
 *
 * Step 4: Validates parser output before building LegalDocument.
 * All checks throw — none warn.
 */

import type { ParsedLegalDocument } from './parseLegalDocumentStructure';

export class ParseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseValidationError';
  }
}

/**
 * Validate parsed legal document structure.
 * Throws ParseValidationError on any structural issue.
 */
export function validateParsedStructure(parsed: ParsedLegalDocument): void {
  // At least one section must be detected
  if (parsed.sections.length === 0 && !parsed.prayer) {
    throw new ParseValidationError(
      'No structured sections detected. The document may not contain recognizable legal structure.',
    );
  }

  // Check for collapsed headings (heading text containing numbered items)
  for (const section of parsed.sections) {
    if (/^\d+\.\s+/.test(section.heading)) {
      throw new ParseValidationError(
        `Collapsed structure detected: section heading contains numbered item: "${section.heading.slice(0, 60)}..."`,
      );
    }
    for (const block of section.blocks) {
      if (block.type === 'paragraph' && /^[IVX]+\.\s+.*\d+\.\s+/.test(block.text)) {
        throw new ParseValidationError(
          `Collapsed structure: heading and numbered items found in single paragraph: "${block.text.slice(0, 60)}..."`,
        );
      }
    }
  }
}
