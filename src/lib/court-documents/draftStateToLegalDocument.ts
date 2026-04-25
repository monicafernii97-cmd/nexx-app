/**
 * Draft State → LegalDocument Transformer
 *
 * Converts CourtDocumentDraftState into the existing LegalDocument type
 * so it can be passed directly to generateLegalPDF().
 *
 * This is the ONLY bridge between the new pipeline state and the
 * existing rendering pipeline. No new rendering pipelines are created.
 *
 * Flow:
 *   CourtDocumentDraftState → draftStateToLegalDocument() → LegalDocument → generateLegalPDF() → PDF
 */

import type { CourtDocumentDraftState } from './types';
import type {
  LegalDocument,
  CaptionBlock,
  TitleBlock,
  LegalSection,
  PrayerBlock,
  SignatureBlock,
  CertificateBlock,
  VerificationBlock,
  LegalBlock,
} from '@/lib/legal-docs/types';

/**
 * Transform a CourtDocumentDraftState into a LegalDocument.
 *
 * Maps:
 * - sections → legal document structure
 * - caption → jurisdiction-aware caption block
 * - signature → correct signature block
 * - certificate → included if present
 * - verification → included if present
 *
 * @param state - The current draft state
 * @returns LegalDocument ready for generateLegalPDF()
 */
export function draftStateToLegalDocument(state: CourtDocumentDraftState): LegalDocument {
  const sectionMap = new Map(state.sections.map(s => [s.id, s]));

  // ── Caption ──
  const captionSection = sectionMap.get('caption');
  const caption = buildCaptionBlock(captionSection?.content ?? '');

  // ── Title ──
  const titleSection = sectionMap.get('title');
  const title: TitleBlock = {
    main: titleSection?.content?.trim() || 'UNTITLED DOCUMENT',
  };

  // ── Introduction (pre-section blocks) ──
  const introSection = sectionMap.get('introduction');
  const introBlocks: LegalBlock[] = introSection?.content?.trim()
    ? splitToParagraphs(introSection.content)
    : [];

  // ── Body Sections (sorted by explicit order) ──
  const sortedSections = state.sections.slice().sort((a, b) => a.order - b.order);
  const bodySectionIds = new Set(['caption', 'title', 'introduction', 'prayer', 'signature', 'certificate', 'verification']);
  const sections: LegalSection[] = sortedSections
    .filter(s => !bodySectionIds.has(s.id) && s.content.trim())
    .map((s) => ({
      id: s.id,
      heading: s.heading.toUpperCase(),
      level: 'roman' as const,
      blocks: splitToParagraphs(s.content),
    }));

  // ── Prayer ──
  const prayerSection = sectionMap.get('prayer');
  const prayer = buildPrayerBlock(prayerSection?.content ?? '');

  // ── Signature ──
  const signatureSection = sectionMap.get('signature');
  const signature = buildSignatureBlock(signatureSection?.content ?? '');

  // ── Certificate of Service ──
  const certSection = sectionMap.get('certificate');
  const certificate = buildCertificateBlock(certSection?.content ?? '');

  // ── Verification ──
  const verificationSection = sectionMap.get('verification');
  const verification = buildVerificationBlock(verificationSection?.content ?? '');

  // ── Reconstruct rawText for parser compatibility ──
  const rawText = sortedSections
    .map(s => `${s.heading}\n${s.content}`)
    .join('\n\n');

  return {
    metadata: {
      causeNumber: undefined,
      court: state.jurisdiction.courtName,
      district: state.jurisdiction.district,
      county: state.jurisdiction.county,
      jurisdiction: state.jurisdiction.state,
      documentType: state.documentType,
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
// Block Builders
// ═══════════════════════════════════════════════════════════════

/** Parse caption content into a structured CaptionBlock for PDF rendering. */
function buildCaptionBlock(content: string): CaptionBlock | null {
  if (!content.trim()) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    leftLines: lines.length >= 2 ? lines.slice(0, Math.ceil(lines.length / 2)) : lines,
    centerLines: [],
    rightLines: lines.length >= 2 ? lines.slice(Math.ceil(lines.length / 2)) : [],
    causeLine: undefined,
    styleHint: 'generic',
  };
}

/** Parse prayer/relief section into heading, intro, and request items. */
function buildPrayerBlock(content: string): PrayerBlock | null {
  if (!content.trim()) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const hasIntro = lines.length > 1 && /wherefore|therefore|prays/i.test(lines[0]);

  return {
    heading: 'PRAYER',
    intro: hasIntro ? lines[0] : undefined,
    requests: hasIntro ? lines.slice(1) : lines,
  };
}

/** Parse signature block content into intro line and signer lines. */
function buildSignatureBlock(content: string): SignatureBlock | null {
  if (!content.trim()) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const hasIntro = lines.length > 1 && /respectfully|submitted/i.test(lines[0]);

  return {
    intro: hasIntro ? lines[0] : undefined,
    signerLines: hasIntro ? lines.slice(1) : lines,
  };
}

/** Parse certificate of service content into body and signer lines. */
function buildCertificateBlock(content: string): CertificateBlock | null {
  if (!content.trim()) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    heading: 'CERTIFICATE OF SERVICE',
    bodyLines: lines.length > 1 ? lines.slice(0, -1) : lines,
    signerLines: lines.length > 1 ? [lines[lines.length - 1]] : [],
  };
}

/** Parse verification content into body and signer lines. */
function buildVerificationBlock(content: string): VerificationBlock | null {
  if (!content.trim()) return null;

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  return {
    heading: 'VERIFICATION',
    bodyLines: lines.length > 1 ? lines.slice(0, -1) : lines,
    signerLines: lines.length > 1 ? [lines[lines.length - 1]] : [],
  };
}

/**
 * Split content into paragraph blocks.
 * Double newlines create separate paragraphs.
 */
function splitToParagraphs(content: string): LegalBlock[] {
  return content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(text => ({ type: 'paragraph' as const, text }));
}
