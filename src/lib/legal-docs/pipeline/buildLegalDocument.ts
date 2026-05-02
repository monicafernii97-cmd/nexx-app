/**
 * LegalDocument Builder
 *
 * Step 5: Assembles a LegalDocument from parsed structure + metadata overrides.
 */

import type { LegalDocument, CaptionBlock, LegalBlock } from '../types';
import type { ParsedLegalDocument } from './parseLegalDocumentStructure';

/** Parameters for building a LegalDocument from parsed structure. */
export type BuildLegalDocumentParams = {
  parsed: ParsedLegalDocument;
  metadata?: Partial<LegalDocument['metadata']>;
  captionOverride?: Partial<CaptionBlock>;
  titleOverride?: string;
  subtitleOverride?: string;
};

/**
 * Build a LegalDocument from parsed structure and optional overrides.
 *
 * Assembles the final LegalDocument by merging parsed output with
 * user-provided metadata, caption, and title overrides. Also builds
 * a deterministic rawText for fallback/debug purposes.
 *
 * @param params - Parsed structure, metadata, and overrides
 * @returns A fully assembled LegalDocument
 */
export function buildLegalDocument(params: BuildLegalDocumentParams): LegalDocument {
  const { parsed, metadata, captionOverride, titleOverride, subtitleOverride } = params;

  // ── Caption: use override if provided, else parsed ────────
  let caption = parsed.caption;
  if (captionOverride && Object.keys(captionOverride).length > 0) {
    caption = {
      causeLine: captionOverride.causeLine ?? caption?.causeLine,
      leftLines: captionOverride.leftLines ?? caption?.leftLines ?? [],
      centerLines: captionOverride.centerLines ?? caption?.centerLines ?? [],
      rightLines: captionOverride.rightLines ?? caption?.rightLines ?? [],
      styleHint: captionOverride.styleHint ?? caption?.styleHint,
    };
  }

  // ── Title ─────────────────────────────────────────────────
  const title = {
    main: titleOverride ?? parsed.title?.main ?? '',
    subtitle: subtitleOverride ?? parsed.title?.subtitle,
  };

  // ── Metadata ──────────────────────────────────────────────
  const docMetadata: LegalDocument['metadata'] = {
    causeNumber: metadata?.causeNumber ?? parsed.causeNumber,
    court: metadata?.court,
    district: metadata?.district,
    county: metadata?.county,
    jurisdiction: metadata?.jurisdiction,
    documentType: metadata?.documentType,
    filingParty: metadata?.filingParty,
    partyRole: metadata?.partyRole,
  };

  // ── Build rawText for fallback/debug ──────────────────────
  const rawTextParts: string[] = [];
  rawTextParts.push(title.main);
  if (title.subtitle) rawTextParts.push(title.subtitle);
  for (const block of parsed.introBlocks) {
    if (block.type === 'paragraph') rawTextParts.push(block.text);
  }
  for (const section of parsed.sections) {
    rawTextParts.push(section.heading);
    for (const block of section.blocks) {
      rawTextParts.push(blockToText(block));
    }
  }
  if (parsed.prayer?.intro) rawTextParts.push(parsed.prayer.intro);

  return {
    metadata: docMetadata,
    caption,
    title,
    introBlocks: parsed.introBlocks,
    sections: parsed.sections,
    prayer: parsed.prayer,
    signature: parsed.signature,
    certificate: parsed.certificate,
    verification: parsed.verification,
    rawText: rawTextParts.join('\n'),
  };
}

/**
 * Convert a legal block to plain text for rawText assembly.
 *
 * Handles all block types including the deprecated `numbered_list`.
 *
 * @param block - The legal block to convert
 * @returns Plain text representation of the block
 */
function blockToText(block: LegalBlock): string {
  switch (block.type) {
    case 'paragraph': return block.text;
    case 'numbered_paragraph': return `${block.number}. ${block.text}`;
    case 'numbered_list': return block.items.map((item: string, idx: number) => `${idx + 1}. ${item}`).join('\n');
    case 'bullet_list': return block.items.map(i => `• ${i}`).join('\n');
    case 'lettered_list': return block.items.join('\n');
    default: return '';
  }
}
