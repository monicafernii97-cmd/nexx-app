'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, ArrowsClockwise, PencilSimple, X, PaperPlaneRight, CaretDown, Scales, Sword, FileText, CalendarBlank, ListBullets } from '@phosphor-icons/react';
import { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { NexxArtifacts, LegalConfidence, JudgeSimulationResult, OppositionSimulationResult } from '@/lib/types';
import { AssistantMessageCard } from './AssistantMessageCard';
import type { AssistantResponseViewModel, ActionType, DetectedPattern, LocalProcedureInfo } from '@/lib/ui-intelligence/types';

export type ChatTheme = 'dark' | 'light';

interface MessageBubbleProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    theme?: ChatTheme;
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
}

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

/** Confidence badge — colored pill with tooltip. */
function ConfidenceBadge({ confidence, isLight }: { confidence: LegalConfidence; isLight: boolean }) {
    const colorMap = {
        high: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-600', dot: 'bg-emerald-500' },
        moderate: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-600', dot: 'bg-amber-500' },
        low: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-500', dot: 'bg-red-500' },
    };
    const c = colorMap[confidence.confidence] ?? colorMap.moderate;
    const [showTooltip, setShowTooltip] = useState(false);
    const tooltipId = useId();

    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={() => setShowTooltip(!showTooltip)}
                aria-expanded={showTooltip}
                aria-controls={tooltipId}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${c.bg} ${c.border} ${c.text} transition-all hover:scale-105 cursor-pointer`}
                aria-label={`Confidence: ${confidence.confidence}`}
            >
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {confidence.confidence} confidence
            </button>
            <AnimatePresence>
                {showTooltip && (
                    <motion.div
                        id={tooltipId}
                        role="tooltip"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`absolute z-30 left-0 top-full mt-2 w-72 rounded-xl p-3 text-xs shadow-lg border ${isLight
                            ? 'bg-white border-gray-200 text-gray-700'
                            : 'bg-[#0A1128] border-white/20 text-white/80'
                            }`}
                    >
                        <p className="font-semibold mb-1">{confidence.basis}</p>
                        <p className="opacity-70 mb-2">{confidence.evidenceSufficiency}</p>
                        {confidence.missingSupport.length > 0 && (
                            <div>
                                <p className="font-semibold text-[10px] uppercase tracking-wider opacity-50 mb-1">Missing Support</p>
                                <ul className="list-disc pl-3 space-y-0.5 opacity-70">
                                    {confidence.missingSupport.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

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
    artifactsJson,
    onRetry,
    onEdit,
    structuredViewModel,
    detectedPatterns,
    procedureInfo,
    onAction,
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
        artifacts.confidence ||
        artifacts.draftReady ||
        artifacts.timelineReady ||
        artifacts.exhibitReady ||
        artifacts.judgeSimulation ||
        artifacts.oppositionSimulation
    );

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
            await navigator.clipboard.writeText(content);
            setCopied(true);
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            copyTimerRef.current = setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [content]);

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
                {structuredViewModel && !isStreaming ? (
                    <AssistantMessageCard
                        viewModel={structuredViewModel}
                        patterns={detectedPatterns}
                        procedureInfo={procedureInfo}
                        onAction={(action, content) => onAction?.(action, content)}
                    />
                ) : (
                    <>
                {/* Confidence badge — rendered above the message */}
                {artifacts?.confidence && (
                    <div className="mb-2">
                        <ConfidenceBadge confidence={artifacts.confidence} isLight={isLight} />
                    </div>
                )}

                <div className={`text-[15px] leading-7 font-normal prose max-w-none w-full break-words ${isLight
                    ? 'text-gray-800 prose-blue'
                    : 'text-white/90 prose-invert'
                    }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content + (isStreaming ? ' ▍' : '')}
                    </ReactMarkdown>
                </div>

                {/* ── Artifact Panels ── */}
                {hasAnyArtifact && !isStreaming && (
                    <div className="mt-4 space-y-1">
                        {artifacts.draftReady && (
                            <ArtifactPanel icon={FileText} label="Court-Ready Draft" isLight={isLight} accentColor="#C75A5A">
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {typeof artifacts.draftReady === 'object' && 'content' in artifacts.draftReady
                                            ? String(artifacts.draftReady.content)
                                            : JSON.stringify(artifacts.draftReady, null, 2)}
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
