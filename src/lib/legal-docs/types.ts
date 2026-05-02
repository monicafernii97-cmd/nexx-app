/**
 * Structured Legal Document Model
 *
 * Neutral intermediate representation produced by the parser
 * and consumed by the jurisdiction-aware renderer.
 *
 * This model is NOT jurisdiction-specific — it captures the
 * structural elements common to all US pleading formats.
 *
 * 🔒 RULE: The renderer ONLY accepts this model. It never receives
 * raw text, draftedSections, CanonicalExportDocument, or generic
 * body_sections. All court documents must be parsed into this
 * schema before rendering.
 */

// ═══════════════════════════════════════════════════════════════
// Pipeline Input
// ═══════════════════════════════════════════════════════════════

/** Input to the unified legal document pipeline. All court document entry points use this. */
export type LegalDocumentInput = {
  /** Raw or pre-normalized text content. */
  text: string;
  /** Optional metadata hints (causeNumber, jurisdiction, etc.). */
  metadata?: Partial<LegalDocument['metadata']>;
  /** Jurisdiction hint for profile resolution (e.g. 'TX'). */
  jurisdictionHint?: string;
  /** Optional caption override from user-provided data. */
  caption?: Partial<CaptionBlock>;
  /** Optional title override. */
  title?: string;
  /** Optional subtitle override. */
  subtitle?: string;
};

// ═══════════════════════════════════════════════════════════════
// Inline Text Runs
// ═══════════════════════════════════════════════════════════════

/**
 * Inline formatting run within a paragraph or numbered paragraph.
 *
 * Used for legal emphasis patterns like "COMES NOW" (bold) or
 * "WHEREFORE, PREMISES CONSIDERED" (bold). The parser detects
 * these patterns and populates runs[]. The renderer applies
 * formatting deterministically — AI never decides styling.
 */
export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

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
    /** Filing party name. */
    filingParty?: string;
    /** Filing party role (e.g. 'Petitioner', 'Respondent'). */
    partyRole?: string;
  };
  caption: CaptionBlock | null;
  title: TitleBlock;
  /** Pre-section intro paragraphs (e.g. "TO THE HONORABLE...", "COMES NOW..."). */
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
  /** Intro with inline runs (e.g. bold "WHEREFORE, PREMISES CONSIDERED"). */
  introRuns?: InlineRun[];
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
  | NumberedParagraphBlock
  | NumberedListBlock
  | BulletListBlock
  | LetteredListBlock;

/** Paragraph block with optional inline formatting runs. */
export type ParagraphBlock = {
  type: 'paragraph';
  text: string;
  /** When present, renderer uses runs instead of plain text. */
  runs?: InlineRun[];
};

/**
 * Individual numbered paragraph block.
 *
 * Each numbered item (e.g. "1. A Final Order was signed...") is its own block
 * with its own number. Numbered paragraphs are NEVER concatenated into a
 * flat list. This prevents the collapsed-section failure mode.
 */
export type NumberedParagraphBlock = {
  type: 'numbered_paragraph';
  number: number;
  text: string;
  /** When present, renderer uses runs instead of plain text. */
  runs?: InlineRun[];
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

// ═══════════════════════════════════════════════════════════════
// Deprecated — kept for backward compatibility only
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use NumberedParagraphBlock instead. This flat list type
 * caused numbered items to be concatenated into a single blob.
 * Kept only for compatibility with canonicalExportToLegalDocument adapter.
 */
export type NumberedListBlock = {
  type: 'numbered_list';
  items: string[];
};
