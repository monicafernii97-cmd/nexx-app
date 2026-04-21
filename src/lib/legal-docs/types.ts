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
  };
  caption: CaptionBlock | null;
  title: TitleBlock;
  sections: LegalSection[];
  prayer: PrayerBlock | null;
  signature: SignatureBlock | null;
  certificate: CertificateBlock | null;
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
};

export type TitleBlock = {
  main: string;
  subtitle?: string;
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

// ═══════════════════════════════════════════════════════════════
// Content Blocks
// ═══════════════════════════════════════════════════════════════

export type LegalBlock = ParagraphBlock | NumberedListBlock | BulletListBlock;

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
