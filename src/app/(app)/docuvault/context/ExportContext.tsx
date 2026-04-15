'use client';

/**
 * Export Context — State Machine for the Review-Centered Assembly.
 *
 * Manages the full export lifecycle as a finite state machine:
 *
 *   IDLE → CONFIGURING → ASSEMBLING → REVIEWING → DRAFTING → COMPLETED
 *                                         ↓
 *                                   (auto-save 30s)
 *
 * Provides:
 * - Current phase + transition functions
 * - Assembly result (for Review Hub)
 * - Override state (section locks, item edits)
 * - Preflight results
 * - Auto-save to Convex for crash recovery
 */

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useReducer,
    useState,
    useEffect,
    useRef,
    type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useConvex } from 'convex/react';
import type { Id } from '@convex/_generated/dataModel';
import type { ExportRequest, ExportPath, MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type {
    OrchestratorAssemblyResult,
    ExportOverrides,
    SectionOverride,
    ItemOverride,
    PipelineStatus,
} from '@/lib/export-assembly/orchestrator';
import { runAssembly } from '@/lib/export-assembly/orchestrator';
import type { PreflightResult } from '@/lib/export-assembly/validation/preflightValidator';
import { getAssemblyInputs } from '@/lib/export-assembly/services/getAssemblyInputs';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Pipeline phases as a state machine. */
export type ExportPhase =
    | 'idle'
    | 'configuring'
    | 'assembling'
    | 'reviewing'
    | 'drafting'
    | 'completed'
    | 'error';

// ---------------------------------------------------------------------------
// Config + Validation Types
// ---------------------------------------------------------------------------

/** Configuration collected from CreateExportModal. */
export interface ExportConfig {
    path: ExportPath;
    caseId: Id<'cases'>;
    templateId?: string;
    includeTimeline?: boolean;
    includeExhibits?: boolean;
    narrativeDepth?: 'light' | 'standard' | 'full';
    jurisdictionProfileId?: string;
}

/** A single validation item from assembly integrity or preflight checks. */
export interface ValidationItem {
    id: string;
    label: string;
    detail: string;
}

/** Assembly validation result with 3-severity model. */
export interface AssemblyValidation {
    warnings: ValidationItem[];
    errors: ValidationItem[];
    critical: ValidationItem[];
}

/** Drafting sub-stages for the checklist UI. */
export type DraftingStage =
    | 'drafting'
    | 'preflight'
    | 'rendering_html'
    | 'rendering_pdf'
    | 'saving'
    | null;

/** The export context state. */
export interface ExportState {
    /** Current phase of the pipeline */
    phase: ExportPhase;
    /** Which export path is active */
    exportPath: ExportPath | null;
    /** The export request from the modal */
    exportRequest: ExportRequest | null;
    /** User-selected export config */
    config: ExportConfig | null;
    /** Assembly result (populated after ASSEMBLING phase) */
    assemblyResult: OrchestratorAssemblyResult | null;
    /** Assembly integrity validation (3-severity model) */
    assemblyValidation: AssemblyValidation | null;
    /** Review items for the Review Hub canvas */
    reviewItems: MappingReviewItem[];
    /** User overrides (locks, edits, reorders) */
    overrides: ExportOverrides;
    /** Preflight validation results */
    preflight: PreflightResult | null;
    /** Pipeline progress (0-100) */
    progress: number;
    /** Pipeline status detail */
    statusDetail: string;
    /** Error message if phase === 'error' */
    errorMessage: string | null;
    /** Error code for typed error UI */
    errorCode: string | null;
    /** Case ID for scoping overrides */
    caseId: Id<'cases'> | undefined;
    /** Convex export document ID (only source of truth for download) */
    exportId: string | null;
    /** Generated PDF filename */
    filename: string | null;
    /** Current sub-stage during drafting (for checklist UI) */
    draftingStage: DraftingStage;
    /** Export version number */
    version: number | null;
    /** Root export ID for version lineage */
    rootExportId: string | null;
    /** Parent export ID for version lineage */
    parentExportId: string | null;
    /** Last successfully completed pipeline stage */
    lastCompletedStage: 'draft' | 'preflight' | 'render' | 'upload' | 'finalize' | null;
}

const initialState: ExportState = {
    phase: 'idle',
    exportPath: null,
    exportRequest: null,
    config: null,
    assemblyResult: null,
    assemblyValidation: null,
    reviewItems: [],
    overrides: { sectionOverrides: [], itemOverrides: [] },
    preflight: null,
    progress: 0,
    statusDetail: '',
    errorMessage: null,
    errorCode: null,
    caseId: undefined,
    exportId: null,
    filename: null,
    draftingStage: null,
    version: null,
    rootExportId: null,
    parentExportId: null,
    lastCompletedStage: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ExportAction =
    | { type: 'START_CONFIGURE'; exportPath: ExportPath; caseId?: Id<'cases'> }
    | { type: 'SET_REQUEST'; request: ExportRequest }
    | { type: 'SET_CONFIG'; config: ExportConfig }
    | { type: 'START_ASSEMBLY' }
    | { type: 'ASSEMBLY_PROGRESS'; status: PipelineStatus }
    | { type: 'ASSEMBLY_COMPLETE'; result: OrchestratorAssemblyResult; validation?: AssemblyValidation }
    | { type: 'SET_REVIEW_ITEMS'; items: MappingReviewItem[] }
    | { type: 'SET_OVERRIDES'; overrides: ExportOverrides }
    | { type: 'UPDATE_SECTION_OVERRIDE'; override: SectionOverride }
    | { type: 'UPDATE_ITEM_OVERRIDE'; override: ItemOverride }
    | { type: 'SET_PREFLIGHT'; result: PreflightResult }
    | { type: 'SET_ASSEMBLY_VALIDATION'; validation: AssemblyValidation }
    | { type: 'SET_VERSION_LINEAGE'; version: number; rootExportId: string | null; parentExportId: string | null }
    | { type: 'SET_LAST_COMPLETED_STAGE'; stage: ExportState['lastCompletedStage'] }
    | { type: 'START_DRAFTING' }
    | { type: 'DRAFT_PROGRESS'; status: PipelineStatus; stage?: DraftingStage }
    | { type: 'COMPLETE'; exportId: string; filename: string }
    | { type: 'ERROR'; message: string; errorCode?: string }
    | { type: 'RESET' };

function exportReducer(state: ExportState, action: ExportAction): ExportState {
    switch (action.type) {
        case 'START_CONFIGURE':
            return {
                ...initialState,
                phase: 'configuring',
                exportPath: action.exportPath,
                caseId: action.caseId,
            };

        case 'SET_REQUEST':
            return { ...state, exportRequest: action.request };

        case 'SET_CONFIG':
            return { ...state, config: action.config };

        case 'START_ASSEMBLY':
            return { ...state, phase: 'assembling', progress: 0, statusDetail: 'Starting assembly...' };

        case 'ASSEMBLY_PROGRESS':
            return {
                ...state,
                progress: action.status.progress,
                statusDetail: action.status.detail,
            };

        case 'ASSEMBLY_COMPLETE':
            return {
                ...state,
                phase: 'reviewing',
                assemblyResult: action.result,
                assemblyValidation: action.validation ?? null,
                reviewItems: action.result.reviewItems,
                progress: 50,
                statusDetail: 'Ready for review',
            };

        case 'SET_REVIEW_ITEMS':
            return { ...state, reviewItems: action.items };

        case 'SET_OVERRIDES':
            return { ...state, overrides: action.overrides };

        case 'UPDATE_SECTION_OVERRIDE': {
            const existing = state.overrides.sectionOverrides;
            const idx = existing.findIndex(s => s.sectionId === action.override.sectionId);
            // Merge with existing override to preserve fields from prior edits
            const merged = idx >= 0
                ? { ...existing[idx], ...action.override }
                : action.override;
            const updated = idx >= 0
                ? existing.map((s, i) => i === idx ? merged : s)
                : [...existing, merged];
            return {
                ...state,
                overrides: { ...state.overrides, sectionOverrides: updated },
            };
        }

        case 'UPDATE_ITEM_OVERRIDE': {
            const existing = state.overrides.itemOverrides;
            const idx = existing.findIndex(i => i.nodeId === action.override.nodeId);
            // Merge with existing override to preserve fields from prior edits
            const merged = idx >= 0
                ? { ...existing[idx], ...action.override }
                : action.override;
            const updated = idx >= 0
                ? existing.map((item, i) => i === idx ? merged : item)
                : [...existing, merged];
            return {
                ...state,
                overrides: { ...state.overrides, itemOverrides: updated },
            };
        }

        case 'SET_PREFLIGHT':
            return { ...state, preflight: action.result };

        case 'SET_ASSEMBLY_VALIDATION':
            return { ...state, assemblyValidation: action.validation };

        case 'SET_VERSION_LINEAGE':
            return {
                ...state,
                version: action.version,
                rootExportId: action.rootExportId,
                parentExportId: action.parentExportId,
            };

        case 'SET_LAST_COMPLETED_STAGE':
            return { ...state, lastCompletedStage: action.stage };

        case 'START_DRAFTING':
            return {
                ...state,
                phase: 'drafting',
                progress: 55,
                statusDetail: 'Drafting document...',
                draftingStage: 'drafting',
            };

        case 'DRAFT_PROGRESS':
            return {
                ...state,
                progress: action.status.progress,
                statusDetail: action.status.detail,
                draftingStage: action.stage ?? state.draftingStage,
            };

        case 'COMPLETE':
            return {
                ...state,
                phase: 'completed',
                progress: 100,
                statusDetail: 'Document ready',
                exportId: action.exportId,
                filename: action.filename,
                draftingStage: null,
            };

        case 'ERROR':
            return {
                ...state,
                phase: 'error',
                errorMessage: action.message,
                errorCode: action.errorCode ?? null,
                draftingStage: null,
            };

        case 'RESET':
            return initialState;

        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ExportContextValue {
    state: ExportState;
    dispatch: React.Dispatch<ExportAction>;
    /** True when overrides/reviewItems have changed since last save */
    isDirty: boolean;
    /** Call after persisting to Convex to reset dirty flag */
    markSaved: () => void;

    // Convenience actions
    startConfigure: (path: ExportPath, caseId?: Id<'cases'>) => void;
    setRequest: (request: ExportRequest) => void;
    startAssembly: () => void;
    completeAssembly: (result: OrchestratorAssemblyResult, validation?: AssemblyValidation) => void;
    lockSection: (sectionId: string, locked: boolean) => void;
    editItem: (nodeId: string, editedText: string) => void;
    moveItem: (nodeId: string, toSection: string) => void;
    excludeItem: (nodeId: string, excluded: boolean) => void;
    setPreflight: (result: PreflightResult) => void;
    startDrafting: () => void;
    complete: (exportId: string, filename: string) => void;
    setError: (message: string, errorCode?: string) => void;
    reset: () => void;
    /** Single orchestration entry for structured export. */
    startStructuredExport: (config: ExportConfig) => Promise<void>;
}

const ExportContext = createContext<ExportContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Auto-save interval in milliseconds (30 seconds). */
const AUTO_SAVE_INTERVAL_MS = 30_000;

export function ExportProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(exportReducer, initialState);
    const [isDirty, setIsDirty] = useState(false);
    const lastCheckedSnapshotRef = useRef<string>('');

    /** Call after persisting to Convex to reset dirty flag */
    const markSaved = useCallback(() => {
        setIsDirty(false);
    }, []);

    // ── Auto-save dirty detection during review phase ──
    useEffect(() => {
        if (state.phase !== 'reviewing') return;

        const interval = setInterval(() => {
            // Compare full overrides + reviewItems content (not just length)
            const snapshot = JSON.stringify({
                overrides: state.overrides,
                reviewItems: state.reviewItems,
            });

            if (snapshot !== lastCheckedSnapshotRef.current) {
                lastCheckedSnapshotRef.current = snapshot;
                setIsDirty(true);
            }
        }, AUTO_SAVE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [state.phase, state.overrides, state.reviewItems]);

    // ── Convenience actions ──
    const startConfigure = useCallback((path: ExportPath, caseId?: Id<'cases'>) => {
        dispatch({ type: 'START_CONFIGURE', exportPath: path, caseId });
    }, []);

    const setRequest = useCallback((request: ExportRequest) => {
        dispatch({ type: 'SET_REQUEST', request });
    }, []);

    const startAssembly = useCallback(() => {
        dispatch({ type: 'START_ASSEMBLY' });
    }, []);

    const completeAssembly = useCallback((result: OrchestratorAssemblyResult, validation?: AssemblyValidation) => {
        dispatch({ type: 'ASSEMBLY_COMPLETE', result, validation });
    }, []);

    const lockSection = useCallback((sectionId: string, locked: boolean) => {
        dispatch({
            type: 'UPDATE_SECTION_OVERRIDE',
            override: { sectionId, isLocked: locked },
        });
    }, []);

    const editItem = useCallback((nodeId: string, editedText: string) => {
        dispatch({
            type: 'UPDATE_ITEM_OVERRIDE',
            override: { nodeId, editedText },
        });
    }, []);

    const moveItem = useCallback((nodeId: string, toSection: string) => {
        dispatch({
            type: 'UPDATE_ITEM_OVERRIDE',
            override: { nodeId, forcedSection: toSection },
        });
    }, []);

    const excludeItem = useCallback((nodeId: string, excluded: boolean) => {
        dispatch({
            type: 'UPDATE_ITEM_OVERRIDE',
            override: { nodeId, excluded },
        });
    }, []);

    const setPreflight = useCallback((result: PreflightResult) => {
        dispatch({ type: 'SET_PREFLIGHT', result });
    }, []);

    const startDrafting = useCallback(() => {
        dispatch({ type: 'START_DRAFTING' });
    }, []);

    const complete = useCallback((exportId: string, filename: string) => {
        dispatch({ type: 'COMPLETE', exportId, filename });
    }, []);

    const setError = useCallback((message: string, errorCode?: string) => {
        dispatch({ type: 'ERROR', message, errorCode });
    }, []);

    const reset = useCallback(() => {
        dispatch({ type: 'RESET' });
    }, []);

    // ── Structured export orchestration ──
    const convex = useConvex();
    const router = useRouter();

    const startStructuredExport = useCallback(async (config: ExportConfig) => {
        try {
            // 1. Initialize
            dispatch({ type: 'START_CONFIGURE', exportPath: config.path, caseId: config.caseId });
            dispatch({ type: 'SET_CONFIG', config });
            dispatch({ type: 'START_ASSEMBLY' });

            // 2. Fetch canonical assembly inputs
            const inputs = await getAssemblyInputs(convex, config.caseId);

            // 3. Build ExportRequest from config
            const exportRequest: ExportRequest = {
                path: config.path,
                structureSource: config.path === 'court_document'
                    ? 'court_prompt_profile'
                    : config.path === 'exhibit_document'
                        ? 'exhibit_prompt_profile'
                        : 'summary_default',
                templateId: config.templateId,
                selectedNodeIds: [],   // use all — assembly filters internally
                selectedEvidenceIds: [],
                selectedTimelineIds: [],
                config: config.path === 'court_document'
                    ? {
                        documentType: 'motion' as const,
                        tone: 'neutral' as const,
                        includeCaption: true,
                        includeLegalStandard: true,
                        includePrayer: true,
                        includeCertificateOfService: true,
                        includeProposedOrder: false,
                        outputFormat: 'pdf' as const,
                    }
                    : config.path === 'exhibit_document'
                        ? {
                            exhibitMode: 'court_structured' as const,
                            packetType: 'packet_with_index' as const,
                            organization: 'chronological' as const,
                            labelStyle: 'alpha' as const,
                            includeCoverSheets: true,
                            includeSummaries: true,
                            includeBatesNumbers: false,
                            includeSourceMetadata: true,
                            includeDividerPages: false,
                            includeConfidentialNotes: false,
                            mergedOutput: true,
                            outputFormat: 'pdf' as const,
                        }
                        : {
                            audience: 'internal' as const,
                            detailLevel: config.narrativeDepth === 'full' ? 'detailed' as const : config.narrativeDepth === 'light' ? 'concise' as const : 'standard' as const,
                            organization: 'chronological' as const,
                            includeTimeline: config.includeTimeline ?? true,
                            includeEvidenceAppendix: config.includeExhibits ?? false,
                            includeRecommendations: true,
                            outputFormat: 'pdf' as const,
                        },
            };
            dispatch({ type: 'SET_REQUEST', request: exportRequest });

            // 4. Run assembly (synchronous — deterministic engine)
            const result = runAssembly(
                exportRequest,
                inputs.workspaceNodes,
                inputs.timelineEvents,
                (status) => dispatch({ type: 'ASSEMBLY_PROGRESS', status }),
            );

            // 5. Validate assembly (placeholder — Step 5 builds real validator)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const validation: AssemblyValidation = { warnings: [], errors: [], critical: [] };

            // 6. Atomic completion
            dispatch({ type: 'ASSEMBLY_COMPLETE', result, validation });

            // 7. Navigate to review
            router.push('/docuvault/review');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Assembly failed. Please try again.';
            dispatch({ type: 'ERROR', message });
        }
    }, [convex, router]);

    const value = useMemo<ExportContextValue>(() => ({
        state,
        dispatch,
        isDirty,
        markSaved,
        startConfigure,
        setRequest,
        startAssembly,
        completeAssembly,
        lockSection,
        editItem,
        moveItem,
        excludeItem,
        setPreflight,
        startDrafting,
        complete,
        setError,
        reset,
        startStructuredExport,
    }), [
        state,
        isDirty,
        markSaved,
        startConfigure,
        setRequest,
        startAssembly,
        completeAssembly,
        lockSection,
        editItem,
        moveItem,
        excludeItem,
        setPreflight,
        startDrafting,
        complete,
        setError,
        reset,
        startStructuredExport,
    ]);

    return (
        <ExportContext.Provider value={value}>
            {children}
        </ExportContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Access the export context. Must be used within ExportProvider. */
export function useExport(): ExportContextValue {
    const ctx = useContext(ExportContext);
    if (!ctx) {
        throw new Error('useExport must be used within an ExportProvider');
    }
    return ctx;
}
