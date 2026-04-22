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
  LegalBlock,
  LegalSection,
  PrayerBlock,
  SignatureBlock,
  CertificateBlock,
  VerificationBlock,
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
const VERIFICATION_RE = /^(VERIFICATION|DECLARATION|UNSWORN DECLARATION)$/i;
const CLOSING_RE = /^(Respectfully|Signed on|Dated:)/i;

const ROMAN_HEADING_RE = /^([IVXLC]+)\.\s+(.+)$/i;
const LETTER_HEADING_RE = /^([A-Z])\.\s+(.+)$/;
const LETTERED_LIST_RE = /^[A-Z]\.\s+/;
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
  const { introBlocks, sections, prayer, signature, certificate, verification } =
    extractBodyStructure(lines, title.main);

  return {
    metadata: {
      causeNumber,
      court: caption?.rightLines.find((line) => /court/i.test(line)),
      district: caption?.rightLines.find((line) => /district|division/i.test(line)),
      county: caption?.rightLines.find((line) => /county/i.test(line)),
    },
    caption,
    title,
    introBlocks,
    sections,
    prayer,
    signature,
    certificate,
    verification,
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
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // smart double quotes → ASCII
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // smart single quotes → ASCII
    .replace(/[‐–—]/g, '—')         // normalize dashes
    .replace(/\t/g, ' ')            // tabs → space
    .replace(/[ ]{2,}/g, ' ')       // collapse multiple spaces
    .replace(/\n[ ]+/g, '\n')       // strip leading spaces on lines
    .replace(/⸻/g, SEPARATOR_MARKER)
    .trim();
}

/**
 * Split text into trimmed lines, preserving blank-line separators
 * as empty strings so downstream paragraph coalescing can detect
 * logical paragraph boundaries.
 */
function splitLines(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim());
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
  // When title is NOT found, bound the caption window to the header
  // region (up to TO THE HONORABLE or first section heading, max 25 lines)
  // to avoid parsing body content as caption.
  let captionSlice: string[];
  if (titleIndex !== -1) {
    captionSlice = lines.slice(0, titleIndex);
  } else {
    const headerBound = lines.findIndex(
      (l) => l !== '' && (TO_HONORABLE_RE.test(l) || ROMAN_HEADING_RE.test(l))
    );
    const limit = headerBound !== -1 ? headerBound : Math.min(lines.length, 25);
    captionSlice = lines.slice(0, limit);
  }

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
    styleHint: 'texas' as const,
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
    // Left = plaintiff lines (before v.), excluding cause/docket/court metadata
    const leftLines = lines
      .slice(0, versusIndex)
      .filter((l) => !CAUSE_RE.test(l) && !DOCKET_RE.test(l) && !/COURT/i.test(l));
    // Right = defendant lines (after v.) + court metadata
    const defendantLines = lines
      .slice(versusIndex + 1)
      .filter((l) => !CAUSE_RE.test(l) && !DOCKET_RE.test(l) && !/COURT/i.test(l)
        && !/Civil Action|Case No|Judge|Division/i.test(l));
    const rightLines = [
      ...defendantLines,
      ...courtLines,
      ...lines.filter((l) => /Civil Action|Case No|Judge|Division/i.test(l)),
    ];

    return {
      causeLine,
      leftLines: dedupePreserve(leftLines).slice(-6),
      centerLines: ['v.'],
      rightLines: dedupePreserve(rightLines).slice(0, 6),
      styleHint: 'federal' as const,
    };
  }

  // Try inline "v." or "vs." within a line (e.g., "JANE DOE v. JOHN SMITH")
  // Use lookahead so the period is consumed but we stop before the next word
  const inlineVersusRe = /\b(?:v\.|vs\.)(?=\s|$)/i;
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
      const defendantLines = lines
        .slice(inlineIndex + 1)
        .filter(
          (l) =>
            l !== '' &&
            !CAUSE_RE.test(l) &&
            !DOCKET_RE.test(l) &&
            !/COURT/i.test(l) &&
            !/Civil Action|Case No|Judge|Division/i.test(l),
        );
      const rightLines = [
        ...(rightPart ? [rightPart] : []),
        ...defendantLines,
        ...courtLines,
        ...lines.filter((l) => /Civil Action|Case No|Judge|Division/i.test(l)),
      ];

      return {
        causeLine,
        leftLines: dedupePreserve(leftLines).slice(-6),
        centerLines: ['v.'],
        rightLines: dedupePreserve(rightLines).slice(0, 6),
        styleHint: 'federal' as const,
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
    styleHint: /IN RE|IN THE MATTER/i.test(leftLines.join(' ')) ? 'in_re' as const : 'generic' as const,
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

/**
 * Find the title line index, bounded to the header region.
 * Only scans up to "TO THE HONORABLE" or the first section heading
 * (Roman numeral) to avoid matching body sentences.
 */
function findTitleIndex(lines: string[]): number {
  // Determine header boundary
  const headerBound = lines.findIndex(
    (l) => TO_HONORABLE_RE.test(l) || ROMAN_HEADING_RE.test(l)
  );
  const searchLimit = headerBound !== -1 ? headerBound : Math.min(lines.length, 25);

  for (let i = 0; i < searchLimit; i++) {
    const line = lines[i];
    if (!line) continue; // skip blank separator lines
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

/** Extract the document title, optional subtitle, and additional title lines from pasted text. */
function extractGeneralTitle(lines: string[]): { main: string; subtitle?: string; additionalTitleLines?: string[] } {
  const titleIndex = findTitleIndex(lines);

  if (titleIndex === -1) {
    return { main: 'UNTITLED DOCUMENT' };
  }

  const main = lines[titleIndex];

  // Merge consecutive uppercase title-word lines into additional title lines
  const additionalTitleLines: string[] = [];
  let nextIdx = titleIndex + 1;
  while (
    nextIdx < lines.length &&
    lines[nextIdx] &&
    !lines[nextIdx].startsWith('(') &&
    TITLE_CANDIDATE_RE.test(lines[nextIdx]) &&
    lines[nextIdx] === lines[nextIdx].toUpperCase() &&
    !CAUSE_RE.test(lines[nextIdx]) &&
    !DOCKET_RE.test(lines[nextIdx]) &&
    !TO_HONORABLE_RE.test(lines[nextIdx]) &&
    !ROMAN_HEADING_RE.test(lines[nextIdx])
  ) {
    additionalTitleLines.push(lines[nextIdx]);
    nextIdx++;
  }

  const subtitle = lines[nextIdx]?.startsWith('(') ? lines[nextIdx] : undefined;

  return {
    main,
    subtitle,
    ...(additionalTitleLines.length ? { additionalTitleLines } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// Body Structure Extraction
// ═══════════════════════════════════════════════════════════════

/** Extract intro blocks, body sections, prayer, signature, certificate, and verification. */
function extractBodyStructure(
  lines: string[],
  mainTitle: string,
): {
  introBlocks: LegalBlock[];
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
  verification: VerificationBlock | null;
} {
  const titleIndex = lines.findIndex((l) => l === mainTitle);
  const bodyStart = lines.findIndex((l) => TO_HONORABLE_RE.test(l));
  // Skip past subtitle line (parenthetical) to avoid duplicating it as body paragraph
  const hasSubtitle =
    titleIndex !== -1 && lines[titleIndex + 1]?.startsWith('(');
  const startIndex =
    bodyStart !== -1
      ? bodyStart
      : titleIndex !== -1
        ? titleIndex + (hasSubtitle ? 2 : 1)
        : 0;

  const bodyLines = explodeMergedNumberedParagraphs(lines.slice(startIndex));

  const introBlocks: LegalBlock[] = [];
  const sections: LegalSection[] = [];
  let prayer: PrayerBlock | null = null;
  let signature: SignatureBlock | null = null;
  let certificate: CertificateBlock | null = null;
  let verification: VerificationBlock | null = null;
  let currentSection: LegalSection | null = null;
  let foundFirstSection = false;

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

    // ── Signature (extended closing detection) ──
    if (RESPECTFULLY_RE.test(line) || (!signature && CLOSING_RE.test(line))) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parseSignature(bodyLines, i);
      signature = parsed.block;
      i = parsed.nextIndex;
      continue;
    }

    // ── Verification / Declaration ──
    if (VERIFICATION_RE.test(line)) {
      if (currentSection) { sections.push(currentSection); currentSection = null; }
      const parsed = parseVerification(bodyLines, i);
      verification = parsed.block;
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
      foundFirstSection = true;
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
      const block = { type: 'paragraph' as const, text: `${letter[1]}. ${letter[2]}` };
      if (!foundFirstSection) {
        introBlocks.push(block);
      } else {
        if (!currentSection) {
          currentSection = { id: 'intro', heading: '', level: 'plain', blocks: [] };
        }
        currentSection.blocks.push(block);
      }
      i++;
      continue;
    }

    // ── Ensure we have a section container (only after first Roman heading) ──
    if (foundFirstSection && !currentSection) {
      currentSection = { id: 'plain', heading: '', level: 'plain', blocks: [] };
    }

    // ── Numbered list ──
    if (NUMBERED_ITEM_RE.test(line)) {
      const parsed = collectNumberedList(bodyLines, i);
      if (!foundFirstSection) {
        introBlocks.push(parsed.block);
      } else {
        if (!currentSection) currentSection = { id: 'plain', heading: '', level: 'plain', blocks: [] };
        currentSection.blocks.push(parsed.block);
      }
      i = parsed.nextIndex;
      continue;
    }

    // ── Bullet list ──
    if (BULLET_ITEM_RE.test(line)) {
      const parsed = collectBulletList(bodyLines, i);
      if (!foundFirstSection) {
        introBlocks.push(parsed.block);
      } else {
        if (!currentSection) currentSection = { id: 'plain', heading: '', level: 'plain', blocks: [] };
        currentSection.blocks.push(parsed.block);
      }
      i = parsed.nextIndex;
      continue;
    }

    // ── Lettered list (A. B. C.) — only when multiple consecutive ──
    if (LETTERED_LIST_RE.test(line) && !LETTER_HEADING_RE.test(line)) {
      const parsed = collectLetteredList(bodyLines, i);
      if (parsed.block.items.length > 1) {
        if (!foundFirstSection) {
          introBlocks.push(parsed.block);
        } else {
          if (!currentSection) currentSection = { id: 'plain', heading: '', level: 'plain', blocks: [] };
          currentSection.blocks.push(parsed.block);
        }
        i = parsed.nextIndex;
        continue;
      }
    }

    // ── Regular paragraph ──
    // Coalesce consecutive non-structural lines into a single paragraph
    // to avoid emitting one <p> per hard-wrapped visual line.
    if (line !== SEPARATOR_MARKER && line !== '') {
      const paragraphLines: string[] = [line];
      while (
        i + 1 < bodyLines.length &&
        bodyLines[i + 1] !== '' &&
        bodyLines[i + 1] !== SEPARATOR_MARKER &&
        !ROMAN_HEADING_RE.test(bodyLines[i + 1]) &&
        !LETTER_HEADING_RE.test(bodyLines[i + 1]) &&
        !NUMBERED_ITEM_RE.test(bodyLines[i + 1]) &&
        !BULLET_ITEM_RE.test(bodyLines[i + 1]) &&
        !PRAYER_RE.test(bodyLines[i + 1]) &&
        !WHEREFORE_RE.test(bodyLines[i + 1]) &&
        !CERTIFICATE_RE.test(bodyLines[i + 1]) &&
        !RESPECTFULLY_RE.test(bodyLines[i + 1]) &&
        !CLOSING_RE.test(bodyLines[i + 1]) &&
        !VERIFICATION_RE.test(bodyLines[i + 1]) &&
        !TO_HONORABLE_RE.test(bodyLines[i + 1])
      ) {
        i++;
        paragraphLines.push(bodyLines[i]);
      }
      const block = { type: 'paragraph' as const, text: paragraphLines.join(' ') };
      if (!foundFirstSection) {
        introBlocks.push(block);
      } else {
        if (!currentSection) currentSection = { id: 'plain', heading: '', level: 'plain', blocks: [] };
        currentSection.blocks.push(block);
      }
    }

    i++;
  }

  if (currentSection) sections.push(currentSection);

  return { introBlocks, sections, prayer, signature, certificate, verification };
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

/**
 * Collect lettered list items (A., B., C.) starting at startIndex.
 * Handles wrapped lines the same way as numbered lists.
 */
function collectLetteredList(lines: string[], startIndex: number) {
  const items: string[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (LETTERED_LIST_RE.test(line)) {
      items.push(line.replace(/^[A-Z]\.\s+/, '').trim());
      i++;
    } else if (
      items.length > 0 &&
      line.trim() &&
      !isStructuralLine(line)
    ) {
      items[items.length - 1] += ' ' + line.trim();
      i++;
    } else {
      break;
    }
  }

  return {
    block: { type: 'lettered_list', items } as const,
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
    CLOSING_RE.test(line) ||
    CERTIFICATE_RE.test(line) ||
    VERIFICATION_RE.test(line) ||
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

/** Parse a signature block starting from a closing line ("Respectfully submitted,", "Dated:", etc.). */
function parseSignature(lines: string[], startIndex: number): { block: SignatureBlock; nextIndex: number } {
  let i = startIndex;
  const signerLines: string[] = [];
  const intro = lines[i];
  i++;

  while (i < lines.length) {
    const line = lines[i];
    if (CERTIFICATE_RE.test(line) || VERIFICATION_RE.test(line)) break;
    if (line !== SEPARATOR_MARKER) signerLines.push(line);
    i++;
  }

  return {
    block: { intro, signerLines },
    nextIndex: i,
  };
}

// ═══════════════════════════════════════════════════════════════
// Verification Parser
// ═══════════════════════════════════════════════════════════════

/** Parse a verification/declaration block. */
function parseVerification(lines: string[], startIndex: number): { block: VerificationBlock; nextIndex: number } {
  const heading = lines[startIndex];
  let i = startIndex + 1;
  const bodyLines: string[] = [];
  const signerLines: string[] = [];
  let inSignerBlock = false;

  while (i < lines.length) {
    const line = lines[i];
    if (CERTIFICATE_RE.test(line)) break;

    if (line !== SEPARATOR_MARKER && line !== '') {
      const isSignatureBar = /^_{5,}$/.test(line);
      const isSlashSignature = /^\/s\/\s*\S+/i.test(line);

      if (isSignatureBar || isSlashSignature) {
        inSignerBlock = true;
        signerLines.push(line);
      } else if (inSignerBlock && line.trim() !== '') {
        signerLines.push(line);
      } else {
        if (inSignerBlock) inSignerBlock = false;
        bodyLines.push(line);
      }
    }
    i++;
  }

  return {
    block: { heading, bodyLines, signerLines },
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
  let inSignerBlock = false;

  while (i < lines.length) {
    const line = lines[i];
    if (line !== SEPARATOR_MARKER) {
      // Match real signature markers: underline bars, /s/ signatures,
      // or lines where title words appear at end (not in running text).
      // Exclude common service-language phrases to avoid false positives.
      const isSignatureBar = /^_{5,}$/.test(line);
      const isSlashSignature = /^\/s\/\s*\S+/i.test(line);
      const isSignerTitle =
        /\b(?:Esq\.|Pro Se|Attorney|Petitioner)\s*[.,;:]*$/i.test(line) &&
        !/\b(?:served|service|counsel for|copy of)\b/i.test(line);

      if (isSignatureBar || isSlashSignature || isSignerTitle) {
        inSignerBlock = true;
        signerLines.push(line);
      } else if (inSignerBlock && line.trim() !== '') {
        // Keep contiguous signer metadata (name, address, bar number)
        signerLines.push(line);
      } else {
        if (inSignerBlock) inSignerBlock = false; // blank line ends signer block
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
