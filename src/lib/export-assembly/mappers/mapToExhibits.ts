/**
 * Map to Exhibits — Exhibit document export path mapper.
 *
 * Takes classified nodes + legal narrative and produces ExhibitMappedSections.
 *
 * Mapping rules:
 * - Uploaded documents → exhibit items
 * - Screenshots / messages → attachments
 * - Timeline tags → chronology grouping
 * - Notes / summaries → cover sheets
 * - Metadata → source/date/authentication notes
 *
 * Output structure:
 *   packetTitle → indexEntries → groupedExhibits →
 *   coverSheetSummaries
 *
 * Supports two modes:
 * - Administrative: Internal packet, simpler labeling
 * - Court-structured: Filing-ready, formal labels, court naming preserved
 */

import type { ClassifiedNode } from '../types/classification';
import type { LegalNarrative } from '../types/narrative';
import type {
    ExhibitMappedSections,
    ExhibitMappedItem,
    ExportRequest,
    ExhibitConfig,
} from '../types/exports';

/**
 * Parse a date string to epoch ms. Returns Infinity for unparseable dates.
 */
function parseDateMs(dateStr: string): number {
    const ms = Date.parse(dateStr);
    return Number.isNaN(ms) ? Infinity : ms;
}

// ---------------------------------------------------------------------------
// Label Generators
// ---------------------------------------------------------------------------

/** Generate exhibit label based on style and index. */
function generateLabel(
    index: number,
    style: ExhibitConfig['labelStyle'],
    partyRole?: string,
): string {
    switch (style) {
        case 'alpha': {
            // A, B, C, ... Z, AA, AB, ...
            const letters: string[] = [];
            let n = index;
            do {
                letters.unshift(String.fromCharCode(65 + (n % 26)));
                n = Math.floor(n / 26) - 1;
            } while (n >= 0);
            return `Exhibit ${letters.join('')}`;
        }
        case 'numeric':
            return `Exhibit ${index + 1}`;
        case 'party_numeric': {
            const role = partyRole
                ? partyRole.charAt(0).toUpperCase() + partyRole.slice(1)
                : 'Party';
            return `${role}'s Exhibit ${index + 1}`;
        }
        default:
            return `Exhibit ${index + 1}`;
    }
}

// ---------------------------------------------------------------------------
// Main Mapper
// ---------------------------------------------------------------------------

/**
 * Map classified workspace content to exhibit document sections.
 *
 * Evidence-first: only nodes with evidence relevance are included.
 * Uses exhibitSummarySafe text for cover sheets (fact + evidence only, no emotion).
 */
export function mapToExhibitSections(
    nodes: ClassifiedNode[],
    _narrative: LegalNarrative,
    request: ExportRequest,
): ExhibitMappedSections {
    const config = request.config as ExhibitConfig;
    const generatedAt = new Date().toISOString();

    // ── Filter to evidence-relevant nodes ──
    const evidenceNodes = nodes
        .filter(n =>
            n.exportRelevance.exhibit_document > 0.2 ||
            n.dominantType === 'evidence_reference' ||
            n.nodeType === 'evidence_item' ||
            n.nodeType === 'exhibit_note' ||
            n.nodeType === 'pinned_item' ||
            n.provenance.linkedEvidenceIds.length > 0,
        )
        .sort((a, b) => {
            // Sort by the chosen organization method
            switch (config.organization) {
                case 'chronological': {
                    const dateA = a.extractedEntities.dates[0];
                    const dateB = b.extractedEntities.dates[0];
                    if (dateA && dateB) return parseDateMs(dateA) - parseDateMs(dateB);
                    if (dateA) return -1;
                    if (dateB) return 1;
                    return 0;
                }
                case 'issue_based':
                    return (b.issueTags[0] ?? '').localeCompare(a.issueTags[0] ?? '');
                case 'witness_based':
                    return (a.extractedEntities.people[0] ?? '').localeCompare(
                        b.extractedEntities.people[0] ?? '',
                    );
                case 'source_based':
                    return (a.nodeType).localeCompare(b.nodeType);
                default:
                    return b.exportRelevance.exhibit_document - a.exportRelevance.exhibit_document;
            }
        });

    // ── Determine party role for labels ──
    const partyRole = ('partyRole' in config && typeof (config as Record<string, unknown>).partyRole === 'string')
        ? (config as Record<string, unknown>).partyRole as string
        : undefined;

    // ── Build Index Entries ──
    const indexEntries: ExhibitMappedItem[] = evidenceNodes.map((node, index) => {
        const label = generateLabel(index, config.labelStyle, partyRole);

        return {
            label,
            title: node.extractedEntities.exhibits[0] ?? buildExhibitTitle(node),
            date: node.extractedEntities.dates[0],
            source: config.includeSourceMetadata ? buildSourceDescription(node) : undefined,
            summary: config.includeSummaries
                ? (node.transformedText.exhibitSummarySafe ?? node.cleanedText).substring(0, 200)
                : undefined,
            relevance: buildRelevanceNote(node),
            linkedEvidenceId: node.provenance.linkedEvidenceIds[0] ?? node.nodeId,
            linkedNodeIds: [node.nodeId],
            issueTags: node.issueTags,
        };
    });

    // ── Group Exhibits ──
    const groupedExhibits = buildGroupedExhibits(indexEntries, config);

    // ── Cover Sheet Summaries ──
    const coverSheetSummaries = config.includeCoverSheets
        ? buildCoverSheets(indexEntries)
        : [];

    // ── Packet Title ──
    const packetTitle = request.title ?? buildPacketTitle(config);

    return {
        generatedAt,
        packetTitle,
        indexEntries,
        groupedExhibits,
        coverSheetSummaries,
        supportingNodeIds: nodes.map(n => n.nodeId),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildExhibitTitle(node: ClassifiedNode): string {
    if (node.nodeType === 'evidence_item') return 'Evidence Item';
    if (node.nodeType === 'incident_report') return 'Incident Report';
    if (node.nodeType === 'timeline_event') return 'Timeline Entry';
    if (node.nodeType === 'exhibit_note') return 'Exhibit Note';

    // Build from extracted entities
    if (node.extractedEntities.filings.length > 0) {
        return node.extractedEntities.filings[0];
    }

    // Truncate first sentence as title
    const firstSentence = node.cleanedText.split(/[.!?]/)[0];
    return firstSentence.length > 60
        ? firstSentence.substring(0, 57) + '...'
        : firstSentence;
}

function buildSourceDescription(node: ClassifiedNode): string {
    const parts: string[] = [];
    if (node.provenance.sourceDocumentId) parts.push(`Document: ${node.provenance.sourceDocumentId}`);
    if (node.provenance.sourceMessageId) parts.push(`Message ID: ${node.provenance.sourceMessageId}`);
    if (node.extractedEntities.dates.length > 0) parts.push(`Date: ${node.extractedEntities.dates[0]}`);
    if (node.extractedEntities.people.length > 0) parts.push(`Participants: ${node.extractedEntities.people.join(', ')}`);
    return parts.join(' | ') || 'Source metadata not available';
}

function buildRelevanceNote(node: ClassifiedNode): string {
    const notes: string[] = [];
    if (node.issueTags.length > 0) {
        notes.push(`Relevant to: ${node.issueTags.join(', ')}`);
    }
    if (node.exportRelevance.exhibit_document > 0.7) {
        notes.push('High relevance');
    } else if (node.exportRelevance.exhibit_document > 0.4) {
        notes.push('Moderate relevance');
    }
    return notes.join('. ') || '';
}

function buildGroupedExhibits(
    entries: ExhibitMappedItem[],
    config: ExhibitConfig,
): ExhibitMappedSections['groupedExhibits'] {
    const groups = new Map<string, ExhibitMappedItem[]>();

    for (const entry of entries) {
        let groupKey: string;

        switch (config.organization) {
            case 'chronological': {
                // Group by month/year or "Undated"
                const date = entry.date;
                groupKey = date
                    ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
                    : 'Undated';
                break;
            }
            case 'issue_based':
                groupKey = entry.issueTags[0]
                    ? formatGroupName(entry.issueTags[0])
                    : 'General';
                break;
            case 'witness_based':
                groupKey = entry.source?.match(/Participants:\s*(.+?)(?:\s*\||$)/)?.[1] ?? 'Unattributed';
                break;
            case 'source_based':
                groupKey = entry.source?.match(/Document:\s*(.+?)(?:\s*\||$)/)?.[1] ?? 'Other Sources';
                break;
            default:
                groupKey = 'Exhibits';
        }

        const existing = groups.get(groupKey) ?? [];
        existing.push(entry);
        groups.set(groupKey, existing);
    }

    return [...groups.entries()].map(([groupName, items]) => ({
        groupName,
        items,
    }));
}

function buildCoverSheets(
    entries: ExhibitMappedItem[],
): ExhibitMappedSections['coverSheetSummaries'] {
    return entries
        .filter(e => e.summary && e.summary.length > 50)
        .slice(0, 20)
        .map(entry => ({
            label: entry.label,
            heading: entry.title,
            summary: entry.summary ?? '',
            supportingIssues: entry.issueTags,
        }));
}

function buildPacketTitle(config: ExhibitConfig): string {
    const typeNames: Record<string, string> = {
        index_only: 'Exhibit Index',
        packet_only: 'Exhibit Packet',
        packet_with_index: 'Exhibit Packet with Index',
        packet_with_covers: 'Exhibit Packet with Summary Covers',
        hearing_binder: 'Hearing Exhibit Binder',
        mediation_binder: 'Mediation Exhibit Binder',
    };
    return typeNames[config.packetType] ?? 'Exhibit Packet';
}

function formatGroupName(tag: string): string {
    const names: Record<string, string> = {
        electronic_communication: 'Communication Exhibits',
        school_stability: 'School & Academic Records',
        schedule_compliance: 'Schedule & Possession',
        travel_safety: 'Travel Documentation',
        medical_communication: 'Medical Records',
        financial_dispute: 'Financial Documents',
        notice_location: 'Notice & Location Records',
        parenting_conduct: 'Parenting Conduct',
        court_procedure: 'Court Filings & Procedure',
        delay_litigation: 'Litigation Timeline',
    };
    return names[tag] ?? tag
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
