/**
 * Legal Document Structure Parser
 *
 * Deterministic regex parser that converts normalized legal text into
 * structured legal blocks. This is the most critical module in the pipeline.
 *
 * Step 3: normalizeLegalInput() → classifyLegalDocument() → parseLegalDocumentStructure()
 *
 * 🔒 RULES:
 * - Each numbered item becomes its own NumberedParagraphBlock (NEVER concatenated)
 * - Each bullet becomes its own item in a BulletListBlock
 * - Roman headings start new sections; alpha headings nest inside them
 * - Caption, signature, certificate, prayer are extracted as separate blocks
 * - Inline emphasis (COMES NOW, WHEREFORE) detected and stored as InlineRun[]
 */

import type {
  CaptionBlock,
  TitleBlock,
  LegalSection,
  LegalBlock,
  ParagraphBlock,
  NumberedParagraphBlock,
  BulletListBlock,
  PrayerBlock,
  SignatureBlock,
  CertificateBlock,
  VerificationBlock,
  InlineRun,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// Output Type
// ═══════════════════════════════════════════════════════════════

export type ParsedLegalDocument = {
  causeNumber?: string;
  caption: CaptionBlock | null;
  title: TitleBlock | null;
  salutation?: string;
  introBlocks: LegalBlock[];
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
  verification: VerificationBlock | null;
  confidence: ParseConfidence;
};

export type ParseConfidence = {
  captionConfidence: number;
  titleConfidence: number;
  sectionConfidence: number;
  closingBlockConfidence: number;
  overall: number;
};

// ═══════════════════════════════════════════════════════════════
// Regex Patterns
// ═══════════════════════════════════════════════════════════════

const P = {
  causeNumber: /^CAUSE\s+NO\.?\s*[:.]?\s*(.+)$/i,
  salutation: /^TO THE HONORABLE\b.*/i,
  comesNow: /^COMES NOW\b/i,
  romanHeading: /^(I{1,3}|IV|VI{0,3}|IX|X{1,3}|XI{1,3}|XIV|XV)\.\s+(.+)$/,
  alphaHeading: /^([A-Z])\.\s+(.+)$/,
  numberedParagraph: /^\s*(\d{1,3})\.\s+(.+)$/,
  bullet: /^\s*[•\-*]\s+(.+)$/,
  prayer: /^PRAYER\s*$/i,
  prayerAlt: /^(?:PRAYER FOR RELIEF|REQUESTED RELIEF|CONCLUSION AND PRAYER|CONCLUSION & PRAYER)\s*$/i,
  prayerIntro: /^WHEREFORE,?\s*PREMISES CONSIDERED/i,
  respectfully: /^Respectfully submitted,?\s*$/i,
  certificateOfService: /^CERTIFICATE OF SERVICE\s*$/i,
  verification: /^VERIFICATION\s*$/i,
  sectionSymbol: /^§\s*$/,
  captionLeft: /^IN THE INTEREST OF\b/i,
  captionRight: /^IN THE\s+(?:DISTRICT|COUNTY|FAMILY)\s+COURT\s*$/i,
  horizontalRule: /^[-_=]{3,}\s*$/,
  allCapsLine: /^[A-Z\s,.'()§\d\-–—:;]+$/,
};

// ═══════════════════════════════════════════════════════════════
// Main Parser
// ═══════════════════════════════════════════════════════════════

/**
 * Parse normalized legal text into a structured ParsedLegalDocument.
 *
 * Extracts caption, title, intro blocks (salutation, COMES NOW),
 * body sections (roman/alpha/numbered/bullet), prayer, signature,
 * certificate, and verification using deterministic regex patterns.
 *
 * @param text - Normalized legal document text
 * @param _options - Optional parsing hints (document family, jurisdiction)
 * @returns Parsed legal document structure with confidence scores
 */
export function parseLegalDocumentStructure(
  text: string,
  _options?: { documentFamily?: string; jurisdictionHint?: string },
): ParsedLegalDocument {
  const lines = text.split('\n');
  let cursor = 0;

  // ── Extract caption ───────────────────────────────────────
  const { caption, causeNumber, nextIndex: afterCaption } = extractCaption(lines, cursor);
  cursor = afterCaption;

  // ── Extract title ─────────────────────────────────────────
  const { title, nextIndex: afterTitle } = extractTitle(lines, cursor);
  cursor = afterTitle;

  // ── Extract intro blocks (salutation, COMES NOW) ──────────
  const { introBlocks, nextIndex: afterIntro } = extractIntroBlocks(lines, cursor);
  cursor = afterIntro;

  // ── Parse body sections, prayer, signature, certificate ───
  const {
    sections,
    prayer,
    signature,
    certificate,
    verification,
  } = parseBodySections(lines, cursor);

  // ── Score confidence ──────────────────────────────────────
  const confidence = scoreConfidence({ caption, title, sections, prayer, signature });

  return {
    causeNumber,
    caption,
    title,
    introBlocks,
    sections,
    prayer,
    signature,
    certificate,
    verification,
    confidence,
  };
}

// ═══════════════════════════════════════════════════════════════
// Caption Extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract the caption block from the top of a legal document.
 *
 * Scans the first ~30 lines for caption signals (§, CAUSE NO., IN THE INTEREST OF,
 * DISTRICT COURT, etc.) and builds a 3-column caption structure for Texas pleadings.
 *
 * @param lines - All lines of the document
 * @param startIndex - Line index to start scanning from
 * @returns Caption block (or null), cause number, and next line index
 */
function extractCaption(
  lines: string[],
  startIndex: number,
): { caption: CaptionBlock | null; causeNumber?: string; nextIndex: number } {
  let cursor = startIndex;
  let causeNumber: string | undefined;
  const leftLines: string[] = [];
  const centerLines: string[] = [];
  const rightLines: string[] = [];
  let foundCaptionSignal = false;

  // Scan first ~30 lines for caption elements
  const scanLimit = Math.min(startIndex + 30, lines.length);

  for (let i = cursor; i < scanLimit; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Cause number
    const causeMatch = line.match(P.causeNumber);
    if (causeMatch) {
      causeNumber = causeMatch[1].trim();
      cursor = i + 1;
      continue;
    }

    // Section symbol — marks caption region
    if (P.sectionSymbol.test(line)) {
      centerLines.push('§');
      foundCaptionSignal = true;
      cursor = i + 1;
      continue;
    }

    // Detect § inline with text: "IN THE INTEREST OF §  IN THE DISTRICT COURT"
    if (line.includes('§') && foundCaptionSignal === false) {
      const parts = line.split('§').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        leftLines.push(parts[0]);
        centerLines.push('§');
        rightLines.push(parts[1]);
        foundCaptionSignal = true;
        cursor = i + 1;
        continue;
      }
    }

    // If we already found § symbols, classify left/right
    if (foundCaptionSignal || causeNumber) {
      if (P.captionRight.test(line) || /JUDICIAL DISTRICT/i.test(line) || /COUNTY,\s*TEXAS/i.test(line)) {
        rightLines.push(line);
        cursor = i + 1;
        continue;
      }
      const isExplicitLeftCaption = P.captionLeft.test(line) || /A CHILD/i.test(line);
      const isHeuristicLeftCaption =
        foundCaptionSignal &&
        !P.romanHeading.test(line) &&
        P.allCapsLine.test(line) &&
        rightLines.length === 0 &&
        line.length < 60;
      if (isExplicitLeftCaption || isHeuristicLeftCaption) {
        leftLines.push(line);
        cursor = i + 1;
        continue;
      }
    }

    // Horizontal rule after caption — end caption zone
    if (P.horizontalRule.test(line)) {
      cursor = i + 1;
      break;
    }

    // If we hit a title-like line or body content, stop caption
    if (P.salutation.test(line) || P.comesNow.test(line) || P.romanHeading.test(line)) {
      break;
    }

    // If we've found caption data and hit a non-caption line, stop
    if (foundCaptionSignal && !P.allCapsLine.test(line)) {
      break;
    }
  }

  if (!foundCaptionSignal && leftLines.length === 0 && rightLines.length === 0) {
    return { caption: null, causeNumber, nextIndex: cursor };
  }

  // Pad center lines to match max of left/right
  const maxRows = Math.max(leftLines.length, rightLines.length, 1);
  while (centerLines.length < maxRows) {
    centerLines.push('§');
  }

  return {
    caption: {
      causeLine: causeNumber ? `CAUSE NO. ${causeNumber}` : undefined,
      leftLines,
      centerLines,
      rightLines,
      styleHint: 'texas',
    },
    causeNumber,
    nextIndex: cursor,
  };
}

// ═══════════════════════════════════════════════════════════════
// Title Extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract the title and optional subtitle from the document.
 *
 * Looks for centered all-caps lines after the caption zone. Checks for
 * a subtitle in parentheses or mixed case on the following line.
 *
 * @param lines - All lines of the document
 * @param startIndex - Line index to start scanning from
 * @returns Title block (or null) and next line index
 */
function extractTitle(
  lines: string[],
  startIndex: number,
): { title: TitleBlock | null; nextIndex: number } {
  let cursor = startIndex;
  const scanLimit = Math.min(startIndex + 15, lines.length);

  for (let i = cursor; i < scanLimit; i++) {
    const line = lines[i].trim();
    if (!line || P.horizontalRule.test(line)) {
      cursor = i + 1;
      continue;
    }

    // Skip if we hit body content
    if (P.salutation.test(line) || P.comesNow.test(line) || P.romanHeading.test(line)) {
      break;
    }

    // Title candidate: centered caps line that's not a heading
    if (P.allCapsLine.test(line) && line.length > 15 && !P.causeNumber.test(line)) {
      const main = line;
      cursor = i + 1;

      // Check for subtitle (next non-empty, non-rule line in parentheses or mixed case)
      let subtitle: string | undefined;
      for (let j = cursor; j < Math.min(cursor + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine || P.horizontalRule.test(nextLine)) continue;
        if (nextLine.startsWith('(') || (!P.allCapsLine.test(nextLine) && nextLine.length > 10)) {
          subtitle = nextLine;
          cursor = j + 1;
        }
        break;
      }

      // Skip trailing horizontal rule
      while (cursor < lines.length && P.horizontalRule.test(lines[cursor].trim())) {
        cursor++;
      }

      return { title: { main, subtitle }, nextIndex: cursor };
    }
  }

  return { title: null, nextIndex: cursor };
}

// ═══════════════════════════════════════════════════════════════
// Intro Block Extraction
// ═══════════════════════════════════════════════════════════════

/**
 * Extract introductory blocks before the first body section.
 *
 * Captures the salutation ("TO THE HONORABLE JUDGE...") and the COMES NOW
 * introductory paragraph, including inline bold emphasis on "COMES NOW".
 *
 * @param lines - All lines of the document
 * @param startIndex - Line index to start scanning from
 * @returns Intro blocks and next line index
 */
function extractIntroBlocks(
  lines: string[],
  startIndex: number,
): { introBlocks: LegalBlock[]; nextIndex: number } {
  const introBlocks: LegalBlock[] = [];
  let cursor = startIndex;

  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (P.horizontalRule.test(line)) continue;

    // Salutation
    if (P.salutation.test(line)) {
      introBlocks.push({ type: 'paragraph', text: line });
      cursor = i + 1;
      continue;
    }

    // COMES NOW paragraph — detect and build with inline bold
    if (P.comesNow.test(line)) {
      // Collect multi-line COMES NOW paragraph
      let fullText = line;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (
          !nextLine ||
          P.horizontalRule.test(nextLine) ||
          P.romanHeading.test(nextLine) ||
          P.numberedParagraph.test(nextLine) ||
          P.prayer.test(nextLine) ||
          P.prayerAlt.test(nextLine) ||
          P.respectfully.test(nextLine) ||
          P.certificateOfService.test(nextLine) ||
          P.verification.test(nextLine)
        ) break;
        fullText += ' ' + nextLine;
        cursor = j + 1;
      }

      const runs = buildComesNowRuns(fullText);
      introBlocks.push({ type: 'paragraph', text: fullText, runs });
      if (cursor <= i) cursor = i + 1;
      continue;
    }

    // If we hit a structural boundary, stop intro
    if (
      P.romanHeading.test(line) ||
      P.numberedParagraph.test(line) ||
      P.prayer.test(line) ||
      P.prayerAlt.test(line) ||
      P.respectfully.test(line) ||
      P.certificateOfService.test(line) ||
      P.verification.test(line)
    ) {
      break;
    }

    // Other intro paragraphs
    introBlocks.push({ type: 'paragraph', text: line });
    cursor = i + 1;
  }

  return { introBlocks, nextIndex: cursor };
}

// ═══════════════════════════════════════════════════════════════
// Body Section Parser
// ═══════════════════════════════════════════════════════════════

/**
 * Parse the body of the legal document into sections, prayer, signature,
 * certificate, and verification blocks.
 *
 * Uses a state machine with mode switching to route lines into the
 * appropriate block type. Roman headings start new sections, alpha
 * headings nest inside them, and numbered paragraphs are individual blocks.
 *
 * @param lines - All lines of the document
 * @param startIndex - Line index to start parsing from
 * @returns Body sections, prayer, signature, certificate, and verification
 */
function parseBodySections(lines: string[], startIndex: number): {
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
  verification: VerificationBlock | null;
} {
  const sections: LegalSection[] = [];
  let prayer: PrayerBlock | null = null;
  let signature: SignatureBlock | null = null;
  let certificate: CertificateBlock | null = null;
  let verification: VerificationBlock | null = null;

  let currentRoman: LegalSection | null = null;
  let currentAlpha: LegalSection | null = null;
  let sectionCounter = 0;

  type Mode =
    | 'body'
    | 'prayer'
    | 'signature'
    | 'certificate'
    | 'certificate_signature'
    | 'verification'
    | 'verification_signature';
  let mode: Mode = 'body';

  const prayerBlocks: LegalBlock[] = [];
  let prayerIntroText: string | undefined;
  let prayerIntroRuns: InlineRun[] | undefined;
  const signerLines: string[] = [];
  const certBodyLines: string[] = [];
  const certSignerLines: string[] = [];
  const verifyBodyLines: string[] = [];
  const verifySignerLines: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (P.horizontalRule.test(line)) continue;

    // ── Mode switches ───────────────────────────────────────
    if (P.prayer.test(line) || P.prayerAlt.test(line)) {
      finalizeCurrentSections(currentRoman, currentAlpha, sections);
      currentRoman = null;
      currentAlpha = null;
      mode = 'prayer';
      continue;
    }

    if (P.respectfully.test(line)) {
      if (mode === 'certificate') {
        mode = 'certificate_signature';
      } else if (mode === 'verification') {
        mode = 'verification_signature';
      } else {
        mode = 'signature';
      }
      continue;
    }

    if (P.certificateOfService.test(line)) {
      mode = 'certificate';
      continue;
    }

    if (P.verification.test(line)) {
      mode = 'verification';
      continue;
    }

    // ── Handle based on mode ────────────────────────────────
    switch (mode) {
      case 'prayer':
        handlePrayerLine(line, prayerBlocks, { prayerIntroText, prayerIntroRuns, set: (t, r) => { prayerIntroText = t; prayerIntroRuns = r; } });
        break;
      case 'signature':
        signerLines.push(line);
        break;
      case 'certificate':
        certBodyLines.push(line);
        break;
      case 'certificate_signature':
        certSignerLines.push(line);
        break;
      case 'verification':
        verifyBodyLines.push(line);
        break;
      case 'verification_signature':
        verifySignerLines.push(line);
        break;
      case 'body':
        handleBodyLine(line, i, lines, sections, { currentRoman, currentAlpha, sectionCounter },
          (r) => { currentRoman = r; },
          (a) => { currentAlpha = a; },
          () => { sectionCounter++; return sectionCounter; },
        );
        break;
    }
  }

  // Finalize any open sections
  finalizeCurrentSections(currentRoman, currentAlpha, sections);

  // Build prayer
  if (prayerBlocks.length > 0 || prayerIntroText) {
    const requests = prayerBlocks
      .filter((b): b is NumberedParagraphBlock => b.type === 'numbered_paragraph')
      .map(b => b.text);
    const prayerParagraphs = prayerBlocks
      .filter((b): b is ParagraphBlock => b.type === 'paragraph')
      .map(b => b.text);
    const introText = prayerIntroText ?? prayerParagraphs[0];
    // When intro came from WHEREFORE detection, all prayerParagraphs are requests.
    // When intro is taken from prayerParagraphs[0], skip it in requests.
    const fallbackRequests = prayerIntroText ? prayerParagraphs : prayerParagraphs.slice(1);
    prayer = {
      heading: 'PRAYER',
      intro: introText,
      introRuns: prayerIntroRuns,
      requests: requests.length > 0 ? requests : fallbackRequests,
    };
  }

  // Build signature
  if (signerLines.length > 0) {
    signature = { intro: 'Respectfully submitted,', signerLines };
  }

  // Build certificate
  if (certBodyLines.length > 0 || certSignerLines.length > 0) {
    certificate = {
      heading: 'CERTIFICATE OF SERVICE',
      bodyLines: certBodyLines,
      signerLines: certSignerLines,
    };
  }

  // Build verification
  if (verifyBodyLines.length > 0 || verifySignerLines.length > 0) {
    verification = {
      heading: 'VERIFICATION',
      bodyLines: verifyBodyLines,
      signerLines: verifySignerLines,
    };
  }

  return { sections, prayer, signature, certificate, verification };
}

// ═══════════════════════════════════════════════════════════════
// Body Line Handler
// ═══════════════════════════════════════════════════════════════

/**
 * Handle a single line in body mode — classifies and routes to the
 * appropriate block type (roman heading, alpha heading, numbered paragraph,
 * bullet, or regular paragraph).
 */
function handleBodyLine(
  line: string,
  _lineIndex: number,
  _lines: string[],
  sections: LegalSection[],
  state: { currentRoman: LegalSection | null; currentAlpha: LegalSection | null; sectionCounter: number },
  setRoman: (s: LegalSection | null) => void,
  setAlpha: (s: LegalSection | null) => void,
  nextId: () => number,
): void {
  // ── Roman heading ─────────────────────────────────────────
  const romanMatch = line.match(P.romanHeading);
  if (romanMatch) {
    finalizeCurrentSections(state.currentRoman, state.currentAlpha, sections);
    const section: LegalSection = {
      id: `section_${nextId()}`,
      heading: `${romanMatch[1]}. ${romanMatch[2].toUpperCase()}`,
      level: 'roman',
      blocks: [],
    };
    setRoman(section);
    setAlpha(null);
    state.currentRoman = section;
    state.currentAlpha = null;
    return;
  }

  // ── Alpha heading ─────────────────────────────────────────
  const alphaMatch = line.match(P.alphaHeading);
  if (alphaMatch && state.currentRoman) {
    if (state.currentAlpha) {
      state.currentRoman.blocks.push(...convertAlphaToBlocks(state.currentAlpha));
    }
    const section: LegalSection = {
      id: `section_${nextId()}`,
      heading: `${alphaMatch[1]}. ${alphaMatch[2].toUpperCase()}`,
      level: 'letter',
      blocks: [],
    };
    setAlpha(section);
    state.currentAlpha = section;
    return;
  }

  // ── Numbered paragraph ────────────────────────────────────
  const numMatch = line.match(P.numberedParagraph);
  if (numMatch) {
    const block: NumberedParagraphBlock = {
      type: 'numbered_paragraph',
      number: parseInt(numMatch[1], 10),
      text: numMatch[2],
    };
    pushToCurrentContainer(block, state, (s) => { setRoman(s); state.currentRoman = s; }, nextId);
    return;
  }

  // ── Bullet ────────────────────────────────────────────────
  const bulletMatch = line.match(P.bullet);
  if (bulletMatch) {
    // Ensure a section exists (creates preamble if needed)
    if (!state.currentRoman && !state.currentAlpha) {
      pushToCurrentContainer(
        { type: 'bullet_list', items: [bulletMatch[1]] },
        state,
        (s) => { setRoman(s); state.currentRoman = s; },
        nextId,
      );
    } else {
      // Add to existing bullet list or create new one
      const container = getActiveBlocks(state);
      const lastBlock = container[container.length - 1];
      if (lastBlock && lastBlock.type === 'bullet_list') {
        lastBlock.items.push(bulletMatch[1]);
      } else {
        container.push({ type: 'bullet_list', items: [bulletMatch[1]] });
      }
    }
    return;
  }

  // ── Regular paragraph ─────────────────────────────────────
  const block: ParagraphBlock = { type: 'paragraph', text: line };
  pushToCurrentContainer(block, state, (s) => { setRoman(s); state.currentRoman = s; }, nextId);
}

/** Handle a single line in prayer mode — detects WHEREFORE intro, numbered requests, and body text. */
function handlePrayerLine(
  line: string,
  blocks: LegalBlock[],
  intro: { prayerIntroText?: string; prayerIntroRuns?: InlineRun[]; set: (t: string, r?: InlineRun[]) => void },
): void {
  // WHEREFORE intro
  if (P.prayerIntro.test(line) && !intro.prayerIntroText) {
    const runs = buildWhereforeRuns(line);
    intro.set(line, runs);
    return;
  }

  // Numbered requests
  const numMatch = line.match(P.numberedParagraph);
  if (numMatch) {
    blocks.push({
      type: 'numbered_paragraph',
      number: parseInt(numMatch[1], 10),
      text: numMatch[2],
    });
    return;
  }

  // Regular paragraph in prayer
  if (!intro.prayerIntroText) {
    intro.set(line);
  } else {
    blocks.push({ type: 'paragraph', text: line });
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Push a block to the currently active section (alpha subsection or roman section).
 * If no section exists yet, creates an implicit preamble section to prevent data loss. */
function pushToCurrentContainer(
  block: LegalBlock,
  state: {
    currentAlpha: LegalSection | null;
    currentRoman: LegalSection | null;
    sectionCounter: number;
  },
  setRoman?: (s: LegalSection) => void,
  nextId?: () => number,
): void {
  if (state.currentAlpha) {
    state.currentAlpha.blocks.push(block);
  } else if (state.currentRoman) {
    state.currentRoman.blocks.push(block);
  } else {
    // Create implicit preamble section for pre-heading content
    const preamble: LegalSection = {
      id: `section_${nextId ? nextId() : ++state.sectionCounter}`,
      heading: '',
      level: 'roman',
      blocks: [block],
    };
    state.currentRoman = preamble;
    if (setRoman) setRoman(preamble);
  }
}

/** Get the blocks array from the most specific active section (alpha > roman). */
function getActiveBlocks(
  state: { currentAlpha: LegalSection | null; currentRoman: LegalSection | null },
): LegalBlock[] {
  if (state.currentAlpha) return state.currentAlpha.blocks;
  if (state.currentRoman) return state.currentRoman.blocks;
  return [];
}

/** Finalize and push open roman/alpha sections to the sections array. */
function finalizeCurrentSections(
  roman: LegalSection | null,
  alpha: LegalSection | null,
  sections: LegalSection[],
): void {
  if (roman) {
    if (alpha) {
      roman.blocks.push(...convertAlphaToBlocks(alpha));
    }
    sections.push(roman);
  }
}

/** Convert an alpha subsection into blocks — a heading paragraph + its content blocks. */
function convertAlphaToBlocks(alpha: LegalSection): LegalBlock[] {
  // Alpha subsections are stored as a paragraph heading + their blocks
  const headingBlock: ParagraphBlock = { type: 'paragraph', text: `__ALPHA_HEADING__${alpha.heading}` };
  return [headingBlock, ...alpha.blocks];
}

// ── Inline Emphasis Builders ────────────────────────────────

/** Build InlineRun[] for a COMES NOW paragraph — first two words bold, rest normal. */
function buildComesNowRuns(text: string): InlineRun[] {
  const match = text.match(/^(COMES NOW)\s+(.+)$/i);
  if (!match) return [{ text }];
  return [
    { text: match[1], bold: true },
    { text: ' ' + match[2] },
  ];
}

/** Build InlineRun[] for a WHEREFORE paragraph — first phrase bold, rest normal. */
function buildWhereforeRuns(text: string): InlineRun[] {
  const match = text.match(/^(WHEREFORE,?\s*PREMISES CONSIDERED,?)\s*(.+)$/i);
  if (!match) return [{ text }];
  return [
    { text: match[1], bold: true },
    { text: ' ' + match[2] },
  ];
}

// ── Confidence Scoring ──────────────────────────────────────

/** Score parser confidence based on which structural elements were detected. */
function scoreConfidence(parts: {
  caption: CaptionBlock | null;
  title: TitleBlock | null;
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
}): ParseConfidence {
  const captionConfidence = parts.caption ? (parts.caption.leftLines.length > 0 ? 1.0 : 0.5) : 0;
  const titleConfidence = parts.title ? 1.0 : 0;
  const sectionConfidence = parts.sections.length > 0 ? Math.min(parts.sections.length / 3, 1.0) : 0;
  const closingBlockConfidence = (parts.prayer ? 0.5 : 0) + (parts.signature ? 0.5 : 0);

  const overall = (captionConfidence * 0.25 + titleConfidence * 0.25 + sectionConfidence * 0.3 + closingBlockConfidence * 0.2);

  return { captionConfidence, titleConfidence, sectionConfidence, closingBlockConfidence, overall };
}
