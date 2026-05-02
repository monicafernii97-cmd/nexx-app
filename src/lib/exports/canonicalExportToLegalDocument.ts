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

/** Test whether a section heading is a prayer heading. */
function isPrayerHeading(heading: string | undefined): boolean {
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
 */
export function canonicalExportToLegalDocument(
  doc: CanonicalExportDocument,
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

  // ── Separate prayer from body sections ────────────────────
  const bodySections: CourtSection[] = [];
  let prayerSection: CourtSection | null = null;

  for (const section of courtSections) {
    if (isPrayerHeading(section.heading)) {
      prayerSection = section;
    } else {
      bodySections.push(section);
    }
  }

  // ── Build LegalDocument ───────────────────────────────────
  const title: TitleBlock = {
    main: doc.title,
    subtitle: doc.subtitle,
  };

  const caption: CaptionBlock | null = doc.caption
    ? convertCaption(doc.caption)
    : null;

  const sections: LegalSection[] = bodySections.map(convertCourtSection);

  const prayer: PrayerBlock | null = prayerSection
    ? convertPrayer(prayerSection)
    : null;

  const signature: SignatureBlock | null = doc.signature ?? null;
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
    },
    caption,
    title,
    introBlocks: [],
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
 * CourtSection stores content as flat arrays (paragraphs[], numberedItems[],
 * bulletItems[]). LegalSection stores typed LegalBlock[] in sequence.
 *
 * Ordering: paragraphs first, then numbered items, then bullets.
 * This matches the structural order expected by the QG renderer.
 */
function convertCourtSection(section: CourtSection): LegalSection {
  const blocks: LegalBlock[] = [];

  // Paragraphs → ParagraphBlock[]
  if (section.paragraphs?.length) {
    for (const text of section.paragraphs) {
      blocks.push({ type: 'paragraph', text } satisfies ParagraphBlock);
    }
  }

  // Numbered items → NumberedListBlock
  if (section.numberedItems?.length) {
    blocks.push({
      type: 'numbered_list',
      items: section.numberedItems,
    } satisfies NumberedListBlock);
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
    heading: section.heading ?? '',
    level: detectSectionLevel(section.heading),
    blocks,
  };
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
