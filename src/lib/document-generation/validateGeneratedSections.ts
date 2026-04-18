/**
 * Generated Sections Validator
 *
 * Validates and cleans GeneratedSection[] before they reach the renderer.
 * Guarantees at least one visible body section — never returns empty.
 */

import type { GeneratedSection, SectionType } from '@/lib/legal/types';

const VALID_SECTION_TYPES: SectionType[] = [
  'introduction', 'body_sections', 'body_numbered', 'prayer_for_relief',
];

/**
 * Validate and clean generated sections.
 *
 * - Removes sections with invalid sectionType
 * - Strips whitespace-only content
 * - Ensures body_numbered has numberedItems
 * - If result is empty, returns a single fallback body_sections
 *
 * @param sections - The sections to validate
 * @param fallbackText - Text to use if all sections are empty (defaults to placeholder)
 */
export function validateGeneratedSections(
  sections: GeneratedSection[],
  fallbackText?: string,
): GeneratedSection[] {
  const valid = sections.filter(s => {
    // Must have a recognized sectionType
    if (!VALID_SECTION_TYPES.includes(s.sectionType)) return false;

    // body_numbered must have items
    if (s.sectionType === 'body_numbered') {
      return Array.isArray(s.numberedItems) && s.numberedItems.length > 0;
    }

    // introduction and prayer_for_relief must have content
    if (s.sectionType === 'introduction' || s.sectionType === 'prayer_for_relief') {
      return typeof s.content === 'string' && s.content.trim().length > 0;
    }

    // body_sections: allow heading-only blocks (transitional headings)
    if (s.sectionType === 'body_sections') {
      const hasContent = typeof s.content === 'string' && s.content.trim().length > 0;
      const hasHeading = typeof s.heading === 'string' && s.heading.trim().length > 0;
      return hasContent || hasHeading;
    }

    return false;
  });

  // ── Fallback: never return empty ──
  if (valid.length === 0) {
    return [{
      sectionType: 'body_sections',
      heading: 'Content',
      content: fallbackText?.trim() || '[No content provided]',
    }];
  }

  return valid;
}
