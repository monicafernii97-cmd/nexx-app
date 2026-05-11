import type { DraftedSection } from '@/lib/export-assembly/orchestrator';
import type {
  BulletListBlock,
  LegalDocument,
  LetteredListBlock,
  NumberedListBlock,
  NumberedParagraphBlock,
  ParagraphBlock,
} from '@/lib/legal-docs/types';

type SectionAccumulator = {
  sectionId: string;
  heading: string;
  paragraphs: string[];
  numberedItems: string[];
  bulletItems: string[];
};

/** Convert parsed legal-document sections into export drafted sections without flattening lists. */
export function mapLegalDocumentToDraftedSections(doc: LegalDocument): DraftedSection[] {
  const draftedSections: DraftedSection[] = [];

  for (const section of doc.sections) {
    let current: SectionAccumulator = makeAccumulator(section.id, section.heading);

    for (const block of section.blocks) {
      if (block.type === 'paragraph') {
        const text = (block as ParagraphBlock).text;
        if (text.startsWith('__ALPHA_HEADING__')) {
          flushAccumulator(current, draftedSections);
          current = makeAccumulator(`${section.id}_${draftedSections.length + 1}`, text.replace('__ALPHA_HEADING__', ''));
          continue;
        }
        current.paragraphs.push(text);
      } else if (block.type === 'numbered_paragraph') {
        current.numberedItems.push((block as NumberedParagraphBlock).text);
      } else if (block.type === 'numbered_list') {
        current.numberedItems.push(...(block as NumberedListBlock).items);
      } else if (block.type === 'bullet_list') {
        current.bulletItems.push(...(block as BulletListBlock).items);
      } else if (block.type === 'lettered_list') {
        current.paragraphs.push(...(block as LetteredListBlock).items.map((item, index) => {
          const prefix = String.fromCharCode(65 + index);
          return `${prefix}. ${item}`;
        }));
      }
    }

    flushAccumulator(current, draftedSections);
  }

  return draftedSections;
}

/** Create a mutable section accumulator for preserving parsed block order. */
function makeAccumulator(sectionId: string, heading: string): SectionAccumulator {
  return {
    sectionId,
    heading,
    paragraphs: [],
    numberedItems: [],
    bulletItems: [],
  };
}

/** Append a non-empty accumulated section to the export bridge format. */
function flushAccumulator(section: SectionAccumulator, draftedSections: DraftedSection[]): void {
  if (!section.heading && section.paragraphs.length === 0 && section.numberedItems.length === 0 && section.bulletItems.length === 0) {
    return;
  }

  draftedSections.push({
    sectionId: section.sectionId,
    heading: section.heading,
    body: section.paragraphs.join('\n\n'),
    numberedItems: section.numberedItems,
    bulletItems: section.bulletItems,
    source: 'user_locked',
  });
}
