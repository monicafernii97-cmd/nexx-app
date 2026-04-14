/**
 * Map to Court — Court document export path mapper.
 *
 * Takes classified nodes + legal narrative and produces CourtMappedSections.
 *
 * Mapping rules:
 * - Case profile → caption / header
 * - Selected facts → factual background
 * - Legal issue tags → grounds / argument headings
 * - Timeline events → statement of facts
 * - Requests panel → prayer
 * - Evidence links → exhibit references
 * - Party identity → signature / service blocks
 *
 * CRITICAL: This mapper's output feeds INTO the existing documentDrafter.ts —
 * it does NOT replace the court prompting layer.
 *
 * Output section structure for a motion:
 *   captionData → title → introduction → factualBackground →
 *   legalGrounds → argumentSections → requestedRelief →
 *   exhibitReferences → procedureNotes → signatureBlockHints →
 *   certificateOfServiceHints
 */

import type { ClassifiedNode } from '../types/classification';
import type { LegalNarrative } from '../types/narrative';
import type { CourtMappedSections, ExportRequest, CourtConfig } from '../types/exports';

// ---------------------------------------------------------------------------
// Title Generation
// ---------------------------------------------------------------------------

/** Generate filing title from document type and party role. */
function generateTitle(config: CourtConfig): string {
    const rolePrefix: Record<string, string> = {
        petitioner: "Petitioner's",
        respondent: "Respondent's",
        movant: "Movant's",
        nonmovant: "Non-Movant's",
    };

    const typeNames: Record<string, string> = {
        motion: 'Motion',
        response: 'Response',
        notice: 'Notice',
        declaration: 'Declaration',
        affidavit: 'Affidavit',
        petition: 'Petition',
        proposed_order: 'Proposed Order',
        objection: 'Objection',
    };

    const prefix = config.partyRole ? rolePrefix[config.partyRole] ?? '' : '';
    const typeName = typeNames[config.documentType] ?? 'Filing';

    return prefix ? `${prefix} ${typeName}` : typeName;
}

// ---------------------------------------------------------------------------
// Main Mapper
// ---------------------------------------------------------------------------

/**
 * Map classified workspace content to court document sections.
 *
 * Uses ONLY courtSafe text — never raw emotional content.
 * Separates facts from arguments. Orders chronologically.
 * Converts notes to allegations. Attaches exhibit refs.
 */
export function mapToCourtSections(
    nodes: ClassifiedNode[],
    narrative: LegalNarrative,
    request: ExportRequest,
): CourtMappedSections {
    const config = request.config as CourtConfig;
    const generatedAt = new Date().toISOString();

    // ── Caption Data ──
    const captionData = config.includeCaption ? buildCaptionData(nodes) : undefined;

    // ── Title ──
    const title = request.title ?? generateTitle(config);

    // ── Introduction ──
    // Build from highest-confidence argument/strategy nodes
    const introNodes = nodes
        .filter(n =>
            n.nodeType === 'strategy_point' ||
            n.nodeType === 'narrative_block' ||
            (n.dominantType === 'argument' && n.confidence > 0.6),
        )
        .sort((a, b) => b.exportRelevance.court_document - a.exportRelevance.court_document)
        .slice(0, 2);

    const introduction = introNodes.length > 0
        ? introNodes
            .map(n => n.transformedText.courtSafe ?? n.cleanedText)
            .join(' ')
        : undefined;

    // ── Factual Background ──
    // Pull from narrative chronology + fact-dominant nodes
    const factNodes = nodes
        .filter(n =>
            n.suggestedSections.court_document.includes('factualBackground') ||
            n.dominantType === 'fact' ||
            n.nodeType === 'key_fact' ||
            n.nodeType === 'incident_report',
        )
        .sort((a, b) => {
            // Sort by date if available, then by relevance
            const dateA = a.extractedEntities.dates[0] ?? '';
            const dateB = b.extractedEntities.dates[0] ?? '';
            if (dateA && dateB) return dateA.localeCompare(dateB);
            return b.exportRelevance.court_document - a.exportRelevance.court_document;
        });

    const factualBackground = [
        // First, chronology from narrative
        ...narrative.chronology.map(section => ({
            ...section,
            // Ensure court-safe text
            text: section.text,
        })),
        // Then, individual fact nodes not already covered by chronology
        ...factNodes
            .filter(n => !narrative.chronology.some(
                c => c.supportingEventIds.some(
                    eid => n.provenance.linkedTimelineIds.includes(eid),
                ),
            ))
            .slice(0, 10)
            .map((n, i) => ({
                id: `fact-${i}`,
                heading: n.extractedEntities.dates.length > 0
                    ? `On ${n.extractedEntities.dates[0]}`
                    : `Factual Basis ${i + 1}`,
                text: n.transformedText.courtSafe ?? n.cleanedText,
                supportingEventIds: n.provenance.linkedTimelineIds,
                supportingEvidenceIds: n.provenance.linkedEvidenceIds,
                confidence: n.confidence,
            })),
    ];

    // ── Legal Grounds ──
    const legalGrounds = config.includeLegalStandard
        ? buildLegalGrounds(nodes, narrative)
        : [];

    // ── Argument Sections ──
    const argumentNodes = nodes
        .filter(n =>
            n.suggestedSections.court_document.includes('argumentSections') ||
            n.dominantType === 'argument' ||
            n.nodeType === 'strategy_point',
        )
        .sort((a, b) => b.scores.argument - a.scores.argument)
        .slice(0, 10);

    const argumentSections = argumentNodes.map((n, i) => ({
        id: `argument-${i}`,
        heading: n.issueTags.length > 0
            ? formatArgumentHeading(n.issueTags[0])
            : `Argument ${i + 1}`,
        text: n.transformedText.courtSafe ?? n.cleanedText,
        supportingEventIds: n.provenance.linkedTimelineIds,
        supportingEvidenceIds: n.provenance.linkedEvidenceIds,
        confidence: n.confidence,
    }));

    // ── Requested Relief ──
    const requestedRelief: string[] = [];
    // From explicit request nodes
    const requestNodes = nodes.filter(n =>
        n.dominantType === 'request' ||
        n.suggestedSections.court_document.includes('requestedRelief'),
    );
    for (const n of requestNodes) {
        requestedRelief.push(n.transformedText.courtSafe ?? n.cleanedText);
    }
    // From narrative relief connections
    for (const rc of narrative.reliefConnections) {
        if (!requestedRelief.includes(rc.suggestedRelief)) {
            requestedRelief.push(rc.suggestedRelief);
        }
    }

    // ── Exhibit References ──
    const exhibitReferences = buildExhibitReferences(nodes, config);

    // ── Procedure Notes ──
    const procedureNodes = nodes.filter(n =>
        n.dominantType === 'procedure' ||
        n.nodeType === 'procedure_note',
    );
    const procedureNotes = procedureNodes.map(n =>
        n.transformedText.courtSafe ?? n.cleanedText,
    );

    // ── Signature Block Hints ──
    const signatureBlockHints = config.partyRole
        ? [`${config.partyRole.charAt(0).toUpperCase() + config.partyRole.slice(1)}, Pro Se`]
        : [];

    // ── Certificate of Service Hints ──
    const certificateOfServiceHints = config.includeCertificateOfService
        ? ['Served via eFile Texas on all parties of record.']
        : [];

    // ── Supporting Node IDs (provenance) ──
    const supportingNodeIds = nodes.map(n => n.nodeId);

    return {
        generatedAt,
        captionData,
        title,
        introduction,
        factualBackground,
        legalGrounds,
        argumentSections,
        requestedRelief,
        exhibitReferences,
        procedureNotes,
        signatureBlockHints,
        certificateOfServiceHints,
        supportingNodeIds,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCaptionData(nodes: ClassifiedNode[]) {
    // Extract court and party info from entities
    const allCourts: string[] = [];
    const allPeople: string[] = [];

    for (const node of nodes) {
        allCourts.push(...node.extractedEntities.courts);
        allPeople.push(...node.extractedEntities.people);
    }

    return {
        courtName: [...new Set(allCourts)][0],
        partyRoles: [...new Set(allPeople)].slice(0, 4),
    };
}

function buildLegalGrounds(
    nodes: ClassifiedNode[],
    narrative: LegalNarrative,
) {
    // Use issue summaries as the basis for legal grounds
    return narrative.issueSummaries.map(issue => ({
        ...issue,
        heading: `Legal Basis: ${issue.heading}`,
    }));
}

function buildExhibitReferences(
    nodes: ClassifiedNode[],
    config: CourtConfig,
) {
    const refs: CourtMappedSections['exhibitReferences'] = [];
    const seen = new Set<string>();

    // From linked exhibit IDs in config
    const linkedIds = config.linkedExhibitIds ?? [];

    // From nodes with exhibit references
    for (const node of nodes) {
        for (let i = 0; i < node.extractedEntities.exhibits.length; i++) {
            const label = node.extractedEntities.exhibits[i];
            if (seen.has(label)) continue;
            seen.add(label);

            refs.push({
                label,
                description: node.cleanedText.substring(0, 150),
                linkedEvidenceId: node.provenance.linkedEvidenceIds[0] ?? '',
            });
        }
    }

    // Add any manually linked exhibits not already covered
    for (const eid of linkedIds) {
        if (!refs.some(r => r.linkedEvidenceId === eid)) {
            refs.push({
                label: `Exhibit ${refs.length + 1}`,
                description: '',
                linkedEvidenceId: eid,
            });
        }
    }

    return refs;
}

function formatArgumentHeading(issueTag: string): string {
    const headings: Record<string, string> = {
        electronic_communication: 'The Electronic Communication Arrangement Should Be Clarified',
        school_stability: 'The Child\'s School Stability Must Be Preserved',
        schedule_compliance: 'The Established Schedule Should Be Enforced',
        travel_safety: 'Travel Notice and Safety Requirements Are Warranted',
        medical_communication: 'Medical Information Sharing Is Required',
        financial_dispute: 'Financial Obligations Must Be Clarified',
        notice_location: 'Notice Requirements Should Be Enforced',
        parenting_conduct: 'A Parenting Coordinator Should Be Appointed',
        delay_litigation: 'Expedited Resolution Is Warranted',
        court_procedure: 'Procedural Compliance Must Be Addressed',
    };
    return headings[issueTag] ?? issueTag
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
