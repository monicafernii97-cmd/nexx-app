/**
 * General Pleading-Aware Legal Document Parser
 *
 * Parses raw pasted legal text into a structured LegalDocument.
 * This parser is NOT jurisdiction-specific — it detects structure
 * common to all US pleading formats:
 *
 *   - Texas § caption
 *   - Federal plaintiff-v-defendant caption
 *   - Generic state caption
 *   - Roman numeral sections (I., II., III.)
 *   - Letter subsections (A., B., C.)
 *   - Numbered lists (1., 2., 3.)
 *   - Bullet lists (•, -)
 *   - PRAYER block
 *   - Signature block
 *   - Certificate of Service
 *
 * Design rule: never pass raw text directly to rendering.
 * Always parse first, then render from structure.
 */

import type {
  LegalDocument,
  CaptionBlock,
  LegalSection,
  PrayerBlock,
  SignatureBlock,
  CertificateBlock,
} from './types';

// ═══════════════════════════════════════════════════════════════
// Regex Constants
// ═══════════════════════════════════════════════════════════════

const CAUSE_RE = /^(CAUSE|CASE)\s+NO\.?\s*(.+)$/i;
const DOCKET_RE = /^(DOCKET|DOCKET NO\.?|CASE NUMBER|CASE NO\.?)\s*:?\s*(.+)$/i;

const TITLE_CANDIDATE_RE =
  /(MOTION|PETITION|APPLICATION|NOTICE|RESPONSE|REPLY|BRIEF|MEMORANDUM|AFFIDAVIT|DECLARATION|ORDER|SUBPOENA|COMPLAINT|ANSWER)/i;

const TO_HONORABLE_RE = /^TO THE HONORABLE/i;
const PRAYER_RE = /^PRAYER$/i;
const WHEREFORE_RE = /^WHEREFORE/i;
const CERTIFICATE_RE = /^CERTIFICATE OF SERVICE$/i;
const RESPECTFULLY_RE = /^Respectfully submitted,?$/i;

const ROMAN_HEADING_RE = /^([IVXLC]+)\.\s+(.+)$/i;
const LETTER_HEADING_RE = /^([A-Z])\.\s+(.+)$/;
const NUMBERED_ITEM_RE = /^\d+\.\s+/;
const BULLET_ITEM_RE = /^[•\-]\s+/;

const SEPARATOR_MARKER = '__RULE__';

// ═══════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════

/**
 * Parse raw pasted legal text into a structured LegalDocument.
 *
 * This is the only public entry point — callers should use this
 * instead of calling internal extraction functions directly.
 */
export function parseLegalDocument(rawInput: string): LegalDocument {
  const rawText = normalizeRawText(rawInput);
  const lines = splitLines(rawText);

  const causeNumber = extractCauseNumber(lines);
  const caption = extractGeneralCaption(lines);
  const title = extractGeneralTitle(lines);
  const { sections, prayer, signature, certificate } = extractBodyStructure(lines, title.main);

  return {
    metadata: {
      causeNumber,
      court: caption?.rightLines.find((line) => /court/i.test(line)),
      district: caption?.rightLines.find((line) => /district|division/i.test(line)),
      county: caption?.rightLines.find((line) => /county/i.test(line)),
    },
    caption,
    title,
    sections,
    prayer,
    signature,
    certificate,
    rawText,
  };
}

// ═══════════════════════════════════════════════════════════════
// Text Normalization
// ═══════════════════════════════════════════════════════════════

/** Normalize special characters, whitespace, and separators. */
function normalizeRawText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')         // non-breaking space → space
    .replace(/[""]/g, '"')           // smart double quotes
    .replace(/['']/g, "'")           // smart single quotes
    .replace(/[‐–—]/g, '—')         // normalize dashes
    .replace(/\t/g, ' ')            // tabs → space
    .replace(/[ ]{2,}/g, ' ')       // collapse multiple spaces
    .replace(/\n[ ]+/g, '\n')       // strip leading spaces on lines
    .replace(/⸻/g, SEPARATOR_MARKER)
    .trim();
}

/** Split text into trimmed non-empty lines. */
function splitLines(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// Cause Number
// ═══════════════════════════════════════════════════════════════

/** Extract cause/case/docket number from the document. */
function extractCauseNumber(lines: string[]): string | undefined {
  for (const line of lines) {
    const causeMatch = line.match(CAUSE_RE);
    if (causeMatch?.[2]) return causeMatch[2].trim();

    const docketMatch = line.match(DOCKET_RE);
    if (docketMatch?.[2]) return docketMatch[2].trim();
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════
// Caption Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Detect and extract caption from the top of the document.
 * Tries Texas § format first, then federal v., then generic.
 */
function extractGeneralCaption(lines: string[]): CaptionBlock | null {
  const titleIndex = findTitleIndex(lines);

  // When title is found, use lines above it as caption slice.
  // When title is NOT found, still attempt full header parsing
  // against all lines — don't short-circuit to minimal caption.
  const captionSlice = titleIndex !== -1 ? lines.slice(0, titleIndex) : lines;

  const texas = tryTexasCaption(captionSlice);
  if (texas) return texas;

  const federal = tryFederalCaption(captionSlice);
  if (federal) return federal;

  const generic = tryGenericCaption(captionSlice);
  if (generic) return generic;

  return tryMinimalCaption(captionSlice);
}

/** Try to extract a Texas-style § caption. */
function tryTexasCaption(lines: string[]): CaptionBlock | null {
  const causeLine = lines.find((l) => CAUSE_RE.test(l) || DOCKET_RE.test(l));
  const sectionLines = lines.filter((l) => l.includes('§'));

  if (!sectionLines.length) return null;

  const leftLines: string[] = [];
  const centerLines: string[] = [];
  const rightLines: string[] = [];

  for (const line of sectionLines) {
    const parsed = splitTexasCaptionLine(line);
    if (parsed.left) leftLines.push(parsed.left);
    if (parsed.center) centerLines.push(parsed.center);
    if (parsed.right) rightLines.push(parsed.right);
  }

  // Fallback for stacked caption style (lines without §)
  if (!leftLines.length && !rightLines.length) {
    const possibleStart = lines.findIndex((l) => /^IN THE INTEREST OF$/i.test(l));
    if (possibleStart !== -1) {
      leftLines.push(
        ...lines.slice(possibleStart, possibleStart + 3).filter((l) => !/^§+$/.test(l))
      );
      centerLines.push('§', '§', '§');
      rightLines.push(
        ...lines.filter((l) => /DISTRICT COURT|JUDICIAL DISTRICT|COUNTY, TEXAS/i.test(l))
      );
    }
  }

  if (!causeLine && !leftLines.length && !rightLines.length) return null;

  return {
    causeLine,
    leftLines: dedupePreserve(leftLines),
    centerLines: centerLines.length ? centerLines : ['§', '§', '§'],
    rightLines: dedupePreserve(rightLines),
  };
}

/** Split a Texas § caption line into left, center, right columns. */
function splitTexasCaptionLine(line: string): { left: string; center: string; right: string } {
  const first = line.indexOf('§');
  const last = line.lastIndexOf('§');

  if (first === -1) {
    return { left: line.trim(), center: '', right: '' };
  }

  if (first === last) {
    return {
      left: line.slice(0, first).trim(),
      center: '§',
      right: line.slice(first + 1).trim(),
    };
  }

  return {
    left: line.slice(0, first).trim(),
    center: line.slice(first, last + 1).replace(/[^§]/g, '').trim() || '§',
    right: line.slice(last + 1).trim(),
  };
}

/** Try to extract a federal-style v. caption. */
function tryFederalCaption(lines: string[]): CaptionBlock | null {
  const causeLine = lines.find((l) => CAUSE_RE.test(l) || DOCKET_RE.test(l));
  const courtLines = lines.filter((l) => /COURT/i.test(l));

  // Try standalone "v." or "vs." line first
  const versusIndex = lines.findIndex((l) => /^v\.?$|^vs\.?$/i.test(l));

  if (versusIndex !== -1 && courtLines.length) {
    const leftLines = lines
      .slice(0, versusIndex)
      .filter((l) => !CAUSE_RE.test(l) && !DOCKET_RE.test(l));
    const rightLines = [
      ...courtLines,
      ...lines.filter((l) => /Civil Action|Case No|Judge|Division/i.test(l)),
    ];

    return {
      causeLine,
      leftLines: dedupePreserve(leftLines).slice(-6),
      centerLines: ['v.'],
      rightLines: dedupePreserve(rightLines).slice(0, 6),
    };
  }

  // Try inline "v." or "vs." within a line (e.g., "JANE DOE v. JOHN SMITH")
  const inlineVersusRe = /\b(v\.?|vs\.?)\b/i;
  const inlineIndex = lines.findIndex((l) => inlineVersusRe.test(l) && !CAUSE_RE.test(l) && !DOCKET_RE.test(l));

  if (inlineIndex !== -1 && courtLines.length) {
    const line = lines[inlineIndex];
    const match = line.match(inlineVersusRe);
    if (match && match.index != null) {
      const leftPart = line.slice(0, match.index).trim();
      const rightPart = line.slice(match.index + match[0].length).trim();

      const leftLines = [
        ...lines.slice(0, inlineIndex).filter((l) => !CAUSE_RE.test(l) && !DOCKET_RE.test(l) && !/COURT/i.test(l)),
        ...(leftPart ? [leftPart] : []),
      ];
      const rightLines = [
        ...(rightPart ? [rightPart] : []),
        ...courtLines,
        ...lines.filter((l) => /Civil Action|Case No|Judge|Division/i.test(l)),
      ];

      return {
        causeLine,
        leftLines: dedupePreserve(leftLines).slice(-6),
        centerLines: ['v.'],
        rightLines: dedupePreserve(rightLines).slice(0, 6),
      };
    }
  }

  return null;
}

/** Try to extract a generic state-style caption. */
function tryGenericCaption(lines: string[]): CaptionBlock | null {
  const causeLine = lines.find((l) => CAUSE_RE.test(l) || DOCKET_RE.test(l));
  const leftLines = lines.filter((l) =>
    /IN THE INTEREST OF|IN RE|ESTATE OF|GUARDIANSHIP OF/i.test(l)
  );
  const rightLines = lines.filter((l) =>
    /COURT|COUNTY|DISTRICT|DIVISION|JUDICIAL/i.test(l)
  );

  if (!leftLines.length && !rightLines.length && !causeLine) return null;

  return {
    causeLine,
    leftLines: dedupePreserve(leftLines),
    centerLines: [''],
    rightLines: dedupePreserve(rightLines),
  };
}

/** Minimal fallback caption — just the cause line. */
function tryMinimalCaption(lines: string[]): CaptionBlock | null {
  const causeLine = lines.find((l) => CAUSE_RE.test(l) || DOCKET_RE.test(l));
  if (!causeLine) return null;

  return {
    causeLine,
    leftLines: [],
    centerLines: [''],
    rightLines: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// Title Detection
// ═══════════════════════════════════════════════════════════════

/** Find the title line index in the document. */
function findTitleIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      TITLE_CANDIDATE_RE.test(line) &&
      !CAUSE_RE.test(line) &&
      !DOCKET_RE.test(line) &&
      !/^IN THE INTEREST OF$/i.test(line) &&
      !/DISTRICT COURT|COUNTY|JUDICIAL DISTRICT|DIVISION/i.test(line) &&
      !TO_HONORABLE_RE.test(line)
    ) {
      return i;
    }
  }
  return -1;
}

/** Extract the document title and optional subtitle from pasted text. */
function extractGeneralTitle(lines: string[]): { main: string; subtitle?: string } {
  const titleIndex = findTitleIndex(lines);

  if (titleIndex === -1) {
    return { main: 'UNTITLED DOCUMENT' };
  }

  const main = lines[titleIndex];
  const subtitle = lines[titleIndex + 1]?.startsWith('(') ? lines[titleIndex + 1] : undefined;

  return { main, subtitle };
}

// ═══════════════════════════════════════════════════════════════
// Body Structure Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract body sections, prayer, signature, and certificate. */
function extractBodyStructure(
  lines: string[],
  mainTitle: string,
): {
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
} {
  const titleIndex = lines.findIndex((l) => l === mainTitle);
  const bodyStart = lines.findIndex((l) => TO_HONORABLE_RE.test(l));
  const startIndex = bodyStart !== -1 ? bodyStart : titleIndex !== -1 ? titleIndex + 1 : 0;

  const bodyLines = explodeMergedNumberedParagraphs(lines.slice(startIndex));

  const sections: LegalSection[] = [];
  let prayer: PrayerBlock | null = null;
  let signature: SignatureBlock | null = null;
  let certificate: CertificateBlock | null = null;
  let currentSection: LegalSection | null = null;

  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];

    // ── PRAYER ──
    if (PRAYER_RE.test(line)) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parsePrayer(bodyLines, i);
      prayer = parsed.block;
      i = parsed.nextIndex;
      continue;
    }

    // ── WHEREFORE (prayer without explicit heading) ──
    if (WHEREFORE_RE.test(line) && !prayer) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parsePrayerFromWherefore(bodyLines, i);
      prayer = parsed.block;
      i = parsed.nextIndex;
      continue;
    }

    // ── Signature ──
    if (RESPECTFULLY_RE.test(line)) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parseSignature(bodyLines, i);
      signature = parsed.block;
      i = parsed.nextIndex;
      continue;
    }

    // ── Certificate of Service ──
    if (CERTIFICATE_RE.test(line)) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parseCertificate(bodyLines, i);
      certificate = parsed.block;
      i = parsed.nextIndex;
      continue;
    }

    // ── Roman numeral heading ──
    const roman = line.match(ROMAN_HEADING_RE);
    if (roman) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        id: slugify(line),
        heading: `${roman[1].toUpperCase()}. ${roman[2]}`,
        level: 'roman',
        blocks: [],
      };
      i++;
      continue;
    }

    // ── Letter subsection heading ──
    const letter = line.match(LETTER_HEADING_RE);
    if (letter) {
      if (!currentSection) {
        currentSection = { id: 'intro', heading: '', level: 'plain', blocks: [] };
      }
      // Render letter headings as paragraph blocks so they appear in output
      currentSection.blocks.push({
        type: 'paragraph',
        text: `${letter[1]}. ${letter[2]}`,
      });
      i++;
      continue;
    }

    // ── Ensure we have a section container ──
    if (!currentSection) {
      currentSection = { id: 'intro', heading: '', level: 'plain', blocks: [] };
    }

    // ── Numbered list ──
    if (NUMBERED_ITEM_RE.test(line)) {
      const parsed = collectNumberedList(bodyLines, i);
      currentSection.blocks.push(parsed.block);
      i = parsed.nextIndex;
      continue;
    }

    // ── Bullet list ──
    if (BULLET_ITEM_RE.test(line)) {
      const parsed = collectBulletList(bodyLines, i);
      currentSection.blocks.push(parsed.block);
      i = parsed.nextIndex;
      continue;
    }

    // ── Regular paragraph ──
    if (line !== SEPARATOR_MARKER) {
      currentSection.blocks.push({ type: 'paragraph', text: line });
    }

    i++;
  }

  if (currentSection) sections.push(currentSection);

  return { sections, prayer, signature, certificate };
}

// ═══════════════════════════════════════════════════════════════
// Merged Paragraph Splitter
// ═══════════════════════════════════════════════════════════════

/**
 * Split inline-merged numbered paragraphs.
 * E.g., "10. Alpha. 11. Beta. 12. Gamma." → three separate lines.
 *
 * Known limitation: the heuristic regex /(\\s)(\\d+\\.\\s)/ may incorrectly
 * split mid-sentence if text like "costs $1. Further..." appears. This is
 * rare in legal pleading body text and is an acceptable tradeoff to recover
 * merged numbered items from pasted content.
 */
function explodeMergedNumberedParagraphs(lines: string[]): string[] {
  const output: string[] = [];

  for (const line of lines) {
    if (line === SEPARATOR_MARKER) {
      output.push(line);
      continue;
    }

    const pieces = line
      .replace(/(\s)(\d+\.\s)/g, '\n$2')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    output.push(...pieces);
  }

  return output;
}

// ═══════════════════════════════════════════════════════════════
// List Collectors
// ═══════════════════════════════════════════════════════════════

/**
 * Collect numbered list items starting at startIndex.
 * Handles wrapped lines: continuation lines without a numeric prefix
 * are appended to the previous item instead of becoming paragraphs.
 */
function collectNumberedList(lines: string[], startIndex: number) {
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (NUMBERED_ITEM_RE.test(line)) {
      items.push(line.replace(/^\d+\.\s+/, '').trim());
      i++;
    } else if (
      items.length > 0 &&
      line.trim() &&
      !isStructuralLine(line)
    ) {
      // Continuation of the previous list item (wrapped line)
      items[items.length - 1] += ' ' + line.trim();
      i++;
    } else {
      break;
    }
  }

  return {
    block: { type: 'numbered_list', items } as const,
    nextIndex: i,
  };
}

/**
 * Collect bullet list items starting at startIndex.
 * Handles wrapped lines the same way as numbered lists.
 */
function collectBulletList(lines: string[], startIndex: number) {
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (BULLET_ITEM_RE.test(line)) {
      items.push(line.replace(BULLET_ITEM_RE, '').trim());
      i++;
    } else if (
      items.length > 0 &&
      line.trim() &&
      !isStructuralLine(line)
    ) {
      // Continuation of the previous list item (wrapped line)
      items[items.length - 1] += ' ' + line.trim();
      i++;
    } else {
      break;
    }
  }

  return {
    block: { type: 'bullet_list', items } as const,
    nextIndex: i,
  };
}

/** Check if a line is a structural marker that should NOT be treated as list continuation. */
function isStructuralLine(line: string): boolean {
  return (
    ROMAN_HEADING_RE.test(line) ||
    LETTER_HEADING_RE.test(line) ||
    PRAYER_RE.test(line) ||
    WHEREFORE_RE.test(line) ||
    RESPECTFULLY_RE.test(line) ||
    CERTIFICATE_RE.test(line) ||
    TO_HONORABLE_RE.test(line) ||
    NUMBERED_ITEM_RE.test(line) ||
    BULLET_ITEM_RE.test(line) ||
    line === SEPARATOR_MARKER
  );
}

// ═══════════════════════════════════════════════════════════════
// PRAYER Parser
// ═══════════════════════════════════════════════════════════════

/** Parse a PRAYER section starting from the PRAYER heading line. */
function parsePrayer(lines: string[], startIndex: number): { block: PrayerBlock; nextIndex: number } {
  let i = startIndex + 1;
  const introLines: string[] = [];
  const requests: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (RESPECTFULLY_RE.test(line) || CERTIFICATE_RE.test(line)) break;

    if (NUMBERED_ITEM_RE.test(line)) {
      const parsed = collectNumberedList(lines, i);
      requests.push(...parsed.block.items);
      i = parsed.nextIndex;
      continue;
    }

    if (line !== SEPARATOR_MARKER) introLines.push(line);
    i++;
  }

  return {
    block: {
      heading: 'PRAYER',
      intro: introLines.length ? introLines.join(' ') : undefined,
      requests,
    },
    nextIndex: i,
  };
}

/** Parse a PRAYER section starting from a WHEREFORE line (no explicit PRAYER heading). */
function parsePrayerFromWherefore(lines: string[], startIndex: number): { block: PrayerBlock; nextIndex: number } {
  let i = startIndex;
  const introLines: string[] = [];
  const requests: string[] = [];

  // The WHEREFORE line itself is part of the intro
  introLines.push(lines[i]);
  i++;

  while (i < lines.length) {
    const line = lines[i];
    if (RESPECTFULLY_RE.test(line) || CERTIFICATE_RE.test(line)) break;

    if (NUMBERED_ITEM_RE.test(line)) {
      const parsed = collectNumberedList(lines, i);
      requests.push(...parsed.block.items);
      i = parsed.nextIndex;
      continue;
    }

    if (line !== SEPARATOR_MARKER) introLines.push(line);
    i++;
  }

  return {
    block: {
      heading: 'PRAYER',
      intro: introLines.length ? introLines.join(' ') : undefined,
      requests,
    },
    nextIndex: i,
  };
}

// ═══════════════════════════════════════════════════════════════
// Signature Parser
// ═══════════════════════════════════════════════════════════════

/** Parse a signature block starting from "Respectfully submitted,". */
function parseSignature(lines: string[], startIndex: number): { block: SignatureBlock; nextIndex: number } {
  let i = startIndex;
  const signerLines: string[] = [];
  const intro = lines[i];
  i++;

  while (i < lines.length) {
    const line = lines[i];
    if (CERTIFICATE_RE.test(line)) break;
    if (line !== SEPARATOR_MARKER) signerLines.push(line);
    i++;
  }

  return {
    block: { intro, signerLines },
    nextIndex: i,
  };
}

// ═══════════════════════════════════════════════════════════════
// Certificate Parser
// ═══════════════════════════════════════════════════════════════

/** Parse a Certificate of Service block. */
function parseCertificate(lines: string[], startIndex: number): { block: CertificateBlock; nextIndex: number } {
  let i = startIndex + 1;
  const bodyLines: string[] = [];
  const signerLines: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line !== SEPARATOR_MARKER) {
      // Match real signature markers: underline bars, /s/ signatures,
      // or lines where title words appear at end (not in running text)
      if (/^_{5,}$/.test(line) || /\/s\//i.test(line) || /\b(?:Esq\.|Pro Se|Attorney|Petitioner)\s*[.,;:]*$/i.test(line)) {
        signerLines.push(line);
      } else {
        bodyLines.push(line);
      }
    }
    i++;
  }

  return {
    block: { heading: 'CERTIFICATE OF SERVICE', bodyLines, signerLines },
    nextIndex: i,
  };
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

/** Deduplicate an array while preserving order. */
function dedupePreserve(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** Convert a heading into a URL-safe slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ═══════════════════════════════════════════════════════════════
// Preflight Detection (convenience export)
// ═══════════════════════════════════════════════════════════════

/** Quick structural check for missing required sections. */
export function detectMissingRequiredSections(doc: LegalDocument) {
  return {
    hasCaption: !!doc.caption,
    hasTitle: !!doc.title.main && doc.title.main !== 'UNTITLED DOCUMENT',
    hasPrayer: !!doc.prayer,
    hasSignature: !!doc.signature,
    hasCertificate: !!doc.certificate,
    hasSections: doc.sections.length > 0,
  };
}
