/**
 * Canonical Export → Legal Document Adapter
 *
 * Converts a CanonicalExportDocument (export stream model) into the
 * LegalDocument shape consumed by the Quick Generate renderer:
 *
 *   renderLegalDocumentHTML() → templateRenderer.ts → legalDocStyles.css
 *
 * This adapter is the ONLY bridge between the two models. Neither model
 * should be mutated to accommodate the other. The adapter converts on
 * the boundary, protecting both systems.
 *
 * Scope: court_document exports only. Non-court export types should
 * continue using their own renderers.
 */

import type { CanonicalExportDocument, CourtSection, ExportCaption } from './types';
import type {
  LegalDocument,
  CaptionBlock,
  TitleBlock,
  LegalSection,
  LegalBlock,
  ParagraphBlock,
  NumberedParagraphBlock,
  NumberedListBlock,
  BulletListBlock,
  PrayerBlock,
  SignatureBlock,
  CertificateBlock,
  VerificationBlock,
} from '@/lib/legal-docs/types';
import type {
  ExportJurisdictionProfile,
  QuickGenerateProfile,
  JurisdictionProfile,
} from '@/lib/jurisdiction/types';

// ═══════════════════════════════════════════════════════════════
// Court Document Context (plan step 8)
// ═══════════════════════════════════════════════════════════════

/** Court-specific context for building intro, prayer, signature. */
export type CourtDocumentContext = {
  filingPartyName?: string;
  filingPartyRole?: string;
  isProSe?: boolean;
  documentTitle?: string;
  documentKind?: string;
  prayerIntro?: string;
  prayerRequests?: string[];
};

// ═══════════════════════════════════════════════════════════════
// Prayer Heading Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Normalized prayer heading variants.
 * Checked against heading.trim().toUpperCase().
 */
const PRAYER_HEADINGS = new Set([
  'PRAYER',
  'PRAYER FOR RELIEF',
  'REQUESTED RELIEF',
  'CONCLUSION AND PRAYER',
  'CONCLUSION & PRAYER',
  'WHEREFORE',
]);

/** Test whether a section heading is a prayer heading. Exported for shared use. */
export function isPrayerHeading(heading: string | undefined): boolean {
  if (!heading) return false;
  return PRAYER_HEADINGS.has(heading.trim().toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// Document Adapter
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a CanonicalExportDocument into the LegalDocument shape
 * expected by the Quick Generate renderer.
 *
 * Only valid for court_document exports. Throws if called with
 * a non-court document.
 *
 * @param doc  - CanonicalExportDocument from the adapter layer
 * @param ctx  - Optional court-specific context (identity, prayer, signature)
 */
export function canonicalExportToLegalDocument(
  doc: CanonicalExportDocument,
  ctx?: CourtDocumentContext,
): LegalDocument {
  if (doc.path !== 'court_document') {
    throw new Error(
      `canonicalExportToLegalDocument only supports court_document exports, got "${doc.path}"`,
    );
  }

  // ── Extract court sections ────────────────────────────────
  const courtSections = doc.sections.filter(
    (s): s is CourtSection => s.kind === 'court_section',
  );

  // ── Separate prayer from body sections ────────────────────────
  const bodySections: CourtSection[] = [];
  let prayerSection: CourtSection | null = null;

  for (const section of courtSections) {
    if (isPrayerHeading(section.heading)) {
      // Only keep the first prayer section (dedup invariant 12)
      if (!prayerSection) prayerSection = section;
    } else {
      bodySections.push(section);
    }
  }

  // ── Dedup body sections (invariant 12 / >80 chars) ──────
  const dedupedSections = deduplicateSections(bodySections);

  // ── Build LegalDocument ───────────────────────────────
  const title: TitleBlock = {
    main: doc.title,
    subtitle: doc.subtitle,
  };

  const caption: CaptionBlock | null = doc.caption
    ? convertCaption(doc.caption)
    : null;

  // Assign per-level ordinals so roman sections get I, II, III
  // and letter sections get A, B, C independently.
  const levelCounters: Record<string, number> = {};
  const sections: LegalSection[] = dedupedSections.map((s) => {
    const level = detectSectionLevel(s.heading);
    levelCounters[level] = (levelCounters[level] ?? 0) + 1;
    return convertCourtSection(s, levelCounters[level]);
  });

  // ── Build intro blocks from court context ─────────────────
  const introBlocks = buildIntroBlocks(ctx, doc.title);

  // ── Build prayer ──────────────────────────────────────────
  // Prefer structured prayer from context; fallback to parsed section
  const prayer: PrayerBlock | null =
    (ctx?.prayerRequests?.length ?? 0) > 0
      ? { heading: 'PRAYER', intro: ctx!.prayerIntro, requests: ctx!.prayerRequests! }
      : prayerSection
        ? convertPrayer(prayerSection)
        : null;

  // ── Build signature ───────────────────────────────────────
  const signature: SignatureBlock | null = buildSignatureBlock(doc, ctx);
  const certificate: CertificateBlock | null = doc.certificate ?? null;
  const verification: VerificationBlock | null = doc.verification ?? null;

  return {
    metadata: {
      causeNumber: doc.metadata.causeNumber,
      court: doc.metadata.jurisdiction?.courtName,
      district: doc.metadata.jurisdiction?.district,
      county: doc.metadata.jurisdiction?.county,
      jurisdiction: doc.metadata.jurisdiction?.state,
      documentType: doc.metadata.documentType,
      filingParty: ctx?.filingPartyName,
      partyRole: ctx?.filingPartyRole,
    },
    caption,
    title,
    introBlocks,
    sections,
    prayer,
    signature,
    certificate,
    verification,
    rawText: buildRawTextFromCanonicalExport(doc),
  };
}

// ═══════════════════════════════════════════════════════════════
// Caption Conversion
// ═══════════════════════════════════════════════════════════════

/** Map ExportCaption.style → CaptionBlock.styleHint */
const CAPTION_STYLE_MAP: Record<ExportCaption['style'], CaptionBlock['styleHint']> = {
  texas_pleading: 'texas',
  federal_caption: 'federal',
  generic_state_caption: 'generic',
  in_re_caption: 'in_re',
};

function convertCaption(caption: ExportCaption): CaptionBlock {
  return {
    causeLine: caption.causeLine,
    leftLines: caption.leftLines,
    centerLines: caption.centerLines,
    rightLines: caption.rightLines,
    styleHint: CAPTION_STYLE_MAP[caption.style] ?? 'generic',
  };
}

// ═══════════════════════════════════════════════════════════════
// Section Conversion
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a CourtSection (export model) to a LegalSection (QG model).
 *
 * Changes from original:
 * 1. Heading is normalized: strip leading Roman/letter numerals so the
 *    renderer can prepend its own via the ordinal field.
 * 2. Numbered items become individual `numbered_paragraph` blocks
 *    instead of a single `numbered_list`.
 * 3. Ordinal is assigned for deterministic rendering.
 */
function convertCourtSection(section: CourtSection, ordinal: number): LegalSection {
  const blocks: LegalBlock[] = [];

  // Paragraphs → ParagraphBlock[]
  if (section.paragraphs?.length) {
    for (const text of section.paragraphs) {
      blocks.push({ type: 'paragraph', text } satisfies ParagraphBlock);
    }
  }

  // Numbered items → individual NumberedParagraphBlock (not numbered_list)
  if (section.numberedItems?.length) {
    section.numberedItems.forEach((text, idx) => {
      blocks.push({
        type: 'numbered_paragraph',
        number: idx + 1,
        text,
      } satisfies NumberedParagraphBlock);
    });
  }

  // Bullet items → BulletListBlock
  if (section.bulletItems?.length) {
    blocks.push({
      type: 'bullet_list',
      items: section.bulletItems,
    } satisfies BulletListBlock);
  }

  return {
    id: section.id,
    heading: normalizeHeading(section.heading ?? ''),
    level: detectSectionLevel(section.heading),
    ordinal,
    blocks,
  };
}

/**
 * Strip leading Roman numeral or letter prefix from heading text.
 * "I. BACKGROUND" → "BACKGROUND"
 * "A. Overview" → "Overview"
 * "BACKGROUND" → "BACKGROUND" (unchanged)
 *
 * The renderer applies numbering via the ordinal field,
 * so storing the prefix in the heading causes double numbering.
 */
function normalizeHeading(heading: string): string {
  return heading
    .replace(/^[IVXLC]+\.\s+/i, '') // strip Roman prefix
    .replace(/^[A-Z]\.\s+/, '')      // strip letter prefix
    .trim();
}

/**
 * Detect the section level from the heading text.
 * Roman numeral headings (I., II., III.) → 'roman'
 * Letter headings (A., B., C.) → 'letter'
 * Everything else → 'plain'
 */
function detectSectionLevel(heading: string | undefined): 'roman' | 'letter' | 'plain' {
  if (!heading) return 'plain';
  const trimmed = heading.trim();
  if (/^[IVXLC]+\.\s/i.test(trimmed)) return 'roman';
  if (/^[A-Z]\.\s/.test(trimmed)) return 'letter';
  return 'plain';
}

// ═══════════════════════════════════════════════════════════════
// Intro Block Builder (plan section VII)
// ═══════════════════════════════════════════════════════════════

/** Document kinds that require a COMES NOW intro block. */
const INTRO_REQUIRED_KINDS = new Set([
  'motion', 'amended_motion', 'second_amended_motion',
  'third_amended_motion', 'response', 'petition',
]);

/**
 * Build intro blocks from court context.
 *
 * For motions: TO THE HONORABLE JUDGE + COMES NOW intro.
 * For declarations/affidavits/notices: no auto-generated intro.
 */
function buildIntroBlocks(
  ctx: CourtDocumentContext | undefined,
  docTitle: string,
): LegalBlock[] {
  if (!ctx?.filingPartyName || !ctx.filingPartyRole) return [];
  if (!INTRO_REQUIRED_KINDS.has(ctx.documentKind ?? '')) return [];

  const blocks: LegalBlock[] = [];

  // TO THE HONORABLE JUDGE
  blocks.push({
    type: 'paragraph',
    text: 'TO THE HONORABLE JUDGE OF SAID COURT:',
    runs: [{ text: 'TO THE HONORABLE JUDGE OF SAID COURT:', bold: true }],
  });

  // COMES NOW intro
  const proSeClause = ctx.isProSe ? ', appearing pro se,' : ',';
  const roleLabel = ctx.filingPartyRole.charAt(0).toUpperCase() +
    ctx.filingPartyRole.slice(1).toLowerCase();
  const title = ctx.documentTitle || docTitle;
  const comesNow =
    `COMES NOW ${ctx.filingPartyName}, ${roleLabel}${proSeClause} ` +
    `and files this ${title}, and respectfully shows the Court as follows:`;

  blocks.push({
    type: 'paragraph',
    text: comesNow,
    runs: [
      { text: 'COMES NOW ', bold: true },
      { text: `${ctx.filingPartyName}, ${roleLabel}${proSeClause} ` },
      { text: `and files this ${title}, and respectfully shows the Court as follows:` },
    ],
  });

  return blocks;
}

// ═══════════════════════════════════════════════════════════════
// Signature Block Builder (plan section VIII)
// ═══════════════════════════════════════════════════════════════

/**
 * Build signature block based on representation status.
 *
 * Invariant 8:
 * - isProSe === true → proper pro se signature block
 * - isProSe === false → existing doc.signature or null
 *   (ClarificationModal handles missing attorney sig)
 */
function buildSignatureBlock(
  doc: CanonicalExportDocument,
  ctx: CourtDocumentContext | undefined,
): SignatureBlock | null {
  // If doc already has an explicit signature, use it
  if (doc.signature) return doc.signature;

  // Pro se: generate deterministic signature block
  if (ctx?.isProSe && ctx.filingPartyName) {
    return {
      intro: 'Respectfully submitted,',
      signerLines: [
        '_________________________',
        ctx.filingPartyName,
        'Pro Se',
      ],
    };
  }

  // Not pro se: do not generate a pro se fallback.
  // ClarificationModal will handle missing attorney signature.
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Deduplication (invariant 12)
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize text for duplicate comparison.
 * Strips numbers, quotes, dashes, whitespace, and lowercases.
 */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')       // strip leading numbers
    .replace(/[""'']/g, '"')         // normalize quotes
    .replace(/[–—]/g, '-')           // normalize dashes
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

/**
 * Remove duplicate court sections by comparing normalized content.
 * Only flags duplicates > 80 chars to avoid false positives on
 * short common legal phrases.
 */
function deduplicateSections(sections: CourtSection[]): CourtSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const content = [
      ...(section.paragraphs ?? []),
      ...(section.numberedItems ?? []),
    ].join('\n');
    const normalized = normalizeForDedup(content);
    if (normalized.length > 80 && seen.has(normalized)) {
      return false;
    }
    if (normalized.length > 80) seen.add(normalized);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════
// Prayer Conversion
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a prayer CourtSection into a PrayerBlock.
 *
 * The first paragraph becomes the prayer intro (e.g. "WHEREFORE,
 * Plaintiff respectfully requests..."). Remaining paragraphs and
 * numbered items become prayer requests.
 */
function convertPrayer(section: CourtSection): PrayerBlock {
  const allParagraphs = section.paragraphs ?? [];
  const numberedItems = section.numberedItems ?? [];

  // First paragraph is the prayer intro, rest are additional requests
  const intro = allParagraphs.length > 0 ? allParagraphs[0] : undefined;
  const additionalParagraphs = allParagraphs.slice(1);

  // Combine additional paragraphs + numbered items as requests
  const requests = [...additionalParagraphs, ...numberedItems];

  return {
    heading: 'PRAYER',
    intro,
    requests,
  };
}

// ═══════════════════════════════════════════════════════════════
// Raw Text Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a deterministic rawText string from a CanonicalExportDocument.
 *
 * Concatenates title, caption, section content, prayer, signature,
 * certificate, and verification text. Used for fallback/debug safety
 * even though the renderer does not require it.
 */
export function buildRawTextFromCanonicalExport(
  doc: CanonicalExportDocument,
): string {
  const parts: string[] = [];

  // Title
  parts.push(doc.title);
  if (doc.subtitle) parts.push(doc.subtitle);

  // Caption
  if (doc.caption) {
    if (doc.caption.causeLine) parts.push(doc.caption.causeLine);
    parts.push(...doc.caption.leftLines);
    parts.push(...doc.caption.centerLines);
    parts.push(...doc.caption.rightLines);
  }

  // Sections
  for (const section of doc.sections) {
    if (section.kind === 'court_section') {
      if (section.heading) parts.push(section.heading);
      if (section.paragraphs) parts.push(...section.paragraphs);
      if (section.numberedItems) parts.push(...section.numberedItems);
      if (section.bulletItems) parts.push(...section.bulletItems);
    }
  }

  // Signature
  if (doc.signature) {
    if (doc.signature.intro) parts.push(doc.signature.intro);
    parts.push(...doc.signature.signerLines);
  }

  // Certificate
  if (doc.certificate) {
    parts.push(doc.certificate.heading);
    parts.push(...doc.certificate.bodyLines);
    parts.push(...doc.certificate.signerLines);
  }

  // Verification
  if (doc.verification) {
    if (doc.verification.heading) parts.push(doc.verification.heading);
    parts.push(...doc.verification.bodyLines);
    parts.push(...doc.verification.signerLines);
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Profile Adapter
// ═══════════════════════════════════════════════════════════════

/**
 * Convert an ExportJurisdictionProfile into a QuickGenerateProfile.
 *
 * The export profile has `court.*` fields while the QG profile needs
 * `caption`, `sections`, `filename`, and `pageNumbering`. This adapter
 * maps between them, providing sensible defaults where the export
 * profile doesn't carry QG-specific data.
 */
export function exportProfileToQuickGenerateProfile(
  profile: ExportJurisdictionProfile,
): QuickGenerateProfile {
  const base: JurisdictionProfile = { ...profile };

  // ── caption ─────────────────────────────────────────────────
  if (!base.caption) {
    base.caption = {
      style: profile.court.captionStyle,
      causeLabel: profile.court.captionStyle === 'texas_pleading'
        ? 'CAUSE NO.'
        : 'Case No.',
      useThreeColumnTable: profile.court.captionStyle === 'texas_pleading',
      centerSymbol: '§',
    };
  }

  // ── sections ────────────────────────────────────────────────
  if (!base.sections) {
    base.sections = {
      prayerHeadingRequired: true,
      certificateSeparatePage: profile.court.certificateSeparatePage,
      signatureKeepTogether: profile.court.signatureKeepTogether,
      verificationKeepTogether: profile.court.verificationKeepTogether,
    };
  }

  // ── filename ────────────────────────────────────────────────
  if (!base.filename) {
    base.filename = {
      uppercase: true,
      underscoresOnly: true,
      includeCauseNumber: true,
    };
  }

  // ── pageNumbering ───────────────────────────────────────────
  if (!base.pageNumbering) {
    base.pageNumbering = {
      enabled: true,
      position: 'bottom-center',
      format: 'x-of-y',
    };
  }

  return base as QuickGenerateProfile;
}
