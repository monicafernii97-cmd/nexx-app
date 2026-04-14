/**
 * Export Assembly Engine — Master Orchestrator (index.ts)
 *
 * This is the single entry point for the entire export assembly pipeline.
 *
 * Pipeline:
 * 1. Filter selected workspace nodes
 * 2. Classify each node (sentence-level → node-level)
 * 3. Build legal narrative from timeline + classified nodes
 * 4. Route to path-specific mapper
 * 5. Return mapped sections ready for prompt generation
 *
 * This runs BEFORE prompt generation — it pre-builds the skeleton
 * so the AI doesn't have to guess.
 *
 * Usage:
 * ```typescript
 * import { assembleExportInput } from '@/lib/export-assembly';
 *
 * const result = assembleExportInput(workspaceNodes, timelineEvents, exportRequest);
 * // result.mappedSections is SummaryMappedSections | CourtMappedSections | ExhibitMappedSections
 * // result.classifiedNodes gives full classification detail
 * // result.narrative gives the legal narrative structure
 * ```
 */

import type { WorkspaceNode } from './types/workspace';
import type { ClassifiedNode } from './types/classification';
import type { TimelineEventNode, LegalNarrative } from './types/narrative';
import type {
    ExportRequest,
    SummaryMappedSections,
    CourtMappedSections,
    ExhibitMappedSections,
} from './types/exports';
import { classifyNodes } from './classifier/nodeClassifier';
import { buildLegalNarrative } from './narrative/legalNarrativeBuilder';
import { mapToSummarySections } from './mappers/mapToSummary';
import { mapToCourtSections } from './mappers/mapToCourt';
import { mapToExhibitSections } from './mappers/mapToExhibits';

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/** Shared metadata across all export paths. */
export interface AssemblyMeta {
    totalNodes: number;
    selectedNodes: number;
    classifiedNodes: number;
    /** Total narrative sections (chronology + patterns + turning points + issues) */
    narrativeSections: number;
    detectedPatterns: number;
    reliefConnections: number;
    assemblyTimeMs: number;
}

/** Base fields shared by all assembly results. */
interface AssemblyResultBase {
    classifiedNodes: ClassifiedNode[];
    narrative: LegalNarrative;
    meta: AssemblyMeta;
}

/** Discriminated union — callers can narrow mappedSections from path. */
export type AssemblyResult =
    | (AssemblyResultBase & { path: 'case_summary'; mappedSections: SummaryMappedSections })
    | (AssemblyResultBase & { path: 'court_document'; mappedSections: CourtMappedSections })
    | (AssemblyResultBase & { path: 'exhibit_document'; mappedSections: ExhibitMappedSections });

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Assemble export input — the master orchestrator.
 *
 * Runs the complete pre-generation pipeline:
 * 1. Filter → 2. Classify → 3. Build Narrative → 4. Route & Map
 *
 * @param allNodes     All workspace nodes (will be filtered by request.selectedNodeIds)
 * @param allEvents    All timeline events (will be filtered by request.selectedTimelineIds)
 * @param request      The export request from the modal
 * @returns            AssemblyResult with classified nodes, narrative, and mapped sections
 */
export function assembleExportInput(
    allNodes: WorkspaceNode[],
    allEvents: TimelineEventNode[],
    request: ExportRequest,
): AssemblyResult {
    const startTime = performance.now();

    // ── Step 1: Filter selected nodes (use Set for O(1) lookups) ──
    const selectedNodeIdSet = new Set(request.selectedNodeIds);
    const selectedTimelineIdSet = new Set(request.selectedTimelineIds);

    const selectedNodes = selectedNodeIdSet.size > 0
        ? allNodes.filter(n => selectedNodeIdSet.has(n.id))
        : allNodes; // If no specific selection, use all

    const selectedEvents = selectedTimelineIdSet.size > 0
        ? allEvents.filter(e => selectedTimelineIdSet.has(e.id))
        : allEvents;

    // ── Step 2: Classify all selected nodes ──
    const classifiedNodes = classifyNodes(selectedNodes);

    // ── Step 3: Build legal narrative ──
    const narrative = buildLegalNarrative(selectedEvents, classifiedNodes);

    // ── Step 4: Compute assembly metadata ──
    const assemblyTimeMs = performance.now() - startTime;

    const meta: AssemblyMeta = {
        totalNodes: allNodes.length,
        selectedNodes: selectedNodes.length,
        classifiedNodes: classifiedNodes.length,
        narrativeSections:
            narrative.chronology.length +
            narrative.patternSections.length +
            narrative.turningPoints.length +
            narrative.issueSummaries.length,
        detectedPatterns: narrative.patternSections.length,
        reliefConnections: narrative.reliefConnections.length,
        assemblyTimeMs,
    };

    // ── Step 5: Route to path-specific mapper and return ──
    // Return directly from each branch so TypeScript can infer the
    // discriminated union without a cast.
    switch (request.path) {
        case 'case_summary':
            return {
                path: 'case_summary',
                classifiedNodes,
                narrative,
                mappedSections: mapToSummarySections(classifiedNodes, narrative, request),
                meta,
            };
        case 'court_document':
            return {
                path: 'court_document',
                classifiedNodes,
                narrative,
                mappedSections: mapToCourtSections(classifiedNodes, narrative, request),
                meta,
            };
        case 'exhibit_document':
            return {
                path: 'exhibit_document',
                classifiedNodes,
                narrative,
                mappedSections: mapToExhibitSections(classifiedNodes, narrative, request),
                meta,
            };
        default: {
            // Exhaustiveness check — TypeScript will error if a new ExportPath is added
            const _exhaustive: never = request.path;
            throw new Error(`Unknown export path: ${_exhaustive}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

// Types
export type { WorkspaceNode, WorkspaceNodeType } from './types/workspace';
export type { ClassifiedNode, SentenceClassification, SentenceType } from './types/classification';
export type { TimelineEventNode, LegalNarrative, NarrativePhase } from './types/narrative';
export type {
    ExportPath,
    ExportRequest,
    SummaryConfig,
    CourtConfig,
    ExhibitConfig,
    SummaryMappedSections,
    CourtMappedSections,
    ExhibitMappedSections,
    MappingReviewItem,
    PromptProfile,
    OutputFormat,
    StructureSource,
} from './types/exports';

// Individual functions for advanced use
export { classifyNode, classifyNodes } from './classifier/nodeClassifier';
export { buildLegalNarrative } from './narrative/legalNarrativeBuilder';
export { mapToSummarySections } from './mappers/mapToSummary';
export { mapToCourtSections } from './mappers/mapToCourt';
export { mapToExhibitSections } from './mappers/mapToExhibits';

// Utilities
export { getFactSentences, getArgumentSentences, getEmotionSentences } from './types/classification';
export { buildCourtSafeText } from './transform/courtSafeRewriter';
export { buildSummarySafeText } from './transform/summarySafeRewriter';
