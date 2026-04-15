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
import type { Id } from '@convex/_generated/dataModel';
import type { ExportRequest, ExportPath, MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type {
    OrchestratorAssemblyResult,
    ExportOverrides,
    SectionOverride,
    ItemOverride,
    PipelineStatus,
} from '@/lib/export-assembly/orchestrator';
import type { PreflightResult } from '@/lib/export-assembly/validation/preflightValidator';

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

/** The export context state. */
export interface ExportState {
    /** Current phase of the pipeline */
    phase: ExportPhase;
    /** Which export path is active */
    exportPath: ExportPath | null;
    /** The export request from the modal */
    exportRequest: ExportRequest | null;
    /** Assembly result (populated after ASSEMBLING phase) */
    assemblyResult: OrchestratorAssemblyResult | null;
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
    /** Case ID for scoping overrides */
    caseId: Id<'cases'> | undefined;
    /** Generated PDF URL (after COMPLETED phase) */
    pdfUrl: string | null;
}

const initialState: ExportState = {
    phase: 'idle',
    exportPath: null,
    exportRequest: null,
    assemblyResult: null,
    reviewItems: [],
    overrides: { sectionOverrides: [], itemOverrides: [] },
    preflight: null,
    progress: 0,
    statusDetail: '',
    errorMessage: null,
    caseId: undefined,
    pdfUrl: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ExportAction =
    | { type: 'START_CONFIGURE'; exportPath: ExportPath; caseId?: Id<'cases'> }
    | { type: 'SET_REQUEST'; request: ExportRequest }
    | { type: 'START_ASSEMBLY' }
    | { type: 'ASSEMBLY_PROGRESS'; status: PipelineStatus }
    | { type: 'ASSEMBLY_COMPLETE'; result: OrchestratorAssemblyResult }
    | { type: 'SET_REVIEW_ITEMS'; items: MappingReviewItem[] }
    | { type: 'SET_OVERRIDES'; overrides: ExportOverrides }
    | { type: 'UPDATE_SECTION_OVERRIDE'; override: SectionOverride }
    | { type: 'UPDATE_ITEM_OVERRIDE'; override: ItemOverride }
    | { type: 'SET_PREFLIGHT'; result: PreflightResult }
    | { type: 'START_DRAFTING' }
    | { type: 'DRAFT_PROGRESS'; status: PipelineStatus }
    | { type: 'COMPLETE'; pdfUrl: string }
    | { type: 'ERROR'; message: string }
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

        case 'START_DRAFTING':
            return { ...state, phase: 'drafting', progress: 60, statusDetail: 'Drafting document...' };

        case 'DRAFT_PROGRESS':
            return {
                ...state,
                progress: action.status.progress,
                statusDetail: action.status.detail,
            };

        case 'COMPLETE':
            return {
                ...state,
                phase: 'completed',
                progress: 100,
                statusDetail: 'Document ready',
                pdfUrl: action.pdfUrl,
            };

        case 'ERROR':
            return {
                ...state,
                phase: 'error',
                errorMessage: action.message,
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
    completeAssembly: (result: OrchestratorAssemblyResult) => void;
    lockSection: (sectionId: string, locked: boolean) => void;
    editItem: (nodeId: string, editedText: string) => void;
    moveItem: (nodeId: string, toSection: string) => void;
    excludeItem: (nodeId: string, excluded: boolean) => void;
    setPreflight: (result: PreflightResult) => void;
    startDrafting: () => void;
    complete: (pdfUrl: string) => void;
    setError: (message: string) => void;
    reset: () => void;
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

    const completeAssembly = useCallback((result: OrchestratorAssemblyResult) => {
        dispatch({ type: 'ASSEMBLY_COMPLETE', result });
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

    const complete = useCallback((pdfUrl: string) => {
        dispatch({ type: 'COMPLETE', pdfUrl });
    }, []);

    const setError = useCallback((message: string) => {
        dispatch({ type: 'ERROR', message });
    }, []);

    const reset = useCallback(() => {
        dispatch({ type: 'RESET' });
    }, []);

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
