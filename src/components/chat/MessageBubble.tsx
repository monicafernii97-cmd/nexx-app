'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ArrowsClockwise, PencilSimple, X, PaperPlaneRight, CaretDown, Scales, Sword, FileText, CalendarBlank, ListBullets, Quotes, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NexxArtifacts, JudgeSimulationResult, OppositionSimulationResult } from '@/lib/types';
import { PlayAloudButton } from '@/components/voice';
import { AssistantMessageCard } from './AssistantMessageCard';
import type { AssistantResponseViewModel, ActionType, DetectedPattern, LocalProcedureInfo } from '@/lib/ui-intelligence/types';
import { ANALYSIS_STATUS_UI_KIND, SAFE_ANALYSIS_DRAFT_MESSAGE } from '@/lib/chat/analysisStatus';
import { looksLikeInternalStructuredPayload, sanitizeVisibleAssistantContent } from '@/lib/chat/internalLeakGuard';

export type ChatTheme = 'dark' | 'light';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    theme?: ChatTheme;
    metadata?: unknown;
    /** Serialized JSON string of NexxArtifacts, attached to assistant messages. */
    artifactsJson?: string;
    /** Called when user clicks Retry on an assistant message. */
    onRetry?: () => void;
    /** Called when user saves an edited message — passes new content. */
    onEdit?: (newContent: string) => void;
    /** Structured response view model for adaptive panel rendering. */
    structuredViewModel?: AssistantResponseViewModel;
    /** Detected patterns for intelligence chips. */
    detectedPatterns?: DetectedPattern[];
    /** Local procedure badge info. */
    procedureInfo?: LocalProcedureInfo;
    /** Handler for contextual actions from AssistantMessageCard. */
    onAction?: (action: ActionType, content?: string) => void;
    /** Send a suggested follow-up prompt back into the chat. */
    onSuggestedPrompt?: (prompt: string) => void;
}

type DocumentSourceMetadata = {
    uploadedFileId: string;
    filename: string;
    source: 'current_turn' | 'conversation_memory' | 'case_memory' | 'user_private_memory' | 'shared_memory';
    status?: string;
    extractionMethod?: string;
    contextCharCount?: number;
    contextTruncated?: boolean;
};

type DocumentCitationMetadata = {
    id: string;
    uploadedFileId: string;
    filename: string;
    pageStart?: number;
    pageEnd?: number;
    pageLabel?: string;
    citationLabel?: string;
    quotePreview: string;
    citationVerifierStatus: 'verified' | 'partial' | 'failed';
};

// ── Shared action button (declared OUTSIDE render to satisfy react-hooks/static-components) ──

interface ActionButtonProps {
    onClick: () => void;
    label: string;
    isLight: boolean;
    children: React.ReactNode;
}

/** Small icon-only action button used in message toolbars (copy, retry, edit). */
function ActionButton({ onClick, label, isLight, children }: ActionButtonProps) {
    return (
        <button
            className={`${isLight
                ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                : 'text-white/40 hover:text-white/80 hover:bg-white/10'
                } transition-colors flex items-center gap-1.5 p-1.5 rounded-md`}
            onClick={onClick}
            aria-label={label}
        >
            {children}
        </button>
    );
}

// ── Artifact Validation ──

function getDocumentSources(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
    const rawSources = (metadata as Record<string, unknown>).documentSources;
    if (!Array.isArray(rawSources)) return [];

    return rawSources.flatMap((source): DocumentSourceMetadata[] => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
        const record = source as Record<string, unknown>;
        if (typeof record.uploadedFileId !== 'string' || typeof record.filename !== 'string') return [];
        const sourceScope = typeof record.source === 'string' ? record.source : 'current_turn';
        if (!['current_turn', 'conversation_memory', 'case_memory', 'user_private_memory', 'shared_memory'].includes(sourceScope)) {
            return [];
        }

        return [{
            uploadedFileId: record.uploadedFileId,
            filename: record.filename,
            source: sourceScope as DocumentSourceMetadata['source'],
            status: typeof record.status === 'string' ? record.status : undefined,
            extractionMethod: typeof record.extractionMethod === 'string' ? record.extractionMethod : undefined,
            contextCharCount: typeof record.contextCharCount === 'number' ? record.contextCharCount : undefined,
            contextTruncated: typeof record.contextTruncated === 'boolean' ? record.contextTruncated : undefined,
        }];
    }).slice(0, 4);
}

function getDocumentCitations(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
    const rawCitations = (metadata as Record<string, unknown>).documentCitations;
    if (!Array.isArray(rawCitations)) return [];

    return rawCitations.flatMap((citation): DocumentCitationMetadata[] => {
        if (!citation || typeof citation !== 'object' || Array.isArray(citation)) return [];
        const record = citation as Record<string, unknown>;
        const id = typeof record.id === 'string'
            ? record.id
            : typeof record.chatAnswerSourceId === 'string'
                ? record.chatAnswerSourceId
                : undefined;
        const quotePreview = typeof record.quotePreview === 'string'
            ? record.quotePreview
            : typeof record.quotedText === 'string'
                ? record.quotedText.replace(/\s+/g, ' ').trim().slice(0, 280)
                : undefined;
        if (
            typeof id !== 'string' ||
            typeof record.uploadedFileId !== 'string' ||
            typeof record.filename !== 'string' ||
            typeof quotePreview !== 'string'
        ) {
            return [];
        }
        const rawStatus = typeof record.citationVerifierStatus === 'string'
            ? record.citationVerifierStatus
            : undefined;
        const status: DocumentCitationMetadata['citationVerifierStatus'] =
            rawStatus === 'verified' || rawStatus === 'partial' || rawStatus === 'failed'
                ? rawStatus
                : 'failed';

        return [{
            id,
            uploadedFileId: record.uploadedFileId,
            filename: record.filename,
            pageStart: typeof record.pageStart === 'number' ? record.pageStart : undefined,
            pageEnd: typeof record.pageEnd === 'number' ? record.pageEnd : undefined,
            pageLabel: typeof record.pageLabel === 'string' ? record.pageLabel : undefined,
            citationLabel: typeof record.citationLabel === 'string' ? record.citationLabel : undefined,
            quotePreview,
            citationVerifierStatus: status as DocumentCitationMetadata['citationVerifierStatus'],
        }];
    }).slice(0, 12);
}

function getMetadataString(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
}

function getSourceLabel(source: DocumentSourceMetadata['source']) {
    if (source === 'case_memory') return 'Case document';
    if (source === 'user_private_memory') return 'Saved document';
    if (source === 'shared_memory') return 'Shared document';
    if (source === 'conversation_memory') return 'Saved in this chat';
    return 'Uploaded document';
}

function citationBadge(status: DocumentCitationMetadata['citationVerifierStatus']) {
    if (status === 'failed') return 'Needs review';
    if (status === 'partial') return 'Check wording';
    return 'Source';
}

function DocumentEvidencePanel({
    sources,
    citations,
    isLight,
}: {
    sources: DocumentSourceMetadata[];
    citations: DocumentCitationMetadata[];
    isLight: boolean;
}) {
    const [openCitationId, setOpenCitationId] = useState<string | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [copiedCitationId, setCopiedCitationId] = useState<string | null>(null);
    const sourceNames = Array.from(new Set(sources.map((source) => source.filename).filter(Boolean)));
    const citedSourceNames = Array.from(new Set(citations.map((citation) => citation.filename).filter(Boolean)));
    const displaySourceNames = citedSourceNames.length > 0 ? citedSourceNames : sourceNames;
    const visibleSources = citations.length > 0
        ? sources.filter((source) => citedSourceNames.includes(source.filename))
        : sources;
    const hasPartialExtraction = visibleSources.some((source) => source.status === 'partial' || source.status === 'failed');
    const hasFocusedPassages = !hasPartialExtraction && visibleSources.some((source) => source.contextTruncated);
    const citationCountLabel = citations.length > 0
        ? `${citations.length} citation${citations.length === 1 ? '' : 's'}`
        : null;
    const sourceSummaryBase = displaySourceNames.length === 0
        ? 'Uploaded document'
        : displaySourceNames.length === 1
            ? displaySourceNames[0]
            : `${displaySourceNames.length} documents`;
    const sourceSummary = citationCountLabel
        ? `${sourceSummaryBase} · ${citationCountLabel}`
        : sourceSummaryBase;

    if (sources.length === 0 && citations.length === 0) return null;

    const handleCopyQuote = async (citation: DocumentCitationMetadata) => {
        if (!window.isSecureContext || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(citation.quotePreview);
            setCopiedCitationId(citation.id);
            window.setTimeout(() => setCopiedCitationId((current) => current === citation.id ? null : current), 1800);
        } catch (err) {
            console.error('Failed to copy quote:', err);
        }
    };

    return (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${isLight
            ? 'border-blue-100 bg-blue-50/70 text-blue-950'
            : 'border-sky-300/15 bg-sky-300/10 text-sky-50'
            }`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                <span className={isLight ? 'text-blue-700' : 'text-sky-200'}>Sources</span>
                {citations.length > 0 && (
                    <span className={isLight ? 'text-blue-500' : 'text-sky-200/70'}>
                        {citations.length} cited passage{citations.length === 1 ? '' : 's'}
                    </span>
                )}
                {hasPartialExtraction && (
                    <span className={isLight ? 'text-amber-600' : 'text-amber-200'}>
                        Extracted text may be incomplete
                    </span>
                )}
                {hasFocusedPassages && (
                    <span className={isLight ? 'text-blue-500' : 'text-sky-200/70'}>
                        Showing selected passages
                    </span>
                )}
            </div>
            <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${isLight ? 'text-blue-950' : 'text-white'}`}>
                <FileText size={13} weight="regular" className="shrink-0" />
                <span className="min-w-0 max-w-full truncate font-semibold">{sourceSummary}</span>
                {(citations.length > 0 || sources.length > 0) && (
                    <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        className={`rounded px-2 py-1 text-[11px] font-bold transition-colors ${isLight ? 'bg-white text-blue-700 hover:bg-blue-100' : 'bg-white/10 text-sky-100 hover:bg-white/15'}`}
                        aria-expanded={detailsOpen}
                    >
                        {detailsOpen ? 'Hide details' : 'View source details'}
                    </button>
                )}
            </div>
            {detailsOpen && citations.length > 0 && (
                <div className="mt-2 space-y-2">
                    {citations.map((citation) => {
                        const citationId = citation.id;
                        const isOpen = openCitationId === citationId;
                        const status = citationBadge(citation.citationVerifierStatus);
                        const locationLabel = citation.pageLabel || citation.citationLabel || 'Page metadata unavailable';
                        return (
                            <div
                                key={citationId}
                                className={`rounded-md border ${isLight ? 'border-blue-200 bg-white' : 'border-white/10 bg-white/10'}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpenCitationId(isOpen ? null : citationId)}
                                    className={`flex w-full items-start gap-2 px-2.5 py-2 text-left text-xs transition-colors ${isLight ? 'text-blue-950 hover:bg-blue-50' : 'text-white hover:bg-white/10'}`}
                                    aria-expanded={isOpen}
                                >
                                    <Quotes size={14} weight="duotone" className="mt-0.5 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-semibold">
                                            {locationLabel}
                                        </span>
                                        <span className={isLight ? 'text-blue-500' : 'text-white/55'}>
                                            Short source preview
                                        </span>
                                    </span>
                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${citation.citationVerifierStatus === 'failed'
                                        ? isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-300/15 text-rose-100'
                                        : citation.citationVerifierStatus === 'partial'
                                            ? isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-300/15 text-amber-100'
                                            : isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-300/15 text-emerald-100'
                                        }`}>
                                        {citation.citationVerifierStatus === 'verified'
                                            ? <ShieldCheck size={11} weight="fill" />
                                            : <WarningCircle size={11} weight="fill" />}
                                        {status}
                                    </span>
                                </button>
                                {isOpen && (
                                    <div className={`border-t px-3 py-2 text-xs leading-relaxed ${isLight ? 'border-blue-100 text-blue-950/80' : 'border-white/10 text-white/75'}`}>
                                        <div className={`mb-2 flex flex-wrap items-center gap-2 text-[11px] ${isLight ? 'text-blue-700' : 'text-sky-100/75'}`}>
                                            <span className="font-semibold">{citation.filename}</span>
                                            <span>{locationLabel}</span>
                                        </div>
                                        <p className="whitespace-pre-wrap break-words">
                                            &quot;{citation.quotePreview}&quot;
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleCopyQuote(citation)}
                                                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold transition-colors ${isLight ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-white/10 text-sky-100 hover:bg-white/15'}`}
                                            >
                                                <Copy size={12} weight="regular" />
                                                {copiedCitationId === citation.id ? 'Copied' : 'Copy quote'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {detailsOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
                {visibleSources.map((source) => (
                    <div
                        key={`${source.uploadedFileId}-${source.source}`}
                        className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${isLight
                            ? 'border-blue-200 bg-white text-blue-950'
                            : 'border-white/10 bg-white/10 text-white'
                            }`}
                        title={`${source.filename} · ${getSourceLabel(source.source)}`}
                    >
                        <FileText size={13} weight="regular" className="shrink-0" />
                        <span className="max-w-[220px] truncate font-semibold">{source.filename}</span>
                        <span className={isLight ? 'text-blue-500' : 'text-white/55'}>{getSourceLabel(source.source)}</span>
                    </div>
                ))}
            </div>
            )}
        </div>
    );
}

function AnalysisStatusCard({ isLight }: { isLight: boolean }) {
    return (
        <div className={`rounded-xl border px-4 py-3 text-sm ${isLight
            ? 'border-blue-100 bg-blue-50 text-blue-950'
            : 'border-sky-300/15 bg-sky-300/10 text-sky-50'
            }`}>
            <p className="font-semibold">Analyzing court order</p>
            <p className={`mt-1 text-xs ${isLight ? 'text-blue-700' : 'text-sky-100/75'}`}>
                Preparing a clean summary, deadlines, risks, and source references.
            </p>
        </div>
    );
}

const COURT_ORDER_FOLLOW_UPS = [
    {
        label: 'Create deadline checklist',
        prompt: 'Create a deadline checklist from this court-order analysis.',
    },
    {
        label: 'Draft AppClose message',
        prompt: 'Draft a concise AppClose message for the most important notice or compliance item in this order.',
    },
    {
        label: 'Explain possession schedule',
        prompt: 'Explain the possession schedule provisions from this order in plain English.',
    },
    {
        label: 'Extract only deadlines',
        prompt: 'Extract only the deadlines, triggers, and recurring obligations from this order.',
    },
    {
        label: 'Create compliance calendar',
        prompt: 'Create a compliance calendar from the deadlines and recurring obligations in this order.',
    },
    {
        label: 'Find enforcement risks',
        prompt: 'Find the enforcement risks and ambiguous provisions in this order.',
    },
] as const;

const REDACTED_ASSISTANT_COPY_TEXT =
    'Analysis was withheld because it contained internal source metadata. Please retry this answer.';

function CourtOrderFollowUpChips({
    isLight,
    onSuggestedPrompt,
}: {
    isLight: boolean;
    onSuggestedPrompt?: (prompt: string) => void;
}) {
    if (!onSuggestedPrompt) return null;

    return (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested court order follow-ups">
            {COURT_ORDER_FOLLOW_UPS.map((followUp) => (
                <button
                    key={followUp.label}
                    type="button"
                    onClick={() => onSuggestedPrompt(followUp.prompt)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${isLight
                        ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    {followUp.label}
                </button>
            ))}
        </div>
    );
}

function renderDraftReadyMarkdown(draftReady: unknown) {
    if (!draftReady || typeof draftReady !== 'object' || Array.isArray(draftReady)) {
        return 'Draft artifact is available, but the draft body was not returned in a displayable format.';
    }

    const draft = draftReady as Record<string, unknown>;
    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    const body = typeof draft.body === 'string'
        ? draft.body.trim()
        : typeof draft.content === 'string'
            ? draft.content.trim()
            : '';
    const filingNotes = typeof draft.filingNotes === 'string' ? draft.filingNotes.trim() : '';

    if (!body) {
        return 'Draft artifact is available, but the draft body was not returned in a displayable format.';
    }

    return [
        title ? `## ${title}` : undefined,
        body,
        filingNotes ? `## Filing Notes\n${filingNotes}` : undefined,
    ].filter(Boolean).join('\n\n');
}

/** Ensure a value is an array of strings, defaulting to [] on mismatch. */
function ensureStringArray(val: unknown): string[] {
    return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : [];
}

/** Coerce a value to a finite number clamped to 0–10, returning 0 for non-finite values. */
function ensureScore(val: unknown): number {
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), 10);
}

/**
 * Validate and normalize a parsed JSON payload into a safe NexxArtifacts object.
 * Defaults missing arrays to [] and rejects non-object payloads entirely.
 * This prevents runtime crashes from malformed or legacy persisted data.
 */
function normalizeNexxArtifacts(parsed: unknown): NexxArtifacts | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    // Normalize each artifact field defensively
    const confidence = obj.confidence && typeof obj.confidence === 'object'
        ? {
            confidence: String((obj.confidence as Record<string, unknown>).confidence ?? 'moderate') as 'high' | 'moderate' | 'low',
            basis: String((obj.confidence as Record<string, unknown>).basis ?? ''),
            evidenceSufficiency: String((obj.confidence as Record<string, unknown>).evidenceSufficiency ?? ''),
            missingSupport: ensureStringArray((obj.confidence as Record<string, unknown>).missingSupport),
        }
        : null;

    const judgeSimulation = obj.judgeSimulation && typeof obj.judgeSimulation === 'object'
        ? {
            credibilityScore: ensureScore((obj.judgeSimulation as Record<string, unknown>).credibilityScore),
            neutralityScore: ensureScore((obj.judgeSimulation as Record<string, unknown>).neutralityScore),
            clarityScore: ensureScore((obj.judgeSimulation as Record<string, unknown>).clarityScore),
            strengths: ensureStringArray((obj.judgeSimulation as Record<string, unknown>).strengths),
            weaknesses: ensureStringArray((obj.judgeSimulation as Record<string, unknown>).weaknesses),
            likelyCourtInterpretation: String((obj.judgeSimulation as Record<string, unknown>).likelyCourtInterpretation ?? ''),
            improvementSuggestions: ensureStringArray((obj.judgeSimulation as Record<string, unknown>).improvementSuggestions),
        }
        : null;

    const oppositionSimulation = obj.oppositionSimulation && typeof obj.oppositionSimulation === 'object'
        ? {
            likelyAttackPoints: ensureStringArray((obj.oppositionSimulation as Record<string, unknown>).likelyAttackPoints),
            framingRisks: ensureStringArray((obj.oppositionSimulation as Record<string, unknown>).framingRisks),
            whatNeedsTightening: ensureStringArray((obj.oppositionSimulation as Record<string, unknown>).whatNeedsTightening),
            preemptionSuggestions: ensureStringArray((obj.oppositionSimulation as Record<string, unknown>).preemptionSuggestions),
        }
        : null;

    return {
        draftReady: obj.draftReady ?? null,
        timelineReady: obj.timelineReady ?? null,
        exhibitReady: obj.exhibitReady ?? null,
        judgeSimulation,
        oppositionSimulation,
        confidence,
    } as NexxArtifacts;
}

// ── Artifact Sub-Components ──

/** Collapsible artifact panel with icon, label, and content. */
function ArtifactPanel({
    icon: Icon,
    label,
    isLight,
    children,
    defaultOpen = false,
    accentColor = '#5A8EC9',
}: {
    icon: React.ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone'; className?: string }>;
    label: string;
    isLight: boolean;
    children: React.ReactNode;
    defaultOpen?: boolean;
    accentColor?: string;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const reactId = useId();
    const panelId = `artifact-panel-${label.toLowerCase().replace(/\s+/g, '-')}-${reactId.replace(/:/g, '')}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border overflow-hidden mt-3 ${isLight
                ? 'bg-gray-50 border-gray-200'
                : 'bg-white/5 border-white/10'
                }`}
        >
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors cursor-pointer ${isLight
                    ? 'hover:bg-gray-100 text-gray-700'
                    : 'hover:bg-white/10 text-white/80'
                    }`}
            >
                <Icon size={16} weight="duotone" className="flex-shrink-0" />
                <span className="text-[12px] font-bold tracking-wider uppercase flex-1" style={{ color: accentColor }}>
                    {label}
                </span>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={14} className="opacity-50" />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        id={panelId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className={`px-4 pb-3 text-[13px] leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/70'}`}>
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/** Score bar for judge simulation scores (1-10). */
function ScoreBar({ label, score, isLight }: { label: string; score: number; isLight: boolean }) {
    const pct = Math.min(Math.max(score, 0), 10) * 10;
    const color = score >= 7 ? '#22C55E' : score >= 4 ? '#F59E0B' : '#EF4444';
    return (
        <div className="flex items-center gap-3 py-1">
            <span className={`text-[11px] font-semibold w-20 ${isLight ? 'text-gray-500' : 'text-white/50'}`}>{label}</span>
            <div className={`flex-1 h-2 rounded-full overflow-hidden ${isLight ? 'bg-gray-200' : 'bg-white/10'}`}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                />
            </div>
            <span className="text-[11px] font-bold w-6 text-right" style={{ color }}>{score}</span>
        </div>
    );
}

/** Render the judge simulation artifact. */
function JudgeSimulationPanel({ data, isLight }: { data: JudgeSimulationResult; isLight: boolean }) {
    return (
        <>
            <div className="space-y-1 mb-3">
                <ScoreBar label="Credibility" score={data.credibilityScore} isLight={isLight} />
                <ScoreBar label="Neutrality" score={data.neutralityScore} isLight={isLight} />
                <ScoreBar label="Clarity" score={data.clarityScore} isLight={isLight} />
            </div>
            <p className={`text-[12px] mb-2 ${isLight ? 'text-gray-700' : 'text-white/80'}`}>
                <strong>Court Interpretation:</strong> {data.likelyCourtInterpretation}
            </p>
            {data.strengths.length > 0 && (
                <div className="mb-2">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>Strengths</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            )}
            {data.weaknesses.length > 0 && (
                <div className="mb-2">
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-red-500' : 'text-red-400'}`}>Weaknesses</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {data.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}
            {data.improvementSuggestions.length > 0 && (
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>Suggestions</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {data.improvementSuggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            )}
        </>
    );
}

/** Render the opposition simulation artifact. */
function OppositionSimulationPanel({ data, isLight }: { data: OppositionSimulationResult; isLight: boolean }) {
    const sections = [
        { label: 'Likely Attack Points', items: data.likelyAttackPoints, color: isLight ? 'text-red-600' : 'text-red-400' },
        { label: 'Framing Risks', items: data.framingRisks, color: isLight ? 'text-amber-600' : 'text-amber-400' },
        { label: 'Needs Tightening', items: data.whatNeedsTightening, color: isLight ? 'text-orange-600' : 'text-orange-400' },
        { label: 'Preemption Suggestions', items: data.preemptionSuggestions, color: isLight ? 'text-emerald-600' : 'text-emerald-400' },
    ];
    return (
        <div className="space-y-3">
            {sections.map(({ label, items, color }) => items.length > 0 && (
                <div key={label}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {items.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
            ))}
        </div>
    );
}

/** Chat message bubble with ChatGPT-style actions (copy, retry, edit) and light/dark theme support. */
export default function MessageBubble({
    role,
    content,
    isStreaming,
    theme = 'dark',
    metadata,
    artifactsJson,
    onRetry,
    onEdit,
    structuredViewModel,
    detectedPatterns,
    procedureInfo,
    onAction,
    onSuggestedPrompt,
}: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(content);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Parse and validate artifacts from serialized JSON
    const artifacts = useMemo<NexxArtifacts | null>(() => {
        if (!artifactsJson) return null;
        try {
            const parsed: unknown = JSON.parse(artifactsJson);
            return normalizeNexxArtifacts(parsed);
        } catch {
            return null;
        }
    }, [artifactsJson]);

    const hasAnyArtifact = artifacts && (
        artifacts.draftReady ||
        artifacts.timelineReady ||
        artifacts.exhibitReady ||
        artifacts.judgeSimulation ||
        artifacts.oppositionSimulation
    );
    const documentSources = useMemo(() => getDocumentSources(metadata), [metadata]);
    const documentCitations = useMemo(() => getDocumentCitations(metadata), [metadata]);
    const metadataUiKind = getMetadataString(metadata, 'uiKind');
    const hasInternalAssistantContent = role === 'assistant' && looksLikeInternalStructuredPayload(content);
    const isAnalysisStatusMessage = role === 'assistant' && (
        metadataUiKind === ANALYSIS_STATUS_UI_KIND ||
        (isStreaming && content.trim() === SAFE_ANALYSIS_DRAFT_MESSAGE)
    );
    const shouldSanitizeAssistantContent = role === 'assistant' && (!isStreaming || hasInternalAssistantContent);
    const sanitizedAssistantContent = shouldSanitizeAssistantContent
        ? sanitizeVisibleAssistantContent(content)
        : content;
    const unsafeAssistantContent = role === 'assistant' && sanitizedAssistantContent === null;
    const visibleContent = role === 'assistant'
        ? sanitizedAssistantContent ?? ''
        : content;
    const shouldShowCourtOrderFollowUps = role === 'assistant' && !isStreaming && visibleContent.includes('Court Order Analysis');

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        };
    }, []);

    // Auto-resize textarea when editing
    useEffect(() => {
        if (isEditing && editTextareaRef.current) {
            editTextareaRef.current.style.height = '0px';
            editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
            editTextareaRef.current.focus();
        }
    }, [isEditing, editContent]);

    /** Copy message content to the clipboard. */
    const handleCopy = useCallback(async () => {
        if (!window.isSecureContext || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(unsafeAssistantContent ? REDACTED_ASSISTANT_COPY_TEXT : visibleContent);
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [unsafeAssistantContent, visibleContent]);

    /** Enter inline edit mode, pre-filling the textarea with the current message content. */
    const handleStartEdit = useCallback(() => {
        setEditContent(content);
        setIsEditing(true);
    }, [content]);

    /** Cancel editing and restore original content. */
    const handleCancelEdit = useCallback(() => {
        setIsEditing(false);
        setEditContent(content);
    }, [content]);

    /** Save the edited content and trigger a re-generation via the parent callback. */
    const handleSaveEdit = useCallback(() => {
        const trimmed = editContent.trim();
        if (!trimmed || trimmed === content) {
            handleCancelEdit();
            return;
        }
        onEdit?.(trimmed);
        setIsEditing(false);
    }, [editContent, content, onEdit, handleCancelEdit]);

    /** Handle keyboard shortcuts in the edit textarea (Enter to save, Escape to cancel). */
    const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === 'Escape') {
            handleCancelEdit();
        }
    }, [handleSaveEdit, handleCancelEdit]);

    const isLight = theme === 'light';

    // Responsive visibility: always visible on mobile, hover-reveal on desktop
    const actionBarClass = 'flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity';

    // ── USER MESSAGE ──
    if (role === 'user') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="flex gap-3 w-full justify-end px-4 py-4 group"
            >
                <div className="flex flex-col items-end max-w-[80%]">
                    {isEditing ? (
                        /* ── Inline Edit Mode ── */
                        <div className={`w-full rounded-2xl p-3 border ${isLight
                            ? 'bg-white border-gray-200 shadow-sm'
                            : 'bg-white/10 border-white/20 backdrop-blur-sm'
                            }`}>
                            <textarea
                                ref={editTextareaRef}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                aria-label="Edit message"
                                className={`w-full resize-none border-none outline-none text-[15px] leading-relaxed font-medium bg-transparent min-w-[280px] ${isLight ? 'text-gray-900 placeholder:text-gray-400' : 'text-white placeholder:text-white/40'
                                    }`}
                                style={{ caretColor: isLight ? '#2563EB' : '#60A5FA' }}
                            />
                            <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-current/10">
                                <button
                                    onClick={handleCancelEdit}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isLight
                                        ? 'text-gray-500 hover:bg-gray-100'
                                        : 'text-white/60 hover:bg-white/10'
                                        }`}
                                >
                                    <X size={14} weight="bold" /> Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={!editContent.trim() || editContent.trim() === content}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <PaperPlaneRight size={14} weight="fill" /> Send
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ── Normal Display ── */
                        <>
                            <div className={`rounded-3xl px-5 py-3 shadow-sm font-medium text-[15px] leading-relaxed whitespace-pre-wrap ${isLight
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-white/10 backdrop-blur-sm border border-white/15 text-white'
                                }`}>
                                {content}
                            </div>
                            {/* User action bar */}
                            <div className={`${actionBarClass} mt-1`}>
                                <ActionButton onClick={handleCopy} label={copied ? 'Copied' : 'Copy message'} isLight={isLight}>
                                    {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} weight="regular" />}
                                </ActionButton>
                                {onEdit && (
                                    <ActionButton onClick={handleStartEdit} label="Edit message" isLight={isLight}>
                                        <PencilSimple size={14} weight="regular" />
                                    </ActionButton>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        );
    }

    // ── ASSISTANT MESSAGE ──
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex gap-4 w-full justify-start px-4 sm:px-6 py-4 group"
        >
            <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-1 shadow-sm border ${isLight
                ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white border-indigo-400/20'
                : 'bg-white text-[#0A1128] border-white/20'
                }`}>
                <span className="text-[14px] font-black font-serif italic uppercase">N</span>
            </div>

            <div className="flex-1 max-w-4xl min-w-0 pr-4">
                {/* Structured response rendering (AssistantMessageCard) */}
                {unsafeAssistantContent ? (
                    <>
                        <AnalysisStatusCard isLight={isLight} />
                        <div className="mt-3">
                            <PlayAloudButton text={REDACTED_ASSISTANT_COPY_TEXT} />
                        </div>
                        {!isStreaming && (
                            <div className={`${actionBarClass} mt-2`}>
                                <ActionButton onClick={handleCopy} label={copied ? 'Copied' : 'Copy recovery notice'} isLight={isLight}>
                                    {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} weight="regular" />}
                                </ActionButton>
                                {onRetry && (
                                    <ActionButton onClick={onRetry} label="Retry response" isLight={isLight}>
                                        <ArrowsClockwise size={14} weight="regular" />
                                    </ActionButton>
                                )}
                            </div>
                        )}
                    </>
                ) : isAnalysisStatusMessage ? (
                    <AnalysisStatusCard isLight={isLight} />
                ) : structuredViewModel && !isStreaming ? (
                    <>
                        <AssistantMessageCard
                            viewModel={structuredViewModel}
                            patterns={detectedPatterns}
                            procedureInfo={procedureInfo}
                            onAction={(action, content) => onAction?.(action, content)}
                        />
                        <DocumentEvidencePanel sources={documentSources} citations={documentCitations} isLight={isLight} />
                        {shouldShowCourtOrderFollowUps && (
                            <CourtOrderFollowUpChips isLight={isLight} onSuggestedPrompt={onSuggestedPrompt} />
                        )}
                        {visibleContent.trim() && (
                            <div className="mt-3">
                                <PlayAloudButton text={visibleContent} />
                            </div>
                        )}
                    </>
                ) : (
                    <>
                <div className={`text-[15px] leading-7 font-normal prose max-w-none w-full break-words ${isLight
                    ? 'text-gray-800 prose-blue'
                    : 'text-white/90 prose-invert'
                    }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {visibleContent + (isStreaming ? ' ▍' : '')}
                    </ReactMarkdown>
                </div>

                {/* ── Artifact Panels ── */}
                {!isStreaming && (
                    <DocumentEvidencePanel sources={documentSources} citations={documentCitations} isLight={isLight} />
                )}

                {shouldShowCourtOrderFollowUps && (
                    <CourtOrderFollowUpChips isLight={isLight} onSuggestedPrompt={onSuggestedPrompt} />
                )}

                {!isStreaming && visibleContent.trim() && (
                    <div className="mt-3">
                        <PlayAloudButton text={visibleContent} />
                    </div>
                )}

                {hasAnyArtifact && !isStreaming && (
                    <div className="mt-4 space-y-1">
                        {artifacts.draftReady && (
                            <ArtifactPanel icon={FileText} label="Court-Ready Draft" isLight={isLight} accentColor="#C75A5A">
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {renderDraftReadyMarkdown(artifacts.draftReady)}
                                    </ReactMarkdown>
                                </div>
                            </ArtifactPanel>
                        )}

                        {artifacts.timelineReady && (
                            <ArtifactPanel icon={CalendarBlank} label="Timeline" isLight={isLight} accentColor="#7C6FA0">
                                {Array.isArray((artifacts.timelineReady as Record<string, unknown>).events) ? (
                                    <div className="space-y-2">
                                        {((artifacts.timelineReady as Record<string, unknown>).events as Array<Record<string, unknown>>).map((evt, i) => (
                                            <div key={i} className={`flex gap-3 items-start py-1.5 border-l-2 pl-3 ${isLight ? 'border-purple-300' : 'border-purple-500/50'}`}>
                                                <span className={`text-[11px] font-bold whitespace-nowrap ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>{String(evt.date || '')}</span>
                                                <span>{String(evt.description || '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <pre className="text-[12px] whitespace-pre-wrap">{JSON.stringify(artifacts.timelineReady, null, 2)}</pre>
                                )}
                            </ArtifactPanel>
                        )}

                        {artifacts.exhibitReady && (
                            <ArtifactPanel icon={ListBullets} label="Exhibit Index" isLight={isLight} accentColor="#5A9E6F">
                                {Array.isArray((artifacts.exhibitReady as Record<string, unknown>).exhibits) ? (
                                    <div className="space-y-2">
                                        {((artifacts.exhibitReady as Record<string, unknown>).exhibits as Array<Record<string, unknown>>).map((ex, i) => (
                                            <div key={i} className={`flex gap-3 py-1 ${isLight ? 'border-b border-gray-100' : 'border-b border-white/5'}`}>
                                                <span className={`text-[11px] font-bold whitespace-nowrap ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{String(ex.label || `Ex. ${i + 1}`)}</span>
                                                <span>{String(ex.description || '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <pre className="text-[12px] whitespace-pre-wrap">{JSON.stringify(artifacts.exhibitReady, null, 2)}</pre>
                                )}
                            </ArtifactPanel>
                        )}

                        {artifacts.judgeSimulation && (
                            <ArtifactPanel icon={Scales} label="Judge Perspective" isLight={isLight} accentColor="#E5A84A">
                                <JudgeSimulationPanel data={artifacts.judgeSimulation} isLight={isLight} />
                            </ArtifactPanel>
                        )}

                        {artifacts.oppositionSimulation && (
                            <ArtifactPanel icon={Sword} label="Opposition Analysis" isLight={isLight} accentColor="#A85050">
                                <OppositionSimulationPanel data={artifacts.oppositionSimulation} isLight={isLight} />
                            </ArtifactPanel>
                        )}
                    </div>
                )}

                {/* Assistant action bar */}
                {!isStreaming && (
                    <div className={`${actionBarClass} mt-2`}>
                        <ActionButton onClick={handleCopy} label={copied ? 'Copied' : 'Copy response'} isLight={isLight}>
                            {copied ? <Check size={14} weight="bold" className="text-emerald-400" /> : <Copy size={14} weight="regular" />}
                        </ActionButton>
                        {onRetry && (
                            <ActionButton onClick={onRetry} label="Retry response" isLight={isLight}>
                                <ArrowsClockwise size={14} weight="regular" />
                            </ActionButton>
                        )}
                    </div>
                )}
                </>
                )}
            </div>
        </motion.div>
    );
}
