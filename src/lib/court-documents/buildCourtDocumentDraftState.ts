/**
 * Draft State Builder
 *
 * Constructs a CourtDocumentDraftState from:
 * 1. A document type → required sections (via deriveRequiredSections)
 * 2. Optional parsed content → fills sections that already have content
 *
 * Rules:
 * - Pre-fill from parser when available
 * - Otherwise initialize empty sections
 * - Assign correct source
 * - Never mutate inputs
 */

import type {
  CourtDocumentDraftState,
  CourtDocumentSection,
  DocumentType,
  JurisdictionContext,
} from './types';
import { deriveRequiredSections } from './deriveRequiredSections';
import type { LegalDocument } from '@/lib/legal-docs/types';

// ═══════════════════════════════════════════════════════════════
// Builder Input
// ═══════════════════════════════════════════════════════════════

export interface BuildDraftStateInput {
  documentType: DocumentType;
  /** Pre-parsed document to fill sections from (optional) */
  parsedContent?: LegalDocument;
  /** Jurisdiction context for the document */
  jurisdiction?: JurisdictionContext;
  /** User ID for metadata */
  createdBy?: string;
}

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a fresh CourtDocumentDraftState.
 *
 * If parsedContent is provided, sections are pre-filled from
 * the parsed document. Otherwise, all sections start empty.
 */
export function buildCourtDocumentDraftState(
  input: BuildDraftStateInput,
): CourtDocumentDraftState {
  const { documentType, parsedContent, jurisdiction, createdBy } = input;
  const sectionDefs = deriveRequiredSections(documentType);

  const now = new Date().toISOString();
  const docId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hasParsed = !!parsedContent;

  const sections: CourtDocumentSection[] = sectionDefs.map((def, index) => {
    const content = hasParsed ? extractContentForSection(def.id, parsedContent!) : '';
    const hasContent = content.trim().length > 0;

    return {
      id: def.id,
      heading: def.heading,
      order: index,
      content,
      status: hasContent ? 'drafted' : 'empty',
      source: hasContent ? 'parsed_input' : 'blank_template',
      revisions: [],
      feedbackNotes: [],
    };
  });

  // Resolve jurisdiction from parsed content or input
  const resolvedJurisdiction: JurisdictionContext = jurisdiction ?? {
    state: parsedContent?.metadata?.jurisdiction,
    county: parsedContent?.metadata?.county,
    courtName: parsedContent?.metadata?.court,
    district: parsedContent?.metadata?.district,
  };

  return {
    documentId: docId,
    documentType,
    jurisdiction: resolvedJurisdiction,
    sections,
    metadata: {
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? 'anonymous',
      isDirty: false,
      version: 1,
      source: hasParsed ? 'parsed_input' : 'manual_start',
    },
    persistence: {
      storage: 'client',
      saveStatus: 'idle',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Content Extraction from Parsed Document
// ═══════════════════════════════════════════════════════════════

/**
 * Extract content for a specific section ID from a parsed LegalDocument.
 *
 * Maps section IDs to the corresponding parsed document blocks.
 */
function extractContentForSection(sectionId: string, doc: LegalDocument): string {
  switch (sectionId) {
    case 'caption':
      return extractCaption(doc);
    case 'title':
      return doc.title?.main ?? '';
    case 'introduction':
      return doc.introBlocks?.map(blockToText).join('\n\n') ?? '';
    case 'factual_background':
    case 'factual_allegations':
      return extractSectionsByPattern(doc, /fact/i);
    case 'legal_standard':
    case 'legal_grounds':
    case 'grounds':
      return extractSectionsByPattern(doc, /legal|standard|ground/i);
    case 'argument':
      return extractSectionsByPattern(doc, /argument/i);
    case 'body':
    case 'notice_body':
    case 'order_body':
    case 'responses':
      return doc.sections.map(sectionToText).join('\n\n');
    case 'prayer':
      return extractPrayer(doc);
    case 'signature':
      return extractSignature(doc);
    case 'certificate':
      return extractCertificate(doc);
    case 'verification':
      return extractVerification(doc);
    default:
      return extractSectionsByPattern(doc, new RegExp(sectionId.replace(/_/g, '\\s*'), 'i'));
  }
}

function extractCaption(doc: LegalDocument): string {
  if (!doc.caption) return '';
  const lines: string[] = [];
  if (doc.caption.leftLines.length) lines.push(...doc.caption.leftLines);
  if (doc.caption.centerLines.length) lines.push(...doc.caption.centerLines);
  if (doc.caption.rightLines.length) lines.push(...doc.caption.rightLines);
  if (doc.caption.causeLine) lines.push(doc.caption.causeLine);
  return lines.join('\n');
}

function extractPrayer(doc: LegalDocument): string {
  if (!doc.prayer) return '';
  const parts: string[] = [];
  if (doc.prayer.intro) parts.push(doc.prayer.intro);
  parts.push(...doc.prayer.requests);
  return parts.join('\n');
}

function extractSignature(doc: LegalDocument): string {
  if (!doc.signature) return '';
  const parts: string[] = [];
  if (doc.signature.intro) parts.push(doc.signature.intro);
  parts.push(...doc.signature.signerLines);
  return parts.join('\n');
}

function extractCertificate(doc: LegalDocument): string {
  if (!doc.certificate) return '';
  const parts: string[] = [];
  if (doc.certificate.heading) parts.push(doc.certificate.heading);
  parts.push(...doc.certificate.bodyLines);
  parts.push(...doc.certificate.signerLines);
  return parts.join('\n');
}

function extractVerification(doc: LegalDocument): string {
  if (!doc.verification) return '';
  const parts: string[] = [];
  if (doc.verification.heading) parts.push(doc.verification.heading);
  parts.push(...doc.verification.bodyLines);
  parts.push(...doc.verification.signerLines);
  return parts.join('\n');
}

function extractSectionsByPattern(doc: LegalDocument, pattern: RegExp): string {
  return doc.sections
    .filter(s => pattern.test(s.heading))
    .map(sectionToText)
    .join('\n\n');
}

function sectionToText(section: { heading: string; blocks: Array<{ type: string; text?: string; items?: string[] }> }): string {
  const heading = section.heading;
  const body = section.blocks.map(blockToText).join('\n');
  return `${heading}\n${body}`;
}

function blockToText(block: { type: string; text?: string; items?: string[] }): string {
  if (block.type === 'paragraph' && block.text) return block.text;
  if (block.items) return block.items.join('\n');
  return '';
}
