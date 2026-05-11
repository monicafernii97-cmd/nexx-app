import type { DraftedSection } from '@/lib/export-assembly/orchestrator';
import type {
  BulletListBlock,
  LegalDocument,
  LetteredListBlock,
  NumberedListBlock,
  NumberedParagraphBlock,
  ParagraphBlock,
} from '@/lib/legal-docs/types';

/** Convert parsed legal-document sections into export drafted sections without flattening lists. */
export function mapLegalDocumentToDraftedSections(doc: LegalDocument): DraftedSection[] {
  return doc.sections.map((section) => {
    const paragraphs: string[] = [];
    const numberedItems: string[] = [];
    const bulletItems: string[] = [];

    for (const block of section.blocks) {
      if (block.type === 'paragraph') {
        paragraphs.push((block as ParagraphBlock).text);
      } else if (block.type === 'numbered_paragraph') {
        numberedItems.push((block as NumberedParagraphBlock).text);
      } else if (block.type === 'numbered_list') {
        numberedItems.push(...(block as NumberedListBlock).items);
      } else if (block.type === 'bullet_list') {
        bulletItems.push(...(block as BulletListBlock).items);
      } else if (block.type === 'lettered_list') {
        paragraphs.push(...(block as LetteredListBlock).items.map((item, index) => {
          const prefix = String.fromCharCode(65 + index);
          return `${prefix}. ${item}`;
        }));
      }
    }

    return {
      sectionId: section.id,
      heading: section.heading,
      body: paragraphs.join('\n\n'),
      numberedItems,
      bulletItems,
      source: 'user_locked',
    };
  });
}
