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
    ExportPath,
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

export interface AssemblyResult {
    /** The export path this was assembled for */
    path: ExportPath;
    /** All classified nodes with scores, tags, and transformed text */
    classifiedNodes: ClassifiedNode[];
    /** The legal narrative built from timeline + classified content */
    narrative: LegalNarrative;
    /** The mapped sections ready for prompt generation */
    mappedSections: SummaryMappedSections | CourtMappedSections | ExhibitMappedSections;
    /** Assembly metadata */
    meta: {
        totalNodes: number;
        selectedNodes: number;
        classifiedNodes: number;
        narrativeSections: number;
        detectedPatterns: number;
        reliefConnections: number;
        assemblyTimeMs: number;
    };
}

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

    // ── Step 1: Filter selected nodes ──
    const selectedNodes = request.selectedNodeIds.length > 0
        ? allNodes.filter(n => request.selectedNodeIds.includes(n.id))
        : allNodes; // If no specific selection, use all

    const selectedEvents = request.selectedTimelineIds.length > 0
        ? allEvents.filter(e => request.selectedTimelineIds.includes(e.id))
        : allEvents;

    // ── Step 2: Classify all selected nodes ──
    const classifiedNodes = classifyNodes(selectedNodes);

    // ── Step 3: Build legal narrative ──
    const narrative = buildLegalNarrative(selectedEvents, classifiedNodes);

    // ── Step 4: Route to path-specific mapper ──
    let mappedSections: SummaryMappedSections | CourtMappedSections | ExhibitMappedSections;

    switch (request.path) {
        case 'case_summary':
            mappedSections = mapToSummarySections(classifiedNodes, narrative, request);
            break;
        case 'court_document':
            mappedSections = mapToCourtSections(classifiedNodes, narrative, request);
            break;
        case 'exhibit_document':
            mappedSections = mapToExhibitSections(classifiedNodes, narrative, request);
            break;
    }

    const assemblyTimeMs = performance.now() - startTime;

    return {
        path: request.path,
        classifiedNodes,
        narrative,
        mappedSections,
        meta: {
            totalNodes: allNodes.length,
            selectedNodes: selectedNodes.length,
            classifiedNodes: classifiedNodes.length,
            narrativeSections: narrative.chronology.length,
            detectedPatterns: narrative.patternSections.length,
            reliefConnections: narrative.reliefConnections.length,
            assemblyTimeMs,
        },
    };
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
