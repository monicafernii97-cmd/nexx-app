/**
 * Canonical Export Adapter
 *
 * Converts the pipeline output (DraftedSection[] + optional mapped sections)
 * into a CanonicalExportDocument — the ONLY input renderers accept.
 *
 * Replaces the lossy adaptDraftedToGenerated() which collapsed ALL sections
 * to generic `sectionType: 'body_sections'`.
 *
 * This adapter is path-aware: court sections get `kind: 'court_section'`,
 * summary sections get `kind: 'summary_section'`, etc.
 */

import type {
  CanonicalExportDocument,
  ExportPath,
  ExportSection,
  ExportCaption,
  ExportSignatureBlock,
  ExportCertificateBlock,
  ExportVerificationBlock,
  ExhibitPacketData,
  TimelineVisualData,
  ExhibitCoverSection,
  ExhibitContentSection,
  ExhibitIndexSection,
  ExhibitIndexEntry,
} from './types';
import type { ExhibitMappedSections } from '@/lib/export-assembly/types/exports';

// ═══════════════════════════════════════════════════════════════
// Input Types
// ═══════════════════════════════════════════════════════════════

/** A single drafted section from the GPT drafting phase. */
export type DraftedSectionInput = {
  sectionId: string;
  heading?: string;
  body?: string;
  numberedItems?: string[];
  source?: 'ai_drafted' | 'user_locked' | 'user_edited';
};

/** Full context for building the canonical export document. */
export type AdaptToCanonicalParams = {
  /** Which export path to shape for. */
  path: ExportPath;
  /** Document title. */
  title: string;
  /** Optional subtitle. */
  subtitle?: string;
  /** GPT-drafted or user-locked sections. */
  draftedSections: DraftedSectionInput[];

  // ── Metadata ──
  caseId?: string;
  causeNumber?: string;
  jurisdiction?: CanonicalExportDocument['metadata']['jurisdiction'];
  partyRole?: string;
  documentType?: string;

  // ── Optional structural blocks ──
  caption?: ExportCaption | null;
  signature?: ExportSignatureBlock | null;
  certificate?: ExportCertificateBlock | null;
  verification?: ExportVerificationBlock | null;
  exhibitPacket?: ExhibitPacketData | null;
  timelineVisual?: TimelineVisualData | null;

  /**
   * Optional mapped sections from the exhibit assembly path.
   * When present, exhibit covers use the richer AI-drafted summaries
   * from the existing exhibit cover drafting flow.
   */
  exhibitMappedSections?: ExhibitMappedSections | null;
};

// ═══════════════════════════════════════════════════════════════
// Adapter
// ═══════════════════════════════════════════════════════════════

/**
 * Build a CanonicalExportDocument from drafted sections + context.
 *
 * This is the sole shaping layer between the drafting pipeline and
 * the renderers. All structural decisions happen here — renderers
 * never reconstruct structure from raw drafted content.
 */
export function adaptDraftedToCanonicalExport(
  params: AdaptToCanonicalParams,
): CanonicalExportDocument {
  const {
    path,
    title,
    subtitle,
    draftedSections,
    caseId,
    causeNumber,
    jurisdiction,
    partyRole,
    documentType,
    caption,
    signature,
    certificate,
    verification,
    exhibitPacket,
    timelineVisual,
    exhibitMappedSections,
  } = params;

  // Route to path-specific section builder
  const sections = buildSections(path, draftedSections, exhibitMappedSections);

  return {
    path,
    title,
    subtitle,
    metadata: {
      caseId,
      causeNumber,
      jurisdiction,
      partyRole,
      documentType,
    },
    caption: caption ?? null,
    sections,
    signature: signature ?? null,
    certificate: certificate ?? null,
    verification: verification ?? null,
    exhibitPacket: exhibitPacket ?? null,
    timelineVisual: timelineVisual ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Path-Specific Section Builders
// ═══════════════════════════════════════════════════════════════

/**
 * Route drafted sections to the correct structural mapper.
 * This is where the critical structural identity is preserved.
 */
function buildSections(
  path: ExportPath,
  draftedSections: DraftedSectionInput[],
  exhibitMappedSections?: ExhibitMappedSections | null,
): ExportSection[] {
  switch (path) {
    case 'court_document':
      return buildCourtSections(draftedSections);
    case 'case_summary':
      return buildSummarySections(draftedSections);
    case 'exhibit_document':
      return buildExhibitSections(draftedSections, exhibitMappedSections);
    case 'timeline_summary':
    case 'incident_report':
      return buildTimelineSections(draftedSections);
    default:
      return buildSummarySections(draftedSections);
  }
}

/** Map drafted sections to court document sections, preserving structural identity. */
function buildCourtSections(sections: DraftedSectionInput[]): ExportSection[] {
  return sections.map((s) => ({
    kind: 'court_section' as const,
    id: s.sectionId,
    heading: s.heading,
    paragraphs: s.body ? splitParagraphs(s.body) : [],
    numberedItems: s.numberedItems ?? [],
  }));
}

/** Map drafted sections to summary/report sections. */
function buildSummarySections(sections: DraftedSectionInput[]): ExportSection[] {
  return sections.map((s) => ({
    kind: 'summary_section' as const,
    id: s.sectionId,
    heading: s.heading || 'Summary',
    paragraphs: s.body ? splitParagraphs(s.body) : [],
    bulletItems: s.numberedItems ?? [],
  }));
}

/** Map drafted sections to exhibit sections, enriching from mapped sections when available. */
function buildExhibitSections(
  draftedSections: DraftedSectionInput[],
  mappedSections?: ExhibitMappedSections | null,
): ExportSection[] {
  const sections: ExportSection[] = [];

  // 1. Build exhibit index from mapped sections if available
  if (mappedSections?.indexEntries?.length) {
    const indexEntries: ExhibitIndexEntry[] = mappedSections.indexEntries.map((entry) => ({
      label: entry.label,
      description: entry.title || entry.summary || `Exhibit ${entry.label}`,
    }));

    const indexSection: ExhibitIndexSection = {
      kind: 'exhibit_index',
      id: 'exhibit_index',
      heading: 'EXHIBIT INDEX',
      entries: indexEntries,
    };
    sections.push(indexSection);
  }

  // 2. Build exhibit covers from mapped sections (richer AI-drafted summaries)
  if (mappedSections?.coverSheetSummaries?.length) {
    for (const cover of mappedSections.coverSheetSummaries) {
      const coverSection: ExhibitCoverSection = {
        kind: 'exhibit_cover',
        id: `cover_${cover.label}`,
        heading: cover.heading || `EXHIBIT ${cover.label}`,
        exhibitLabel: cover.label,
        summaryLines: cover.summary
          ? [cover.summary, ...cover.supportingIssues]
          : cover.supportingIssues,
      };
      sections.push(coverSection);
    }
  }

  // 3. Build exhibit content from drafted sections
  //    Separate exhibit cover drafts (injected by the route) from body content
  for (const s of draftedSections) {
    if (s.sectionId.startsWith('exhibit_cover_')) {
      // Already handled above via mappedSections — skip if we have mapped data
      if (mappedSections?.coverSheetSummaries?.length) continue;

      // Fallback: use drafted cover data
      const label = s.sectionId.replace('exhibit_cover_', '');
      const coverSection: ExhibitCoverSection = {
        kind: 'exhibit_cover',
        id: s.sectionId,
        heading: s.heading || `EXHIBIT ${label}`,
        exhibitLabel: label,
        summaryLines: s.body ? s.body.split('\n').filter(Boolean) : [],
      };
      sections.push(coverSection);
    } else {
      // Regular exhibit content
      const contentSection: ExhibitContentSection = {
        kind: 'exhibit_content',
        id: s.sectionId,
        exhibitLabel: s.sectionId,
        heading: s.heading,
        paragraphs: s.body ? splitParagraphs(s.body) : [],
      };
      sections.push(contentSection);
    }
  }

  return sections;
}

/** Map drafted sections to timeline sections. */
function buildTimelineSections(sections: DraftedSectionInput[]): ExportSection[] {
  return sections.map((s) => ({
    kind: 'summary_section' as const,
    id: s.sectionId,
    heading: s.heading || 'Timeline Summary',
    paragraphs: s.body ? splitParagraphs(s.body) : [],
  }));
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Split a body string into paragraphs on double-newlines.
 * Falls back to single paragraphs if no double-newlines found.
 */
function splitParagraphs(body: string): string[] {
  if (!body.trim()) return [];

  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 0) return paragraphs;

  // If no double-newlines, treat entire body as one paragraph
  return [body.trim()];
}
