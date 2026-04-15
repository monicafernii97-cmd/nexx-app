/**
 * Export Orchestrator — Pipeline coordinator for the Review-Centered Assembly.
 *
 * This is the single entry point that manages the full export lifecycle:
 *   1. Assemble (deterministic keyword engine)
 *   2. Present for human review (PAUSE)
 *   3. Apply overrides (merge human edits)
 *   4. Draft (GPT generation for unlocked sections)
 *   5. Validate (compliance + preflight)
 *   6. Render (PDF/DOCX)
 *
 * Key architecture rule: Assembly output and draft output are stored separately.
 * The assembly result is deterministic; the draft result is GPT-generated.
 * This separation enables review, diffs, and trust.
 */

import type { WorkspaceNode } from './types/workspace';
import type { ClassifiedNode } from './types/classification';
import type { TimelineEventNode, LegalNarrative } from './types/narrative';
import type {
    ExportRequest,
    ExportPath,
    SummaryMappedSections,
    CourtMappedSections,
    ExhibitMappedSections,
    MappingReviewItem,
} from './types/exports';
import { assembleExportInput, type AssemblyResult, type AssemblyMeta } from './index';

// ---------------------------------------------------------------------------
// Pipeline Status
// ---------------------------------------------------------------------------

/** Granular pipeline phases for real-time progress UI. */
export type PipelinePhase =
    | 'collecting'
    | 'classifying'
    | 'mapping'
    | 'ready_for_review'
    | 'applying_overrides'
    | 'drafting'
    | 'compliance'
    | 'rendering'
    | 'saving'
    | 'completed'
    | 'error';

/** Status event emitted at each pipeline transition. */
export interface PipelineStatus {
    phase: PipelinePhase;
    progress: number; // 0-100
    detail: string;
}

// ---------------------------------------------------------------------------
// Override Types
// ---------------------------------------------------------------------------

/** Section-level override from the Review Hub. */
export interface SectionOverride {
    sectionId: string;
    /** When true, this section is frozen — regeneration skips it */
    isLocked: boolean;
    /** User-defined item order within this section (node IDs) */
    itemOrder?: string[];
}

/** Item-level override from the Review Hub. */
export interface ItemOverride {
    nodeId: string;
    /** User-edited replacement text */
    editedText?: string;
    /** Force this item into a different section */
    forcedSection?: string;
    /** Exclude this item from the export entirely */
    excluded?: boolean;
}

/** Complete set of user overrides for an export. */
export interface ExportOverrides {
    sectionOverrides: SectionOverride[];
    itemOverrides: ItemOverride[];
}

// ---------------------------------------------------------------------------
// Assembly Result (what the orchestrator returns for the Review Hub)
// ---------------------------------------------------------------------------

/** The orchestrator's assembly output — ready for human review. */
export interface OrchestratorAssemblyResult {
    /** The raw assembly output from the keyword engine */
    assembly: AssemblyResult;
    /** Review items derived from classified nodes for the Review Hub */
    reviewItems: MappingReviewItem[];
    /** Assembly metadata */
    meta: AssemblyMeta;
}

// ---------------------------------------------------------------------------
// Pipeline Result (final output after drafting)
// ---------------------------------------------------------------------------

/** The orchestrator's final output after GPT drafting. */
export interface OrchestratorPipelineResult {
    /** The approved assembly (with overrides applied) */
    assembly: AssemblyResult;
    /** The GPT-drafted sections (separate from assembly) */
    draftedSections: DraftedSection[];
    /** Assembly metadata */
    meta: AssemblyMeta;
}

/** A single drafted section from GPT. */
export interface DraftedSection {
    sectionId: string;
    heading: string;
    body: string;
    numberedItems?: string[];
    /** Whether this section was drafted by GPT or preserved from lock */
    source: 'ai_drafted' | 'user_locked' | 'user_edited';
}

// ---------------------------------------------------------------------------
// Phase 1: Assembly (Deterministic)
// ---------------------------------------------------------------------------

/**
 * Run the assembly phase — deterministic keyword/heuristic engine.
 *
 * This produces the structured data for the Review Hub. No GPT calls.
 * The orchestrator pauses here and returns the result for human review.
 *
 * @param request      The export request from the modal
 * @param allNodes     All workspace nodes for this case
 * @param allEvents    All timeline events for this case
 * @param onStatus     Status callback for progress UI
 * @returns            Assembly result ready for the Review Hub
 */
export function runAssembly(
    request: ExportRequest,
    allNodes: WorkspaceNode[],
    allEvents: TimelineEventNode[],
    onStatus?: (status: PipelineStatus) => void,
): OrchestratorAssemblyResult {
    // Phase: Collecting sources
    onStatus?.({
        phase: 'collecting',
        progress: 5,
        detail: `Collecting ${allNodes.length} workspace nodes and ${allEvents.length} timeline events`,
    });

    // Phase: Classifying + Mapping (the assembly engine handles both)
    onStatus?.({
        phase: 'classifying',
        progress: 15,
        detail: 'Classifying content and detecting signals',
    });

    const assembly = assembleExportInput(allNodes, allEvents, request);

    onStatus?.({
        phase: 'mapping',
        progress: 40,
        detail: `Mapped ${assembly.classifiedNodes.length} nodes into sections`,
    });

    // Build review items from classified nodes
    const reviewItems = buildReviewItems(assembly.classifiedNodes, request.path);

    onStatus?.({
        phase: 'ready_for_review',
        progress: 50,
        detail: 'Assembly complete — ready for human review',
    });

    return {
        assembly,
        reviewItems,
        meta: assembly.meta,
    };
}

// ---------------------------------------------------------------------------
// Phase 2: Apply Overrides
// ---------------------------------------------------------------------------

/**
 * Apply user overrides to review items.
 *
 * This merges human edits (text changes, section moves, exclusions)
 * into the review items before passing to GPT drafting.
 *
 * @param reviewItems  The review items from assembly
 * @param overrides    The user's saved overrides
 * @returns            Updated review items with overrides applied
 */
export function applyOverrides(
    reviewItems: MappingReviewItem[],
    overrides: ExportOverrides,
): MappingReviewItem[] {
    const itemOverrideMap = new Map(
        overrides.itemOverrides.map(o => [o.nodeId, o]),
    );

    return reviewItems.map(item => {
        const override = itemOverrideMap.get(item.nodeId);
        if (!override) return item;

        return {
            ...item,
            includedInExport: override.excluded ? false : item.includedInExport,
            userOverride: {
                ...item.userOverride,
                ...(override.editedText !== undefined && { editedText: override.editedText }),
                ...(override.forcedSection !== undefined && { forceSection: override.forcedSection }),
                ...(override.excluded !== undefined && { exclude: override.excluded }),
            },
        };
    });
}

/**
 * Get the set of locked section IDs from overrides.
 *
 * @param overrides The user's saved overrides
 * @returns         Set of section IDs that are locked
 */
export function getLockedSections(overrides: ExportOverrides): Set<string> {
    return new Set(
        overrides.sectionOverrides
            .filter(s => s.isLocked)
            .map(s => s.sectionId),
    );
}

/**
 * Get the sections that should be sent to GPT for drafting.
 * Excludes locked sections since their content is preserved as-is.
 *
 * @param allSectionIds  All section IDs in the mapped output
 * @param overrides      The user's saved overrides
 * @returns              Section IDs that need GPT drafting
 */
export function getUnlockedSections(
    allSectionIds: string[],
    overrides: ExportOverrides,
): string[] {
    const locked = getLockedSections(overrides);
    return allSectionIds.filter(id => !locked.has(id));
}

// ---------------------------------------------------------------------------
// Review Item Builder
// ---------------------------------------------------------------------------

/**
 * Build MappingReviewItems from classified nodes.
 *
 * Each classified node becomes one review item showing:
 * - Original text
 * - Classification scores + dominant type
 * - Suggested sections for this export path
 * - Available text transforms (court-safe, summary-safe)
 * - Source provenance for traceability
 *
 * @param classifiedNodes  Node classifications from the assembly engine
 * @param exportPath       Which export path (for section suggestions)
 * @returns                Review items for the Review Hub
 */
function buildReviewItems(
    classifiedNodes: ClassifiedNode[],
    exportPath: ExportPath,
): MappingReviewItem[] {
    return classifiedNodes.map(node => ({
        nodeId: node.nodeId,
        originalText: node.rawText,
        dominantType: node.dominantType,
        confidence: node.confidence,
        suggestedSections: node.suggestedSections[exportPath],
        transformedCourtSafeText: node.transformedText.courtSafe,
        includedInExport: node.exportRelevance[exportPath] > 0.2,
        // No user override initially — Review Hub populates these
    }));
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
    ExportRequest,
    ExportPath,
    SummaryMappedSections,
    CourtMappedSections,
    ExhibitMappedSections,
    MappingReviewItem,
    ClassifiedNode,
    LegalNarrative,
    TimelineEventNode,
    WorkspaceNode,
};
