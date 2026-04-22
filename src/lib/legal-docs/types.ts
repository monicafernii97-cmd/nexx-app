/**
 * Structured Legal Document Model
 *
 * Neutral intermediate representation produced by the parser
 * and consumed by the jurisdiction-aware renderer.
 *
 * This model is NOT jurisdiction-specific — it captures the
 * structural elements common to all US pleading formats.
 */

// ═══════════════════════════════════════════════════════════════
// Top-Level Document
// ═══════════════════════════════════════════════════════════════

export type LegalDocument = {
  metadata: {
    causeNumber?: string;
    court?: string;
    district?: string;
    county?: string;
    jurisdiction?: string;
    /** Classified document type (e.g. 'motion', 'petition'). Set by classifyDocumentType(). */
    documentType?: string;
  };
  caption: CaptionBlock | null;
  title: TitleBlock;
  /** Pre-section intro paragraphs (e.g. "TO THE HONORABLE..."). Extracted before first Roman heading. */
  introBlocks: LegalBlock[];
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
  /** Verification / declaration block (distinct from notary). */
  verification: VerificationBlock | null;
  rawText: string;
};

// ═══════════════════════════════════════════════════════════════
// Shell Blocks
// ═══════════════════════════════════════════════════════════════

export type CaptionBlock = {
  causeLine?: string;
  leftLines: string[];
  centerLines: string[];
  rightLines: string[];
  /** Parser hint for which caption style was detected. */
  styleHint?: 'texas' | 'federal' | 'generic' | 'in_re';
};

export type TitleBlock = {
  main: string;
  subtitle?: string;
  /** Additional title lines when the title spans multiple lines. */
  additionalTitleLines?: string[];
};

// ═══════════════════════════════════════════════════════════════
// Body Blocks
// ═══════════════════════════════════════════════════════════════

export type LegalSection = {
  id: string;
  heading: string;
  level: 'roman' | 'letter' | 'plain';
  blocks: LegalBlock[];
};

export type PrayerBlock = {
  heading: 'PRAYER';
  intro?: string;
  requests: string[];
};

export type SignatureBlock = {
  intro?: string;
  signerLines: string[];
};

export type CertificateBlock = {
  heading: string;
  bodyLines: string[];
  signerLines: string[];
};

/** Verification or declaration block. Typically follows signature. */
export type VerificationBlock = {
  heading?: string;
  bodyLines: string[];
  signerLines: string[];
};

// ═══════════════════════════════════════════════════════════════
// Content Blocks
// ═══════════════════════════════════════════════════════════════

export type LegalBlock =
  | ParagraphBlock
  | NumberedListBlock
  | BulletListBlock
  | LetteredListBlock;

export type ParagraphBlock = {
  type: 'paragraph';
  text: string;
};

export type NumberedListBlock = {
  type: 'numbered_list';
  items: string[];
};

export type BulletListBlock = {
  type: 'bullet_list';
  items: string[];
};

/** Lettered list block (A., B., C.) — preserved as lettered, not collapsed to paragraphs. */
export type LetteredListBlock = {
  type: 'lettered_list';
  items: string[];
};
