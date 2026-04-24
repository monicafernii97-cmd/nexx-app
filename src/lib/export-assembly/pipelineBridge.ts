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
            const errorType = error instanceof Error ? error.name : typeof error;
            console.error(JSON.stringify({
                component: 'PipelineBridge',
                event: 'ai_drafting_failed_with_fallback',
                exportPath: request.path,
                failedSections: sectionsToGenerate,
                errorType,
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
                    // raw_fallback_no_ai: valid DraftedSection.source value indicating
                    // AI drafting failed and raw text was substituted. Semantically
                    // treated as 'user_locked' during canonical export adaptation.
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

/**
 * AI Drafting Retry Configuration
 *
 * All values are configurable via environment variables. Defaults are
 * tuned for the OpenAI Responses API with GPT-5.4.
 *
 * Effective behavior (with defaults):
 *   - First attempt: immediate
 *   - On failure: wait 500ms + 0–250ms jitter, then retry once
 *   - Each attempt has a 60s timeout via Promise.race
 *   - Total worst-case wall time: ~121.75s (60s + 0.75s + 60s + throw)
 *
 * Environment variables:
 *   DRAFT_MAX_RETRIES         — Max retry count (default: 1)
 *   DRAFT_RETRY_BASE_DELAY_MS — Base backoff delay in ms (default: 500)
 *   DRAFT_RETRY_MAX_JITTER_MS — Max random jitter in ms (default: 250)
 *   DRAFT_RETRY_MAX_BACKOFF_MS — Ceiling for exponential backoff in ms (default: 10000)
 *   DRAFT_TIMEOUT_MS          — Per-attempt timeout in ms (default: 60000)
 */

/**
 * Parse an environment variable as a non-negative integer.
 * Returns the default if the value is missing, NaN, or negative.
 */
function parseNonNegativeInt(envValue: string | undefined, defaultValue: number): number {
    if (envValue == null) return defaultValue;
    const parsed = parseInt(envValue, 10);
    return Number.isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
}

/** Maximum retries for GPT drafting. */
const DRAFT_MAX_RETRIES = parseNonNegativeInt(process.env.DRAFT_MAX_RETRIES, 1);

/** Base delay between retry attempts (ms). Multiplied by 2^attempt for backoff. */
const DRAFT_RETRY_BASE_DELAY_MS = parseNonNegativeInt(process.env.DRAFT_RETRY_BASE_DELAY_MS, 500);

/** Maximum random jitter added to retry delay (ms). */
const DRAFT_RETRY_MAX_JITTER_MS = parseNonNegativeInt(process.env.DRAFT_RETRY_MAX_JITTER_MS, 250);

/** Ceiling for exponential backoff (ms). Prevents unbounded growth at high retry counts. */
const DRAFT_RETRY_MAX_BACKOFF_MS = parseNonNegativeInt(process.env.DRAFT_RETRY_MAX_BACKOFF_MS, 10_000);

/** Minimum allowed timeout to prevent immediate aborts (ms). */
const MIN_DRAFT_TIMEOUT_MS = 1_000;

/** Timeout for a single GPT drafting attempt (ms). Clamped to at least MIN_DRAFT_TIMEOUT_MS. */
const DRAFT_TIMEOUT_MS = Math.max(
    parseNonNegativeInt(process.env.DRAFT_TIMEOUT_MS, 60_000),
    MIN_DRAFT_TIMEOUT_MS,
);

/** Simple async delay utility. */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Call generateDraftContent with one retry on failure or incomplete output.
 * Each attempt is guarded by a timeout via AbortController that cancels
 * the in-flight OpenAI request if it exceeds DRAFT_TIMEOUT_MS.
 */
async function generateDraftContentWithRetry(
    params: Parameters<typeof generateDraftContent>[0],
    expectedSectionIds: string[],
): Promise<Awaited<ReturnType<typeof generateDraftContent>>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= DRAFT_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);

        try {
            const drafted = await generateDraftContent({
                ...params,
                signal: controller.signal,
            });

            // Guard: treat empty or partial AI output as failure
            const draftedMap = new Map(drafted.map(s => [s.sectionId, s]));
            const missing = expectedSectionIds.filter(id => {
                const section = draftedMap.get(id);
                if (!section) return true;
                // Treat blank body + no meaningful numbered items as effectively missing
                const hasBody = section.body?.trim();
                const hasItems = section.numberedItems
                    && section.numberedItems.some(item => item?.trim());
                return !hasBody && !hasItems;
            });
            if (drafted.length === 0 || missing.length > 0) {
                throw new Error(
                    `AI drafter returned incomplete output: missing/empty sections [${missing.join(', ')}]`,
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
                    totalAttempts: DRAFT_MAX_RETRIES + 1,
                    errorType: lastError.name,
                }));
                const backoff = Math.min(DRAFT_RETRY_BASE_DELAY_MS * 2 ** attempt, DRAFT_RETRY_MAX_BACKOFF_MS);
                const jitter = Math.floor(Math.random() * DRAFT_RETRY_MAX_JITTER_MS);
                await sleep(backoff + jitter);
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError ?? new Error('AI drafting failed after all retry attempts');
}
