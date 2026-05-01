/**
 * Server-Side Section Splitting Service
 *
 * Splits raw pasted document text into structured review items
 * for the Review Hub. This MUST run server-side only.
 *
 * Logic chain:
 * 1. parseLegalDocument() — deterministic parser (headings, sections, prayer, etc.)
 * 2. If weak (≤1 section, missing key blocks) → paragraph-based splitting
 * 3. Map structured output to MappingReviewItem[]
 *
 * ❌ NOT allowed in client code (ExportContext, ReviewHubContent, etc.)
 */

import { parseLegalDocument } from '@/lib/legal-docs/parseLegalDocument';
import type { LegalDocument, LegalSection, LegalBlock } from '@/lib/legal-docs/types';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of splitting pasted content into structured sections. */
export interface SplitResult {
  /** Structured review items for the Review Hub canvas. */
  items: MappingReviewItem[];
  /** Which splitting strategy was used. */
  strategy: 'parser' | 'paragraph_fallback';
  /** The parsed LegalDocument (if parser strategy succeeded). */
  parsedDocument: LegalDocument | null;
  /** Metadata about the split. */
  meta: {
    totalSections: number;
    totalItems: number;
    hasCaption: boolean;
    hasSignature: boolean;
    hasCertificate: boolean;
    hasPrayer: boolean;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a stable node ID from prefix and index. Uses a simple content-based hash to avoid non-determinism. */
function makeNodeId(prefix: string, index: number, contentLength: number = 0): string {
  // Simple hash: prefix + index + content length for stability across calls
  const hash = ((index * 31 + contentLength) >>> 0).toString(36);
  return `pasted_${prefix}_${index}_${hash}`;
}

/** Flatten a LegalBlock into its text content. */
function blockToText(block: LegalBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'numbered_list':
      return block.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
    case 'bullet_list':
      return block.items.map(item => `• ${item}`).join('\n');
    case 'lettered_list':
      return block.items.map((item, i) => `${String.fromCharCode(65 + i)}. ${item}`).join('\n');
    default:
      return '';
  }
}

/** Flatten all blocks in a section into a single text string. */
function sectionToText(section: LegalSection): string {
  return section.blocks.map(blockToText).filter(Boolean).join('\n\n');
}

/** Build a MappingReviewItem from text content. */
function buildReviewItem(
  nodeId: string,
  text: string,
  suggestedSection: string,
  confidence: number = 0.9,
): MappingReviewItem {
  return {
    nodeId,
    originalText: text,
    dominantType: 'fact',
    confidence,
    suggestedSections: [suggestedSection],
    transformedCourtSafeText: text,
    includedInExport: true,
  };
}

// ---------------------------------------------------------------------------
// Parser Strategy
// ---------------------------------------------------------------------------

/** Determine if a parsed document is "strong" enough to use directly. */
function isStrongParse(doc: LegalDocument): boolean {
  const sectionCount = doc.sections.length;
  const hasMultipleSections = sectionCount >= 2;
  const hasClosingBlock = Boolean(doc.prayer || doc.signature || doc.certificate || doc.verification);
  return hasMultipleSections || (sectionCount >= 1 && hasClosingBlock);
}

/** Map a parsed LegalDocument into MappingReviewItem[]. */
function mapParsedDocToReviewItems(doc: LegalDocument): MappingReviewItem[] {
  const items: MappingReviewItem[] = [];
  let idx = 0;

  // Intro blocks (pre-section content like "TO THE HONORABLE...")
  if (doc.introBlocks.length > 0) {
    const introText = doc.introBlocks.map(blockToText).filter(Boolean).join('\n\n');
    if (introText.trim()) {
      items.push(buildReviewItem(
        makeNodeId('intro', idx++),
        introText,
        'introduction',
        0.85,
      ));
    }
  }

  // Body sections
  for (const section of doc.sections) {
    const text = sectionToText(section);
    if (!text.trim()) continue;

    items.push(buildReviewItem(
      makeNodeId('section', idx++),
      text,
      section.heading || section.id || 'body',
      0.9,
    ));
  }

  // Prayer
  if (doc.prayer) {
    const prayerText = [
      doc.prayer.intro,
      ...doc.prayer.requests.map((r, i) => `${i + 1}. ${r}`),
    ].filter(Boolean).join('\n');

    if (prayerText.trim()) {
      items.push(buildReviewItem(
        makeNodeId('prayer', idx++),
        prayerText,
        'prayer',
        0.95,
      ));
    }
  }

  // Signature
  if (doc.signature) {
    const sigText = [
      doc.signature.intro,
      ...doc.signature.signerLines,
    ].filter(Boolean).join('\n');

    if (sigText.trim()) {
      items.push(buildReviewItem(
        makeNodeId('signature', idx++),
        sigText,
        'signature',
        0.95,
      ));
    }
  }

  // Certificate of Service
  if (doc.certificate) {
    const certText = [
      doc.certificate.heading,
      ...doc.certificate.bodyLines,
      ...doc.certificate.signerLines,
    ].filter(Boolean).join('\n');

    if (certText.trim()) {
      items.push(buildReviewItem(
        makeNodeId('certificate', idx++),
        certText,
        'certificate_of_service',
        0.95,
      ));
    }
  }

  // Verification
  if (doc.verification) {
    const verText = [
      doc.verification.heading,
      ...doc.verification.bodyLines,
      ...doc.verification.signerLines,
    ].filter(Boolean).join('\n');

    if (verText.trim()) {
      items.push(buildReviewItem(
        makeNodeId('verification', idx++),
        verText,
        'verification',
        0.95,
      ));
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Paragraph Fallback Strategy
// ---------------------------------------------------------------------------

/** Minimum paragraph length to qualify as a section (skip blank/trivial lines). */
const MIN_PARAGRAPH_LENGTH = 40;

/**
 * Regex patterns for detecting section headings in fallback mode.
 * These match common legal document heading formats:
 *   - Roman numerals: "I. BACKGROUND", "II. FACTS"
 *   - Letter subsections: "A. Electronic Communication"
 *   - Numbered sections: "1. Jurisdiction", "2. Venue"
 *   - ALL-CAPS headings: "BACKGROUND", "PRAYER"
 */
const FALLBACK_ROMAN_RE = /^([IVXLC]+)\.\s+(.+)$/i;
const FALLBACK_LETTER_RE = /^([A-Z])\.\s+(.+)$/;
const FALLBACK_NUMBERED_RE = /^(\d+)\.\s+(.+)$/;
const FALLBACK_ALLCAPS_RE = /^[A-Z][A-Z\s'\-&.,/()]{2,}$/;

/** Extract a section heading from the first line of a paragraph, if present. */
function extractFallbackHeading(paragraph: string): string | null {
  const firstLine = paragraph.split('\n')[0].trim();
  if (!firstLine) return null;

  // Roman numeral heading: "I. BACKGROUND" → "I. BACKGROUND"
  const roman = firstLine.match(FALLBACK_ROMAN_RE);
  if (roman) return `${roman[1].toUpperCase()}. ${roman[2]}`;

  // ALL-CAPS heading: "BACKGROUND" → "BACKGROUND"
  if (FALLBACK_ALLCAPS_RE.test(firstLine) && firstLine.length <= 60) return firstLine;

  // Letter heading: "A. Electronic Communication" → "A. Electronic Communication"
  const letter = firstLine.match(FALLBACK_LETTER_RE);
  if (letter) return `${letter[1]}. ${letter[2]}`;

  // Numbered heading: "1. Jurisdiction" (only if short, to avoid matching numbered list items)
  const numbered = firstLine.match(FALLBACK_NUMBERED_RE);
  if (numbered && firstLine.length <= 80) return `${numbered[1]}. ${numbered[2]}`;

  return null;
}

/** Split raw text into paragraph-based review items when parsing is too weak. */
function paragraphFallback(rawText: string): MappingReviewItem[] {
  // Split on double newlines or em-dash separators
  const paragraphs = rawText
    .split(/(?:\n{2,}|⸻)/)
    .map(p => p.trim())
    .filter(p => p.length >= MIN_PARAGRAPH_LENGTH);

  if (paragraphs.length === 0) {
    // Last resort: treat entire text as single item
    return [buildReviewItem(
      makeNodeId('full', 0),
      rawText.trim(),
      'document_content',
      0.5,
    )];
  }

  return paragraphs.map((text, i) => {
    const heading = extractFallbackHeading(text);
    const sectionName = heading
      ? heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      : `paragraph_${i + 1}`;

    return buildReviewItem(
      makeNodeId('para', i, text.length),
      text,
      sectionName,
      heading ? 0.75 : 0.5,
    );
  });
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Split raw pasted content into structured review items.
 *
 * @param rawText - Raw text pasted by the user in DocuVault intake.
 * @returns Structured split result with review items and metadata.
 */
export function splitPastedContent(rawText: string): SplitResult {
  if (!rawText.trim()) {
    return {
      items: [],
      strategy: 'paragraph_fallback',
      parsedDocument: null,
      meta: {
        totalSections: 0,
        totalItems: 0,
        hasCaption: false,
        hasSignature: false,
        hasCertificate: false,
        hasPrayer: false,
      },
    };
  }

  // Step 1: Try deterministic parser
  let doc: LegalDocument;
  try {
    doc = parseLegalDocument(rawText);
  } catch {
    // Parser failed — fall back to paragraphs
    const items = paragraphFallback(rawText);
    return {
      items,
      strategy: 'paragraph_fallback',
      parsedDocument: null,
      meta: {
        totalSections: items.length,
        totalItems: items.length,
        hasCaption: false,
        hasSignature: false,
        hasCertificate: false,
        hasPrayer: false,
      },
    };
  }

  // Step 2: Evaluate parse quality
  if (isStrongParse(doc)) {
    // Good parse — use structured sections
    const items = mapParsedDocToReviewItems(doc);
    return {
      items,
      strategy: 'parser',
      parsedDocument: doc,
      meta: {
        totalSections: doc.sections.length,
        totalItems: items.length,
        hasCaption: doc.caption !== null,
        hasSignature: doc.signature !== null,
        hasCertificate: doc.certificate !== null,
        hasPrayer: doc.prayer !== null,
      },
    };
  }

  // Step 3: Weak parse — fall back to paragraphs
  const items = paragraphFallback(rawText);
  return {
    items,
    strategy: 'paragraph_fallback',
    parsedDocument: doc,
    meta: {
      totalSections: items.length,
      totalItems: items.length,
      hasCaption: doc.caption !== null,
      hasSignature: doc.signature !== null,
      hasCertificate: doc.certificate !== null,
      hasPrayer: doc.prayer !== null,
    },
  };
}
