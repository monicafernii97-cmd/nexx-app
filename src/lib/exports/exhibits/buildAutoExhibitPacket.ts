/**
 * Auto Exhibit Packet Builder
 *
 * Converts exhibit source items (from assembly output) into a full
 * CanonicalExportDocument with index, covers, and content sections.
 *
 * Used when the exhibit packet is constructed from workspace data
 * rather than pre-drafted content.
 */

import type {
  CanonicalExportDocument,
  ExhibitCoverSection,
  ExhibitContentSection,
  ExhibitIndexSection,
  ExhibitIndexEntry,
  ExhibitPacketData,
  ExportSection,
} from '../types';
import { formatExhibitLabel, type ExhibitLabelStyle } from './formatExhibitLabel';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** A single exhibit source item from the assembly layer. */
export type ExhibitSourceItem = {
  title: string;
  content?: string;
  summary?: string;
  date?: string;
  sourceType?: string;
  issueTags?: string[];
  linkedEvidenceId?: string;
};

/** Configuration for building the exhibit packet. */
export type ExhibitPacketBuildConfig = {
  packetTitle: string;
  labelStyle: ExhibitLabelStyle;
  organizationMode: ExhibitPacketData['organizationMode'];
  includeCoverSheets: boolean;
  bates?: ExhibitPacketData['bates'];
  partyName?: string;
  causeNumber?: string;
  jurisdiction?: CanonicalExportDocument['metadata']['jurisdiction'];
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a CanonicalExportDocument from exhibit source items.
 *
 * @param items - Exhibit source items from assembly
 * @param config - Packet build configuration
 * @returns Canonical exhibit document ready for rendering
 */
export function buildAutoExhibitPacket(
  items: ExhibitSourceItem[],
  config: ExhibitPacketBuildConfig,
): CanonicalExportDocument {
  const sections: ExportSection[] = [];

  // 1. Build exhibit index
  const indexEntries: ExhibitIndexEntry[] = items.map((item, idx) => ({
    label: formatExhibitLabel(idx, config.labelStyle, config.partyName),
    description: item.title || `Exhibit ${formatExhibitLabel(idx, config.labelStyle)}`,
  }));

  const indexSection: ExhibitIndexSection = {
    kind: 'exhibit_index',
    id: 'exhibit_index',
    heading: 'EXHIBIT INDEX',
    entries: indexEntries,
  };
  sections.push(indexSection);

  // 2. Build cover + content per exhibit
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const label = formatExhibitLabel(idx, config.labelStyle, config.partyName);
    // For party_numeric labels (e.g. "PETITIONER'S EXHIBIT 1"), the label
    // already includes "EXHIBIT". Avoid double-prefixing.
    const displayHeading = label.toUpperCase().includes('EXHIBIT')
      ? label
      : `EXHIBIT ${label}`;

    // Cover sheet
    if (config.includeCoverSheets) {
      const summaryLines = buildCoverSummaryLines(item);
      const coverSection: ExhibitCoverSection = {
        kind: 'exhibit_cover',
        id: `cover_${label}`,
        heading: displayHeading,
        exhibitLabel: label,
        summaryLines,
        sourceType: item.sourceType,
        dateRange: item.date,
      };
      sections.push(coverSection);
    }

    // Content — use raw text if available, fall back to summary
    const bodyText = item.content?.trim() || item.summary?.trim();
    if (bodyText) {
      const contentSection: ExhibitContentSection = {
        kind: 'exhibit_content',
        id: `content_${label}`,
        exhibitLabel: label,
        heading: item.title,
        paragraphs: bodyText
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        sourceType: item.sourceType,
        stampedTitle: displayHeading,
      };
      sections.push(contentSection);
    }
  }

  return {
    path: 'exhibit_document',
    title: config.packetTitle,
    metadata: {
      causeNumber: config.causeNumber,
      jurisdiction: config.jurisdiction,
    },
    sections,
    exhibitPacket: {
      packetTitle: config.packetTitle,
      organizationMode: config.organizationMode,
      labelStyle: config.labelStyle,
      bates: config.bates,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Build summary lines for an exhibit cover from the source item. */
function buildCoverSummaryLines(item: ExhibitSourceItem): string[] {
  const lines: string[] = [];

  if (item.summary) {
    lines.push(item.summary);
  }

  if (item.date) {
    lines.push(`Date: ${item.date}`);
  }

  if (item.sourceType) {
    lines.push(`Type: ${item.sourceType}`);
  }

  if (item.issueTags?.length) {
    lines.push(`Related issues: ${item.issueTags.join(', ')}`);
  }

  if (lines.length === 0) {
    lines.push(item.title || 'Exhibit document.');
  }

  return lines;
}
