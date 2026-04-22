/**
 * Workspace → Exhibit Adapter
 *
 * High-level adapter that takes workspace nodes + timeline events
 * and delegates to buildAutoExhibitPacket for canonical conversion.
 *
 * This is the entry point for the exhibit_document path when
 * constructing from workspace data (not pre-drafted content).
 */

import type { CanonicalExportDocument } from '../types';
import {
  buildAutoExhibitPacket,
  type ExhibitPacketBuildConfig,
  type ExhibitSourceItem,
} from './buildAutoExhibitPacket';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** A workspace node suitable for exhibit conversion. */
export type WorkspaceExhibitNode = {
  nodeId: string;
  title: string;
  rawText?: string;
  summary?: string;
  date?: string;
  sourceType?: string;
  issueTags?: string[];
  linkedEvidenceId?: string;
};

/** Configuration for workspace → exhibit conversion. */
export type WorkspaceExhibitConfig = Omit<ExhibitPacketBuildConfig, 'packetTitle'> & {
  packetTitle?: string;
};

// ═══════════════════════════════════════════════════════════════
// Adapter
// ═══════════════════════════════════════════════════════════════

/**
 * Build a canonical exhibit document from workspace nodes.
 *
 * @param nodes - Workspace nodes to convert to exhibits
 * @param config - Exhibit packet configuration
 * @returns CanonicalExportDocument ready for rendering
 */
export function buildExhibitsFromWorkspace(
  nodes: WorkspaceExhibitNode[],
  config: WorkspaceExhibitConfig,
): CanonicalExportDocument {
  const items: ExhibitSourceItem[] = nodes.map((node) => ({
    title: node.title,
    content: node.rawText,
    summary: node.summary,
    date: node.date,
    sourceType: node.sourceType,
    issueTags: node.issueTags,
    linkedEvidenceId: node.linkedEvidenceId,
  }));

  return buildAutoExhibitPacket(items, {
    packetTitle: config.packetTitle || 'Exhibit Packet',
    labelStyle: config.labelStyle,
    organizationMode: config.organizationMode,
    includeCoverSheets: config.includeCoverSheets,
    bates: config.bates,
    partyName: config.partyName,
    causeNumber: config.causeNumber,
    jurisdiction: config.jurisdiction,
  });
}
