/**
 * Map to Summary — Summary export path mapper.
 *
 * Takes classified nodes + legal narrative and produces SummaryMappedSections.
 *
 * Mapping rules:
 * - Case metadata → matter overview
 * - Timeline entries → chronology
 * - Narrative blocks → facts / themes
 * - Tagged issues → issue summaries
 * - Evidence links → supporting references
 * - AI analysis → observations / gaps / next steps
 *
 * Output section structure:
 *   overview → parties → keyIssues → timelineSummary → incidents →
 *   evidenceOverview → patternSummary → gapsOrOpenQuestions →
 *   recommendedNextSteps
 */

import type { ClassifiedNode } from '../types/classification';
import type { LegalNarrative } from '../types/narrative';
import type { SummaryMappedSections, ExportRequest, SummaryConfig } from '../types/exports';

/**
 * Map classified workspace content to summary export sections.
 */
export function mapToSummarySections(
    nodes: ClassifiedNode[],
    narrative: LegalNarrative,
    request: ExportRequest,
): SummaryMappedSections {
    const config = request.config as SummaryConfig;
    const generatedAt = new Date().toISOString();

    // ── Overview ──
    // Use the highest-confidence narrative_block or key_fact nodes
    const overviewNodes = nodes
        .filter(n =>
            n.nodeType === 'narrative_block' ||
            n.nodeType === 'key_fact' ||
            n.nodeType === 'strategy_point',
        )
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

    const overview = overviewNodes.length > 0
        ? overviewNodes
            .map(n => n.transformedText.summarySafe ?? n.cleanedText)
            .join(' ')
        : undefined;

    // ── Parties ──
    // Extract from all people entities
    const allPeople = new Set<string>();
    for (const node of nodes) {
        for (const person of node.extractedEntities.people) {
            allPeople.add(person);
        }
    }
    const parties = allPeople.size > 0
        ? `Parties involved: ${[...allPeople].join(', ')}`
        : undefined;

    // ── Key Issues ──
    const allIssueTags = new Set<string>();
    for (const node of nodes) {
        for (const tag of node.issueTags) {
            allIssueTags.add(tag);
        }
    }
    // Prefer narrative issue summaries; fall back to raw issue tags
    const keyIssues = narrative.issueSummaries.length > 0
        ? narrative.issueSummaries.map(s => s.heading)
        : [...allIssueTags].map(tag =>
            tag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        );

    // ── Timeline Summary ──
    const timelineSummary = config.includeTimeline
        ? narrative.chronology
        : [];

    // ── Incidents ──
    // Nodes classified as incident-type or with strong fact + timeline scores
    const incidentNodes = nodes
        .filter(n =>
            n.nodeType === 'incident_report' ||
            (n.scores.fact > 0.5 && n.scores.timeline_event > 0.3),
        )
        .sort((a, b) => b.exportRelevance.case_summary - a.exportRelevance.case_summary)
        .slice(0, 10);

    const incidents = incidentNodes.map((n, i) => ({
        id: `incident-${i}`,
        heading: n.extractedEntities.dates.length > 0
            ? `Incident on ${n.extractedEntities.dates[0]}`
            : `Incident #${i + 1}`,
        text: n.transformedText.summarySafe ?? n.cleanedText,
        supportingEventIds: n.provenance.linkedTimelineIds,
        supportingEvidenceIds: n.provenance.linkedEvidenceIds,
        confidence: n.confidence,
    }));

    // ── Evidence Overview ──
    const evidenceNodes = nodes.filter(n =>
        n.dominantType === 'evidence_reference' ||
        n.tags.includes('has_exhibit_reference'),
    );
    const evidenceOverview = config.includeEvidenceAppendix
        ? evidenceNodes.map(n => {
            const exhibits = n.extractedEntities.exhibits.join(', ');
            return exhibits
                ? `${exhibits}: ${n.cleanedText.substring(0, 150)}`
                : n.cleanedText.substring(0, 200);
        })
        : [];

    // ── Pattern Summary ──
    const patternSummary = narrative.patternSections;

    // ── Gaps / Open Questions ──
    const riskNodes = nodes.filter(n =>
        n.dominantType === 'risk' ||
        n.nodeType === 'risk_concern' ||
        n.nodeType === 'question_to_verify',
    );
    const gapsOrOpenQuestions = riskNodes.map(n =>
        n.transformedText.summarySafe ?? n.cleanedText,
    );

    // ── Recommended Next Steps ──
    const recommendedNextSteps: string[] = [];
    if (config.includeRecommendations) {
        // Generate recommendations based on detected issues and patterns
        if (narrative.reliefConnections.length > 0) {
            for (const rc of narrative.reliefConnections.slice(0, 5)) {
                recommendedNextSteps.push(
                    `Consider: ${rc.suggestedRelief} (based on ${rc.issue} analysis)`,
                );
            }
        }

        if (gapsOrOpenQuestions.length > 0) {
            recommendedNextSteps.push(
                `Resolve ${gapsOrOpenQuestions.length} open question(s) before proceeding with formal filing.`,
            );
        }

        if (patternSummary.length > 0) {
            recommendedNextSteps.push(
                `Document ${patternSummary.length} detected pattern(s) with additional evidence to strengthen case.`,
            );
        }

        if (evidenceNodes.length > 0) {
            recommendedNextSteps.push(
                `Review and organize ${evidenceNodes.length} evidence item(s) for potential exhibit preparation.`,
            );
        }
    }

    // ── Supporting Node IDs (provenance) ──
    const supportingNodeIds = nodes.map(n => n.nodeId);

    return {
        generatedAt,
        overview,
        parties,
        keyIssues,
        incidents,
        timelineSummary,
        evidenceOverview,
        patternSummary,
        gapsOrOpenQuestions,
        recommendedNextSteps,
        supportingNodeIds,
    };
}
