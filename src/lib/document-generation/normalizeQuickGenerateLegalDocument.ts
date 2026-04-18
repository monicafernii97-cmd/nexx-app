/**
 * Quick Generate Legal Document Normalizer
 *
 * Transforms raw pasted legal text into renderer-ready GeneratedSection[]
 * with extracted shell metadata (cause number, title, caption, signature).
 *
 * Flow:
 *   1. Detect if bodyContent is already normalized → pass through
 *   2. Flatten Quick Generate shape → full text
 *   3. Clean paste artifacts (separators, excess whitespace)
 *   4. Parse shell metadata (cause number, title, court, caption, signature)
 *   5. Parse body structure (Roman numerals, lettered subs, numbered lists, prayer)
 *   6. Map parsed blocks → GeneratedSection[]
 *   7. Guarantee fallback if parsing is empty
 */

import type { GeneratedSection, SectionType } from '@/lib/legal/types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type NormalizationMode =
  | 'already_normalized'
  | 'quick_generate_parsed'
  | 'quick_generate_flattened'
  | 'fallback_flattened';

export interface NormalizedQuickGenerateLegalDocument {
  normalizationMode: NormalizationMode;

  causeNumber?: string;
  title?: string;
  subtitle?: string;

  courtLabel?: string;
  district?: string;
  venue?: string;

  caseStyleLeft?: string[];
  caseStyleRight?: string[];

  petitionerName?: string;
  respondentName?: string;

  signatureName?: string;
  signatureRole?: string;

  sections: GeneratedSection[];
}

export interface ParsedBodyBlock {
  heading?: string;
  content: string;
  numberedItems?: string[];
  blockType: 'roman' | 'lettered' | 'numbered_only' | 'bullet' | 'paragraph';
}

interface ParsedLegalText {
  causeNumber?: string;
  title?: string;
  subtitle?: string;

  courtLabel?: string;
  district?: string;
  venue?: string;

  caseStyleLeft?: string[];
  caseStyleRight?: string[];

  introduction?: string;
  bodyBlocks: ParsedBodyBlock[];
  prayer?: string;

  signatureName?: string;
  signatureRole?: string;
}

// ═══════════════════════════════════════════════════════════════
// Constants / Regex
// ═══════════════════════════════════════════════════════════════

const CAUSE_NUMBER_RE = /^CAUSE\s+NO\.?\s*(.+)$/im;
const ROMAN_HEADING_RE = /^([IVXLCDM]+)\.\s+(.+)$/;
const LETTER_HEADING_RE = /^([A-Z])\.\s+(.+)$/;
const NUMBERED_ITEM_RE = /^\s*(\d+)\.\s+(.+)$/;
const BULLET_RE = /^\s*[•\-–—]\s+(.+)$/;
const PRAYER_HEADING_RE = /^PRAYER\s*$/i;
const WHEREFORE_RE = /^WHEREFORE/i;
const COMES_NOW_RE = /^COMES\s+NOW\b/i;
const RESPECTFULLY_RE = /^Respectfully\s+submitted/i;
const COURT_ADDRESS_RE = /^TO\s+THE\s+HONORABLE\s+JUDGE/i;
const SEPARATOR_RE = /^[\u2E3A\u2E3B⸻─—\-_=]{1,}$/;

// Court block detection
const IN_THE_COURT_RE = /^IN\s+THE\s+(.+\s+COURT)\s*$/i;
const JUDICIAL_DISTRICT_RE = /^(\d+\w*\s+JUDICIAL\s+DISTRICT)\s*$/i;
const COUNTY_VENUE_RE = /^(.+\s+COUNTY,\s+.+)\s*$/i;

// Caption style lines (IN THE INTEREST OF ... A CHILD)
const IN_THE_INTEREST_RE = /^IN\s+THE\s+INTEREST\s+OF\s*$/i;
const A_CHILD_RE = /^A\s+CHILD\s*$/i;
const CHILDREN_RE = /^CHILDREN\s*$/i;

// Valid section types from the renderer
const VALID_SECTION_TYPES: SectionType[] = [
  'introduction', 'body_sections', 'body_numbered', 'prayer_for_relief',
];


// ═══════════════════════════════════════════════════════════════
// 1. Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize Quick Generate payload into renderer-ready format.
 *
 * Detects whether bodyContent is already normalized or needs parsing.
 * Extracts shell metadata from pasted legal text when available.
 * Guarantees at least one valid body section in all cases.
 */
export function normalizeQuickGenerateLegalDocument(
  bodyContent: unknown,
): NormalizedQuickGenerateLegalDocument {

  // ── Case 1: Already normalized GeneratedSection[] ──
  if (isAlreadyNormalized(bodyContent)) {
    return {
      normalizationMode: 'already_normalized',
      sections: bodyContent as GeneratedSection[],
    };
  }

  // ── Case 2: Quick Generate textarea shape ──
  const fullText = flattenQuickGeneratePayload(bodyContent);
  if (!fullText.trim()) {
    return {
      normalizationMode: 'fallback_flattened',
      sections: [],
    };
  }

  const cleaned = cleanLegalPasteText(fullText);
  const parsed = parseLegalText(cleaned);
  const sections = mapParsedBodyBlocksToSections(parsed);

  const hasMeaningfulParsing =
    sections.length > 1 ||
    (sections.length === 1 && sections[0].sectionType !== 'body_sections') ||
    parsed.introduction != null ||
    parsed.prayer != null;

  return {
    normalizationMode: hasMeaningfulParsing
      ? 'quick_generate_parsed'
      : 'quick_generate_flattened',

    causeNumber: parsed.causeNumber,
    title: parsed.title,
    subtitle: parsed.subtitle,

    courtLabel: parsed.courtLabel,
    district: parsed.district,
    venue: parsed.venue,

    caseStyleLeft: parsed.caseStyleLeft,
    caseStyleRight: parsed.caseStyleRight,

    petitionerName: parsed.signatureName,
    signatureName: parsed.signatureName,
    signatureRole: parsed.signatureRole,

    sections,
  };
}


// ═══════════════════════════════════════════════════════════════
// 2. Detection Helpers
// ═══════════════════════════════════════════════════════════════

/** Check if bodyContent is already a valid GeneratedSection[]. */
function isAlreadyNormalized(bodyContent: unknown): boolean {
  if (!Array.isArray(bodyContent) || bodyContent.length === 0) return false;
  return bodyContent.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      'sectionType' in item &&
      VALID_SECTION_TYPES.includes((item as { sectionType: string }).sectionType as SectionType),
  );
}

/** Flatten the Quick Generate `{ heading, paragraphs }` shape into a single text string. */
function flattenQuickGeneratePayload(bodyContent: unknown): string {
  if (!Array.isArray(bodyContent)) return '';
  return bodyContent
    .map((item: unknown) => {
      if (typeof item === 'string') return item;
      if (typeof item !== 'object' || item === null) return '';
      const obj = item as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof obj.heading === 'string' && obj.heading.trim()) parts.push(obj.heading.trim());
      if (Array.isArray(obj.paragraphs)) {
        for (const p of obj.paragraphs) {
          if (typeof p === 'string' && p.trim()) parts.push(p.trim());
        }
      }
      if (typeof obj.content === 'string' && obj.content.trim()) parts.push(obj.content.trim());
      return parts.join('\n\n');
    })
    .filter(Boolean)
    .join('\n\n');
}


// ═══════════════════════════════════════════════════════════════
// 3. Text Cleanup
// ═══════════════════════════════════════════════════════════════

/** Clean pasted legal text — normalize whitespace, remove separators. */
export function cleanLegalPasteText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')           // normalize line endings
    .replace(/\t/g, '    ')           // tabs → spaces
    .split('\n')
    .map(line => line.trimEnd())       // trim trailing whitespace
    .filter(line => !SEPARATOR_RE.test(line))  // remove separator lines
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')     // collapse excessive blank lines
    .trim();
}


// ═══════════════════════════════════════════════════════════════
// 4. Full Legal Text Parser
// ═══════════════════════════════════════════════════════════════

/** Parse full legal text into shell metadata and body blocks. */
export function parseLegalText(text: string): ParsedLegalText {
  const lines = text.split('\n');
  const result: ParsedLegalText = { bodyBlocks: [] };

  let cursor = 0;

  // ── Pass 1: Extract shell metadata from top of document ──
  cursor = extractShellMetadata(lines, cursor, result);

  // ── Pass 2: Find introduction (COMES NOW...) ──
  cursor = extractIntroduction(lines, cursor, result);

  // ── Pass 3: Parse body blocks (everything between intro and prayer/signature) ──
  cursor = extractBodyBlocks(lines, cursor, result);

  // ── Pass 4: Extract signature ──
  extractSignature(lines, cursor, result);

  return result;
}


// ═══════════════════════════════════════════════════════════════
// 5. Shell Metadata Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract cause number, court info, caption, title from the top of the document. */
function extractShellMetadata(lines: string[], start: number, result: ParsedLegalText): number {
  let cursor = start;
  const maxScan = Math.min(lines.length, 40); // shell metadata is always in first ~40 lines

  // ── Cause Number ──
  for (let i = cursor; i < maxScan; i++) {
    const m = CAUSE_NUMBER_RE.exec(lines[i]);
    if (m) {
      result.causeNumber = m[1].trim();
      cursor = i + 1;
      break;
    }
  }

  // ── Caption block: look for IN THE INTEREST OF or petitioner/respondent ──
  const captionLeft: string[] = [];
  const captionRight: string[] = [];

  for (let i = cursor; i < maxScan; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split inline § caption rows: "IN THE INTEREST OF §  IN THE DISTRICT COURT"
    // Process left half as caption-left, right half as caption-right
    if (line.includes('§')) {
      const parts = line.split('§').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Process left part
        const leftPart = parts[0];
        if (IN_THE_INTEREST_RE.test(leftPart)) {
          captionLeft.push('IN THE INTEREST OF');
        } else if (A_CHILD_RE.test(leftPart) || CHILDREN_RE.test(leftPart)) {
          captionLeft.push(leftPart.toUpperCase());
        } else if (leftPart.length > 1) {
          captionLeft.push(leftPart.replace(/,\s*$/, '').toUpperCase());
        }
        // Process right part
        const rightPart = parts[parts.length - 1];
        const courtM = IN_THE_COURT_RE.exec(rightPart);
        if (courtM) {
          result.courtLabel = `IN THE ${courtM[1].toUpperCase()}`;
          captionRight.push(result.courtLabel);
        }
        const distM = JUDICIAL_DISTRICT_RE.exec(rightPart);
        if (distM) {
          result.district = distM[1].toUpperCase();
          captionRight.push(result.district);
        }
        const venueM = COUNTY_VENUE_RE.exec(rightPart);
        if (venueM) {
          result.venue = venueM[1].toUpperCase();
          captionRight.push(result.venue);
        }
        continue;
      }
      // Single § on a line — skip
      if (line === '§') continue;
    }

    // Court/district/venue on the right
    const courtMatch = IN_THE_COURT_RE.exec(line);
    if (courtMatch) {
      result.courtLabel = `IN THE ${courtMatch[1].toUpperCase()}`;
      captionRight.push(result.courtLabel);
      continue;
    }
    const districtMatch = JUDICIAL_DISTRICT_RE.exec(line);
    if (districtMatch) {
      result.district = districtMatch[1].toUpperCase();
      captionRight.push(result.district);
      continue;
    }
    const venueMatch = COUNTY_VENUE_RE.exec(line);
    if (venueMatch) {
      result.venue = venueMatch[1].toUpperCase();
      captionRight.push(result.venue);
      continue;
    }

    // Caption left — "IN THE INTEREST OF"
    if (IN_THE_INTEREST_RE.test(line)) {
      captionLeft.push('IN THE INTEREST OF');
      // Collect child names until "A CHILD" or "CHILDREN"
      for (let j = i + 1; j < maxScan; j++) {
        const cl = lines[j].trim();
        if (!cl || cl === '§') continue;
        if (A_CHILD_RE.test(cl) || CHILDREN_RE.test(cl)) {
          captionLeft.push(cl.toUpperCase());
          cursor = j + 1;
          break;
        }
        captionLeft.push(cl.replace(/,\s*$/, '').toUpperCase());
      }
      continue;
    }

    // Skip § lines (caption column separators)
    if (line === '§') continue;

    // Stop scanning if we hit the title or court address
    if (COURT_ADDRESS_RE.test(line)) {
      cursor = i;
      break;
    }

    // Detect title — first ALL-CAPS multi-word line after caption
    if (!result.title && line.length > 10 && line === line.toUpperCase() && !line.startsWith('IN THE') && !line.includes('§')) {
      // Skip lines that are part of caption left
      if (captionLeft.length > 0 || captionRight.length > 0) {
        result.title = line.replace(/,$/, '').trim();
        // Check for subtitle on next line
        const nextLine = lines[i + 1]?.trim();
        if (nextLine?.startsWith('(') && nextLine?.endsWith(')')) {
          result.subtitle = nextLine;
          cursor = i + 2;
        } else {
          cursor = i + 1;
        }
        break;
      }
    }
  }

  if (captionLeft.length > 0) result.caseStyleLeft = captionLeft;
  if (captionRight.length > 0) result.caseStyleRight = captionRight;

  // ── If we haven't found title yet, scan forward ──
  if (!result.title) {
    for (let i = cursor; i < maxScan; i++) {
      const line = lines[i].trim();
      if (!line || COURT_ADDRESS_RE.test(line)) continue;
      if (line === '§') continue;

      // Title: a substantial ALL-CAPS line
      if (line.length > 15 && line === line.toUpperCase() && /[A-Z]/.test(line)) {
        result.title = line;
        const nextLine = lines[i + 1]?.trim();
        if (nextLine?.startsWith('(') && nextLine?.endsWith(')')) {
          result.subtitle = nextLine;
          cursor = i + 2;
        } else {
          cursor = i + 1;
        }
        break;
      }
    }
  }

  // Skip "TO THE HONORABLE JUDGE" line (template renders it)
  for (let i = cursor; i < Math.min(lines.length, cursor + 10); i++) {
    if (COURT_ADDRESS_RE.test(lines[i].trim())) {
      cursor = i + 1;
      break;
    }
  }

  return cursor;
}


// ═══════════════════════════════════════════════════════════════
// 6. Introduction Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract COMES NOW... introduction paragraph. */
function extractIntroduction(lines: string[], start: number, result: ParsedLegalText): number {
  let cursor = start;

  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (COMES_NOW_RE.test(line)) {
      // Collect the full introduction paragraph (may span multiple lines)
      const introParts: string[] = [line];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j].trim();
        if (!next) { j++; break; }
        // Stop if we hit a Roman numeral heading
        if (ROMAN_HEADING_RE.test(next)) break;
        introParts.push(next);
        j++;
      }
      result.introduction = introParts.join(' ');
      cursor = j;
      return cursor;
    }

    // If we hit a Roman numeral heading before finding COMES NOW, stop looking
    if (ROMAN_HEADING_RE.test(line)) {
      cursor = i;
      return cursor;
    }
  }

  return cursor;
}


// ═══════════════════════════════════════════════════════════════
// 7. Body Block Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract body blocks between introduction and prayer/signature. */
function extractBodyBlocks(lines: string[], start: number, result: ParsedLegalText): number {
  let cursor = start;
  let currentBlock: ParsedBodyBlock | null = null;
  const contentLines: string[] = [];

  function flushBlock() {
    if (currentBlock) {
      if (contentLines.length > 0) {
        const { numbered, remaining } = extractNumberedItems(contentLines);
        if (numbered.length > 0) {
          currentBlock.numberedItems = numbered;
          currentBlock.blockType = 'numbered_only';
        }
        if (remaining.trim()) {
          currentBlock.content = remaining;
        }
        if (!currentBlock.content && currentBlock.numberedItems) {
          currentBlock.content = '';
        }
      }
      result.bodyBlocks.push(currentBlock);
    }
    contentLines.length = 0;
    currentBlock = null;
  }

  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i].trim();

    // ── Detect PRAYER ──
    if (PRAYER_HEADING_RE.test(line) || WHEREFORE_RE.test(line)) {
      flushBlock();
      const prayerParts: string[] = [];
      if (WHEREFORE_RE.test(line)) prayerParts.push(line);
      for (let j = i + 1; j < lines.length; j++) {
        const pl = lines[j].trim();
        if (RESPECTFULLY_RE.test(pl)) {
          cursor = j;
          result.prayer = prayerParts.join(' ');
          return cursor;
        }
        if (pl) prayerParts.push(pl);
      }
      result.prayer = prayerParts.join(' ');
      cursor = lines.length;
      return cursor;
    }

    // ── Detect signature → stop body parsing ──
    if (RESPECTFULLY_RE.test(line)) {
      flushBlock();
      cursor = i;
      return cursor;
    }

    // ── Detect Roman numeral heading ──
    const romanMatch = ROMAN_HEADING_RE.exec(line);
    if (romanMatch) {
      flushBlock();
      currentBlock = {
        heading: `${romanMatch[1]}. ${romanMatch[2]}`,
        content: '',
        blockType: 'roman',
      };
      continue;
    }

    // ── Detect lettered subsection heading ──
    const letterMatch = LETTER_HEADING_RE.exec(line);
    if (letterMatch) {
      flushBlock();
      currentBlock = {
        heading: `${letterMatch[1]}. ${letterMatch[2]}`,
        content: '',
        blockType: 'lettered',
      };
      continue;
    }

    // ── Skip blank lines between blocks ──
    if (!line) {
      if (contentLines.length > 0) contentLines.push('');
      continue;
    }

    // ── Accumulate content lines ──
    if (currentBlock != null) {
      contentLines.push(line);
    } else {
      // Content before any heading — create an implicit paragraph block
      currentBlock = { content: '', blockType: 'paragraph' };
      contentLines.push(line);
    }
  }

  flushBlock();
  cursor = lines.length;
  return cursor;
}


/** Extract numbered items from content lines, returning items and remaining text. */
function extractNumberedItems(lines: string[]): { numbered: string[]; remaining: string } {
  const numbered: string[] = [];
  const remainingLines: string[] = [];
  let lastNum = 0;

  for (const line of lines) {
    const m = NUMBERED_ITEM_RE.exec(line);
    if (m) {
      const num = parseInt(m[1], 10);
      // Accept if it's the next number or first number
      if (num === lastNum + 1 || (lastNum === 0 && num === 1)) {
        numbered.push(m[2].trim());
        lastNum = num;
        continue;
      }
    }

    // Check for bullet items
    const bulletMatch = BULLET_RE.exec(line);
    if (bulletMatch && numbered.length === 0) {
      // If we haven't started numbered items, treat bullets as numbered
      numbered.push(bulletMatch[1].trim());
      continue;
    }

    if (line.trim()) {
      remainingLines.push(line);
    }
  }

  return {
    numbered,
    remaining: remainingLines.join('\n').trim(),
  };
}


// ═══════════════════════════════════════════════════════════════
// 8. Signature Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract signature name and role from the end of the document. */
function extractSignature(lines: string[], start: number, result: ParsedLegalText): void {
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();

    if (RESPECTFULLY_RE.test(line)) {
      // Look for name and role in the next few lines
      const remaining = lines.slice(i + 1)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !SEPARATOR_RE.test(l));

      if (remaining.length >= 1) {
        result.signatureName = remaining[0];
      }
      if (remaining.length >= 2) {
        result.signatureRole = remaining[1];
      }
      return;
    }
  }
}


// ═══════════════════════════════════════════════════════════════
// 9. Map Parsed Blocks → GeneratedSection[]
// ═══════════════════════════════════════════════════════════════

/** Convert parsed legal text blocks into renderer-ready GeneratedSection[]. */
export function mapParsedBodyBlocksToSections(parsed: ParsedLegalText): GeneratedSection[] {
  const sections: GeneratedSection[] = [];

  // ── Introduction ──
  if (parsed.introduction) {
    sections.push({
      sectionType: 'introduction',
      content: parsed.introduction,
    });
  }

  // ── Body blocks ──
  for (const block of parsed.bodyBlocks) {
    if (block.numberedItems && block.numberedItems.length > 0) {
      sections.push({
        sectionType: 'body_numbered',
        heading: block.heading,
        content: block.content || '',
        numberedItems: block.numberedItems,
      });
    } else if (block.content.trim()) {
      sections.push({
        sectionType: 'body_sections',
        heading: block.heading,
        content: block.content,
      });
    } else if (block.heading && !block.content.trim() && !block.numberedItems?.length) {
      // Heading-only block (transitional heading like "III. REQUESTED TEMPORARY ORDERS")
      sections.push({
        sectionType: 'body_sections',
        heading: block.heading,
        content: '',
      });
    }
  }

  // ── Prayer ──
  if (parsed.prayer) {
    sections.push({
      sectionType: 'prayer_for_relief',
      heading: 'PRAYER',
      content: parsed.prayer,
    });
  }

  return sections;
}
