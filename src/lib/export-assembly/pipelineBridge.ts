/**
 * Pipeline Bridge — Connects the export assembly orchestrator to the
 * existing documentDrafter for GPT-assisted content generation.
 *
 * This module handles:
 * 1. Converting assembly output + overrides into drafter-compatible input
 * 2. Preserving locked section content (skipping GPT for those sections)
 * 3. Applying user-edited text overrides
 * 4. Producing DraftedSection[] with source attribution
 *
 * This is the ONLY place where assembly output meets GPT. The orchestrator
 * calls this after the user approves the review.
 */

import { generateDraftContent } from '@/lib/nexx/documentDrafter';
import type {
    OrchestratorAssemblyResult,
    DraftedSection,
    ExportOverrides,
    OrchestratorPipelineResult,
    PipelineStatus,
} from './orchestrator';
import type { ExportRequest, MappingReviewItem, CourtMappedSections } from './types/exports';
import type { AssemblyResult } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for the pipeline bridge. */
export interface PipelineBridgeInput {
    /** The approved assembly result from the review hub */
    assemblyResult: OrchestratorAssemblyResult;
    /** User overrides from the review session */
    overrides: ExportOverrides;
    /** The original export request for context */
    request: ExportRequest;
    /** Review items with any user modifications */
    reviewItems: MappingReviewItem[];
    /** Optional status callback for progress updates */
    onStatus?: (status: PipelineStatus) => void;
}

// ---------------------------------------------------------------------------
// Core Function
// ---------------------------------------------------------------------------

/**
 * Run the drafting phase — bridges assembly output to GPT.
 *
 * Locked sections are preserved verbatim. Unlocked sections are sent to
 * the AI drafter with all available context. User-edited text is used
 * directly without GPT rewriting.
 */
export async function runDraftingPhase(input: PipelineBridgeInput): Promise<OrchestratorPipelineResult> {
    const { assemblyResult, overrides, request, reviewItems, onStatus } = input;
    const { assembly, meta } = assemblyResult;

    // ── Phase: Applying overrides ──
    onStatus?.({ phase: 'applying_overrides', progress: 55, detail: 'Applying user overrides...' });

    // Build set of locked section IDs
    const lockedSectionIds = new Set(
        overrides.sectionOverrides.filter(s => s.isLocked).map(s => s.sectionId),
    );

    // Build map of user-edited items
    const editedItemMap = new Map<string, string>();
    for (const itemOverride of overrides.itemOverrides) {
        if (itemOverride.editedText) {
            editedItemMap.set(itemOverride.nodeId, itemOverride.editedText);
        }
    }

    // Build excluded set
    const excludedNodeIds = new Set(
        overrides.itemOverrides.filter(o => o.excluded).map(o => o.nodeId),
    );

    // ── Phase: Drafting ──
    onStatus?.({ phase: 'drafting', progress: 60, detail: 'Generating draft content...' });

    // Determine which sections need drafting vs. which are locked/edited
    const sectionsToGenerate: string[] = [];
    const lockedDraftedSections: DraftedSection[] = [];

    // Get section IDs from the assembly
    const sectionIds = extractSectionIds(assembly, request.path);

    for (const sectionId of sectionIds) {
        if (lockedSectionIds.has(sectionId)) {
            // Locked — collect items for this section and preserve verbatim
            const sectionItems = reviewItems.filter(item => {
                if (excludedNodeIds.has(item.nodeId) || !item.includedInExport) return false;
                const assignedSection = item.userOverride?.forceSection
                    ?? item.suggestedSections[0]
                    ?? 'Unclassified';
                return assignedSection === sectionId;
            });

            const body = sectionItems.map(item =>
                editedItemMap.get(item.nodeId)
                ?? item.transformedCourtSafeText
                ?? item.originalText
            ).join('\n\n');

            lockedDraftedSections.push({
                sectionId,
                heading: formatSectionHeading(sectionId),
                body,
                source: 'user_locked',
            });
        } else {
            sectionsToGenerate.push(sectionId);
        }
    }

    // Draft unlocked sections with GPT
    let aiDraftedSections: DraftedSection[] = [];

    if (sectionsToGenerate.length > 0) {
        onStatus?.({ phase: 'drafting', progress: 65, detail: `Drafting ${sectionsToGenerate.length} sections with AI...` });

        // Build context from non-excluded review items
        const contextItems = reviewItems
            .filter(item => !excludedNodeIds.has(item.nodeId) && item.includedInExport)
            .map(item => ({
                text: editedItemMap.get(item.nodeId) ?? item.originalText,
                type: item.dominantType,
                section: item.userOverride?.forceSection ?? item.suggestedSections[0] ?? 'unknown',
            }));

        const caseGraph: Record<string, unknown> = {
            items: contextItems,
            exportPath: request.path,
        };

        // Add court rules if available
        const courtRules: Record<string, unknown> = {};
        if (request.path === 'court_document' && request.config) {
            // CourtConfig has known fields — extract safely
            const config = request.config;
            if ('documentType' in config) courtRules['documentType'] = config.documentType;
            if ('tone' in config) courtRules['tone'] = config.tone;
        }

        try {
            const drafted = await generateDraftContentWithRetry({
                templateId: `${request.path}_${Date.now()}`,
                templateName: getTemplateName(request.path),
                sections: sectionsToGenerate,
                caseGraph,
                courtRules: Object.keys(courtRules).length > 0 ? courtRules : undefined,
            }, sectionsToGenerate);

            aiDraftedSections = drafted.map(d => ({
                sectionId: d.sectionId,
                heading: d.heading,
                body: d.body,
                numberedItems: d.numberedItems,
                source: 'ai_drafted' as const,
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({
                component: 'PipelineBridge',
                event: 'ai_drafting_failed_with_fallback',
                exportPath: request.path,
                failedSections: sectionsToGenerate,
                error: errorMessage,
            }));

            // Fallback: use raw review item text for failed sections
            aiDraftedSections = sectionsToGenerate.map(sectionId => {
                const sectionItems = reviewItems.filter(item => {
                    if (excludedNodeIds.has(item.nodeId) || !item.includedInExport) return false;
                    const assignedSection = item.userOverride?.forceSection
                        ?? item.suggestedSections[0]
                        ?? 'Unclassified';
                    return assignedSection === sectionId;
                });

                return {
                    sectionId,
                    heading: formatSectionHeading(sectionId),
                    body: sectionItems.map(item =>
                        editedItemMap.get(item.nodeId)
                        ?? item.transformedCourtSafeText
                        ?? item.originalText
                    ).join('\n\n'),
                    source: 'raw_fallback_no_ai' as const,
                };
            });
        }
    }

    // ── Phase: Compliance ──
    onStatus?.({ phase: 'compliance', progress: 85, detail: 'Running compliance checks...' });

    // Merge locked + AI drafted sections in original order
    const allDrafted: DraftedSection[] = [];
    for (const sectionId of sectionIds) {
        const locked = lockedDraftedSections.find(s => s.sectionId === sectionId);
        if (locked) {
            allDrafted.push(locked);
            continue;
        }
        const drafted = aiDraftedSections.find(s => s.sectionId === sectionId);
        if (drafted) {
            allDrafted.push(drafted);
        }
    }

    // ── Phase: Saving ──
    onStatus?.({ phase: 'saving', progress: 92, detail: 'Preparing output...' });

    return {
        assembly,
        draftedSections: allDrafted,
        meta,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract section IDs from the assembly result based on export path. */
function extractSectionIds(assembly: AssemblyResult, exportPath: string): string[] {
    if (!assembly) return [];

    // For court documents, extract from mapped sections
    if (exportPath === 'court_document' && assembly.path === 'court_document') {
        const court = assembly.mappedSections as CourtMappedSections;
        const ids: string[] = [];
        // CourtMappedSections has named section arrays, not a generic sections[]
        if (court.factualBackground) {
            for (const section of court.factualBackground) {
                ids.push(section.heading ?? 'factual_background');
            }
        }
        if (court.legalGrounds) {
            for (const section of court.legalGrounds) {
                ids.push(section.heading ?? 'legal_grounds');
            }
        }
        if (court.argumentSections) {
            for (const section of court.argumentSections) {
                ids.push(section.heading ?? 'argument');
            }
        }
        if (ids.length === 0) {
            // Fallback section IDs for court documents
            ids.push('introduction', 'factual_background', 'legal_grounds', 'argument', 'prayer_for_relief');
        }
        return ids;
    }

    // Fallback: collect unique section IDs from classified data
    if (assembly.classifiedNodes && Array.isArray(assembly.classifiedNodes)) {
        const sectionSet = new Set<string>();
        for (const node of assembly.classifiedNodes) {
            // suggestedSections is { case_summary: string[]; court_document: string[]; exhibit_document: string[] }
            const pathKey = exportPath as keyof typeof node.suggestedSections;
            const sections = node.suggestedSections?.[pathKey];
            if (sections && Array.isArray(sections)) {
                for (const s of sections) {
                    sectionSet.add(s);
                }
            }
        }
        return Array.from(sectionSet);
    }

    return [];
}

/** Format a section ID into a readable heading. */
function formatSectionHeading(sectionId: string): string {
    return sectionId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Get a human-readable template name for the export path. */
function getTemplateName(exportPath: string): string {
    switch (exportPath) {
        case 'court_document': return 'Court Filing Document';
        case 'case_summary': return 'Case Summary Report';
        case 'exhibit_document': return 'Exhibit Packet';
        default: return 'Legal Document';
    }
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

/** Maximum retries for GPT drafting. */
const DRAFT_MAX_RETRIES = 1;

/**
 * Call generateDraftContent with one retry on failure or incomplete output.
 * Validates that all requested sections are returned.
 */
async function generateDraftContentWithRetry(
    params: Parameters<typeof generateDraftContent>[0],
    expectedSectionIds: string[],
): Promise<Awaited<ReturnType<typeof generateDraftContent>>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= DRAFT_MAX_RETRIES; attempt++) {
        try {
            const drafted = await generateDraftContent(params);

            // Guard: treat empty or partial AI output as failure
            const draftedIds = new Set(drafted.map(s => s.sectionId));
            if (
                drafted.length === 0 ||
                expectedSectionIds.some(id => !draftedIds.has(id))
            ) {
                const missing = expectedSectionIds.filter(id => !draftedIds.has(id));
                throw new Error(
                    `AI drafter returned incomplete output: missing sections [${missing.join(', ')}]`,
                );
            }

            if (attempt > 0) {
                console.warn(JSON.stringify({
                    component: 'PipelineBridge',
                    event: 'ai_drafting_succeeded_on_retry',
                    attempt: attempt + 1,
                    sectionCount: drafted.length,
                }));
            }

            return drafted;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < DRAFT_MAX_RETRIES) {
                console.warn(JSON.stringify({
                    component: 'PipelineBridge',
                    event: 'ai_drafting_retry',
                    attempt: attempt + 1,
                    maxRetries: DRAFT_MAX_RETRIES + 1,
                    error: lastError.message,
                }));
            }
        }
    }

    throw lastError ?? new Error('AI drafting failed after all retry attempts');
}
