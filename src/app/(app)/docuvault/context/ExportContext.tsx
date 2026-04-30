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
import { splitPastedContentAction } from '../actions/splitPastedContentAction';
import { validateAssemblyOutput } from '@/lib/export-assembly/validation/assemblyIntegrityValidator';

// ---------------------------------------------------------------------------
// Fast-Path Caption Parser
// ---------------------------------------------------------------------------

/**
 * Extract court caption metadata from raw pasted document text.
 * Regex-based — no LLM needed. Covers common Texas family court formats.
 */
function parseCaptionFromText(text: string): {
    courtName?: string;
    county?: string;
    state?: string;
    causeNumber?: string;
    caseStyle?: string;
    partyRoles?: string[];
} {
    const lines = text.slice(0, 2000); // Only scan first ~2000 chars for caption

    // Cause number: "CAUSE NO. 20-DCV-271717" or "Cause No.: 2022-12345"
    const causeMatch = lines.match(/CAUSE\s+NO\.?\s*:?\s*([\w\d\-]+)/i);

    // Court: "387TH JUDICIAL DISTRICT" or "IN THE DISTRICT COURT"
    const courtMatch = lines.match(/(\d+\w*)\s+JUDICIAL\s+DISTRICT/i)
        ?? lines.match(/IN\s+THE\s+([\w\s]+COURT)/i);

    // County: "FORT BEND COUNTY, TEXAS" or "HARRIS COUNTY, TEXAS"
    const countyMatch = lines.match(/([\w ]+)\s+COUNTY,\s+(TEXAS|TX|CALIFORNIA|CA|FLORIDA|FL|NEW YORK|NY|[\w ]+)/i);

    // Petitioner/Respondent: "COMES NOW Monica Fernandez, Petitioner"
    const petitionerMatch = lines.match(/COMES\s+NOW\s+([\w\s]+),\s*(?:Petitioner|Movant)/i);

    // Case style: "IN THE INTEREST OF ... A CHILD"
    const caseStyleMatch = lines.match(/IN\s+THE\s+INTEREST\s+OF[§\s]*([^§\n]+)/i);

    const courtName = courtMatch
        ? (courtMatch[1]?.match(/\d+/) ? `${courtMatch[1]} Judicial District` : courtMatch[1]?.trim())
        : undefined;

    return {
        causeNumber: causeMatch?.[1],
        courtName,
        county: countyMatch?.[1]?.trim(),
        state: countyMatch?.[2]?.trim(),
        caseStyle: caseStyleMatch?.[1]?.trim(),
        partyRoles: petitionerMatch ? [`Petitioner: ${petitionerMatch[1].trim()}`] : undefined,
    };
}

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
    /** User-pasted document text from the DocuVault compose area. */
    pastedContent?: string;
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

/** Reducer managing the full export lifecycle state machine. */
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
    /** Start the configuration phase for a given export path. */
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

    /**
     * End-to-end structured export orchestrator.
     * Flow: Configure → Fetch Inputs → Build Request → Run Assembly → Validate → Navigate to Review.
     */
    const startStructuredExport = useCallback(async (config: ExportConfig) => {
        try {
            // 1. Initialize
            dispatch({ type: 'START_CONFIGURE', exportPath: config.path, caseId: config.caseId });
            dispatch({ type: 'SET_CONFIG', config });
            dispatch({ type: 'START_ASSEMBLY' });

            // 2. Fetch canonical assembly inputs
            const inputs = await getAssemblyInputs(convex, config.caseId);

            // ── FAST PATH: Pre-drafted pasted content ──
            // When user pastes a complete document and no workspace data exists,
            // skip the classifier/assembly engine entirely. The content is already
            // drafted — just format and export.
            const hasPastedContent = Boolean(config.pastedContent?.trim());
            const hasWorkspaceData = inputs.workspaceNodes.length > 0;
            const isFastPath = config.path === 'court_document'
                && hasPastedContent
                && !hasWorkspaceData;

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

            let result: import('@/lib/export-assembly/orchestrator').OrchestratorAssemblyResult;

            if (isFastPath) {
                // ── FAST PATH: Build synthetic assembly result from pasted text ──
                // Uses splitPastedContent() to produce structured review items
                const pastedText = config.pastedContent!.trim();
                const nodeId = `pasted_${Date.now()}`;

                // Parse caption data from the text using regex
                const captionData = parseCaptionFromText(pastedText);

                // Wire parsed caption into export config so the renderer receives it
                if (config.path === 'court_document') {
                    const courtConfig = exportRequest.config as unknown as Record<string, unknown>;
                    if (captionData.courtName) courtConfig.courtName = captionData.courtName;
                    if (captionData.state) courtConfig.courtState = captionData.state;
                    if (captionData.county) courtConfig.courtCounty = captionData.county;
                    if (captionData.causeNumber) courtConfig.causeNumber = captionData.causeNumber;
                    const petitionerRole = captionData.partyRoles?.find(r => r.startsWith('Petitioner:'));
                    if (petitionerRole) courtConfig.petitionerName = petitionerRole.replace('Petitioner: ', '');
                }

                dispatch({
                    type: 'ASSEMBLY_PROGRESS',
                    status: { phase: 'collecting', progress: 10, detail: 'Parsing document structure…' },
                });

                // Split pasted content into structured review items
                const splitResult = await splitPastedContentAction(pastedText);

                dispatch({
                    type: 'ASSEMBLY_PROGRESS',
                    status: {
                        phase: 'classifying',
                        progress: 30,
                        detail: `Found ${splitResult.meta.totalItems} sections (${splitResult.strategy})`,
                    },
                });

                // Build mapped sections for the assembly shell
                const mappedSections = config.path === 'court_document'
                    ? {
                        generatedAt: new Date().toISOString(),
                        captionData,
                        title: captionData.caseStyle ?? 'Court Document',
                        factualBackground: [{ heading: 'Document Content', body: pastedText, startDate: '', sources: [] }],
                        legalGrounds: [],
                        argumentSections: [],
                        requestedRelief: [],
                        exhibitReferences: [],
                        procedureNotes: [],
                        supportingNodeIds: [nodeId],
                    }
                    : config.path === 'case_summary'
                        ? {
                            generatedAt: new Date().toISOString(),
                            keyIssues: [],
                            incidents: [],
                            timelineSummary: [{ heading: 'Document Content', body: pastedText, startDate: '', sources: [] }],
                            evidenceOverview: [],
                            patternSummary: [],
                            gapsOrOpenQuestions: [],
                            recommendedNextSteps: [],
                            supportingNodeIds: [nodeId],
                        }
                        : {
                            generatedAt: new Date().toISOString(),
                            indexEntries: [],
                            groupedExhibits: [],
                            coverSheetSummaries: [],
                            supportingNodeIds: [nodeId],
                        };

                const itemCount = splitResult.items.length || 1;

                result = {
                    assembly: {
                        path: config.path,
                        classifiedNodes: [{
                            nodeId,
                            nodeType: 'user_pasted_content' as const,
                            rawText: pastedText,
                            cleanedText: pastedText,
                            sentenceClassifications: [],
                            scores: { fact: 1, argument: 0, request: 0, emotion: 0, opinion: 0, procedure: 0, evidence_reference: 0, timeline_event: 0, issue: 0, risk: 0, unknown: 0 },
                            dominantType: 'fact' as const,
                            confidence: 1.0,
                            tags: ['pre_drafted', `split_${splitResult.strategy}`],
                            issueTags: [],
                            patternTags: [],
                            extractedEntities: { people: [], dates: [], locations: [], courts: [], filings: [], exhibits: [], statutesOrRules: [] },
                            suggestedSections: {
                                case_summary: ['document_content'],
                                court_document: ['document_content'],
                                exhibit_document: ['document_content'],
                            },
                            exportRelevance: { case_summary: 1, court_document: 1, exhibit_document: 1 },
                            transformedText: { courtSafe: pastedText, summarySafe: pastedText },
                            provenance: {
                                linkedEvidenceIds: [],
                                linkedTimelineIds: [],
                                originatingNodeId: nodeId,
                            },
                        }],
                        narrative: {
                            chronology: [],
                            turningPoints: [],
                            patternSections: [],
                            reliefConnections: [],
                            issueSummaries: [],
                        },
                        mappedSections: mappedSections as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        meta: {
                            totalNodes: 1,
                            selectedNodes: 1,
                            classifiedNodes: 1,
                            narrativeSections: itemCount,
                            detectedPatterns: 0,
                            reliefConnections: 0,
                            assemblyTimeMs: 0,
                        },
                    },
                    reviewItems: splitResult.items,
                    meta: {
                        totalNodes: 1,
                        selectedNodes: 1,
                        classifiedNodes: 1,
                        narrativeSections: itemCount,
                        detectedPatterns: 0,
                        reliefConnections: 0,
                        assemblyTimeMs: 0,
                    },
                };

                dispatch({
                    type: 'ASSEMBLY_PROGRESS',
                    status: { phase: 'ready_for_review', progress: 50, detail: 'Document ready for review' },
                });
            } else {
                // ── FULL PATH: Run normal assembly pipeline ──
                // Inject pasted content as supplementary node if available
                if (hasPastedContent) {
                    inputs.workspaceNodes.unshift({
                        id: `pasted_${Date.now()}`,
                        type: 'user_pasted_content',
                        text: config.pastedContent!.trim(),
                        title: 'User-Provided Document Content',
                        createdAt: Date.now(),
                    });
                }

                // 4. Run assembly (synchronous — deterministic engine)
                result = runAssembly(
                    exportRequest,
                    inputs.workspaceNodes,
                    inputs.timelineEvents,
                    (status) => dispatch({ type: 'ASSEMBLY_PROGRESS', status }),
                );
            }

            // 5. Validate assembly
            const validation = validateAssemblyOutput(result, config);

            // 6. Atomic completion
            dispatch({ type: 'ASSEMBLY_COMPLETE', result, validation });

            // 7. Navigate to review
            router.push('/docuvault/review');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Assembly failed. Please try again.';
            const errorCode = err instanceof Error && 'code' in err ? String((err as Error & { code: string }).code) : undefined;
            dispatch({ type: 'ERROR', message, errorCode });
            throw err instanceof Error ? err : new Error(message);
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
