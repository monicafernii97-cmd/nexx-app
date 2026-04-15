'use client';

/**
 * Trace Sidebar — Source traceability and "Why this section?" panel.
 *
 * When a review item is selected, this sidebar shows:
 * - Full original text with highlight
 * - Classification breakdown (scores for each type)
 * - Why it was assigned to this section (top 3 section scores)
 * - Confidence indicator with explanation
 * - Extracted signals (dates, court terms, emotion words, etc.)
 * - Quick actions: edit text, exclude item
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    X,
    Eye,
    EyeSlash,
    PencilSimple,
    Info,
    ShieldCheck,
    WarningCircle,
    ArrowRight,
} from '@phosphor-icons/react';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type { SentenceType } from '@/lib/export-assembly/types/classification';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraceSidebarProps {
    item: MappingReviewItem;
    onClose: () => void;
    onEditText: (text: string) => void;
    onExclude: (excluded: boolean) => void;
}

// ---------------------------------------------------------------------------
// Score bar component
// ---------------------------------------------------------------------------

function ScoreBar({ label, score, color, isTop }: { label: string; score: number; color: string; isTop: boolean }) {
    const pct = Math.round(score * 100);
    return (
        <div className={`flex items-center gap-3 py-1.5 ${isTop ? '' : 'opacity-50'}`}>
            <span className={`w-[100px] text-[11px] font-semibold truncate ${isTop ? 'text-white/80' : 'text-white/40'}`}>
                {label}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>
            <span className={`text-[10px] font-bold w-[36px] text-right ${isTop ? 'text-white/70' : 'text-white/30'}`}>
                {pct}%
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TraceSidebar({ item, onClose, onEditText, onExclude }: TraceSidebarProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(item.userOverride?.editedText ?? item.originalText);
    const isExcluded = item.userOverride?.exclude ?? !item.includedInExport;

    // Section assignment explanation
    const topSection = item.userOverride?.forceSection ?? item.suggestedSections[0] ?? 'Unclassified';
    const altSections = item.suggestedSections.slice(1, 4);

    // Only show the dominant type score — do NOT fabricate synthetic scores
    // for other types. Real per-type scores will come from ClassifiedNode.scores
    // when available on the MappingReviewItem in a future sprint.

    return (
        <div className="flex flex-col h-full bg-[rgba(10,17,40,0.95)] backdrop-blur-xl">
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Info size={16} weight="fill" className="text-[#60A5FA]" />
                    <h2 className="text-[14px] font-bold text-white tracking-tight">
                        Item Trace
                    </h2>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                    aria-label="Close trace sidebar"
                >
                    <X size={14} weight="bold" />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6" style={{ scrollbarWidth: 'thin' }}>
                {/* ── Original Text ── */}
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40">
                            Source Text
                        </h3>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setIsEditing(!isEditing)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                aria-label="Edit source text"
                            >
                                <PencilSimple size={12} weight="bold" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onExclude(!isExcluded)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                aria-label={isExcluded ? 'Include in export' : 'Exclude from export'}
                            >
                                {isExcluded ? <Eye size={12} weight="bold" /> : <EyeSlash size={12} weight="bold" />}
                            </button>
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="space-y-2">
                            <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="w-full min-h-[100px] rounded-xl bg-white/5 border border-white/15 px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-[#60A5FA]/50 resize-y"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        onEditText(editText);
                                        setIsEditing(false);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#60A5FA]/15 text-[#60A5FA] text-[11px] font-bold hover:bg-[#60A5FA]/25 transition-colors"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setEditText(item.userOverride?.editedText ?? item.originalText);
                                        setIsEditing(false);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-[11px] font-bold hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className={`text-[13px] leading-relaxed p-3 rounded-xl bg-white/[0.04] border border-white/10 ${
                            isExcluded ? 'text-white/30 line-through' : 'text-white/70'
                        }`}>
                            {item.userOverride?.editedText ?? item.originalText}
                        </p>
                    )}
                    {item.userOverride?.editedText && (
                        <p className="mt-2 text-[10px] text-violet-400 font-bold uppercase tracking-widest">
                            ✎ User-edited version
                        </p>
                    )}
                </section>

                {/* ── Why This Section? ── */}
                <section>
                    <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-3">
                        Why This Section?
                    </h3>
                    <div className="p-3 rounded-xl bg-[#60A5FA]/5 border border-[#60A5FA]/15">
                        <div className="flex items-center gap-2 mb-2">
                            <ArrowRight size={12} weight="bold" className="text-[#60A5FA]" />
                            <span className="text-[13px] font-bold text-white">
                                {formatSectionName(topSection)}
                            </span>
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">
                            Dominant type <span className="text-white/70 font-semibold">{item.dominantType}</span> with{' '}
                            <span className="text-white/70 font-semibold">{Math.round(item.confidence * 100)}%</span> confidence
                            matched this section&apos;s classification rules.
                        </p>
                    </div>

                    {altSections.length > 0 && (
                        <div className="mt-2 space-y-1">
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1">
                                Runner-Up Sections
                            </p>
                            {altSections.map(section => (
                                <div key={section} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                    <span className="text-[11px] text-white/40">{formatSectionName(section)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Classification — Dominant Type Only ── */}
                <section>
                    <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-3">
                        Classification
                    </h3>
                    <div className="space-y-0.5">
                        <ScoreBar
                            label={item.dominantType}
                            score={item.confidence}
                            color={getTypeColor(item.dominantType)}
                            isTop={true}
                        />
                    </div>
                    <p className="text-[10px] text-white/30 mt-2">
                        Per-type score breakdown will be available when real classification scores are wired.
                    </p>
                </section>

                {/* ── Confidence Detail ── */}
                <section>
                    <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-3">
                        Confidence Analysis
                    </h3>
                    <div className={`p-3 rounded-xl border ${
                        item.confidence >= 0.8
                            ? 'bg-emerald-500/5 border-emerald-500/15'
                            : item.confidence >= 0.5
                                ? 'bg-amber-500/5 border-amber-500/15'
                                : 'bg-rose-500/5 border-rose-500/15'
                    }`}>
                        <div className="flex items-center gap-2 mb-1">
                            {item.confidence >= 0.8 ? (
                                <ShieldCheck size={14} weight="fill" className="text-emerald-400" />
                            ) : (
                                <WarningCircle size={14} weight="fill" className={item.confidence >= 0.5 ? 'text-amber-400' : 'text-rose-400'} />
                            )}
                            <span className={`text-[13px] font-bold ${
                                item.confidence >= 0.8 ? 'text-emerald-400' :
                                item.confidence >= 0.5 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                                {Math.round(item.confidence * 100)}% — {getConfidenceExplanation(item.confidence)}
                            </span>
                        </div>
                        <p className="text-[11px] text-white/50 leading-relaxed">
                            {item.confidence < 0.5
                                ? 'This item has ambiguous signals. Review carefully before including in the export.'
                                : item.confidence < 0.8
                                    ? 'Classification is likely correct but has some competing signals.'
                                    : 'Strong keyword signals confirm this classification.'}
                        </p>
                    </div>
                </section>

                {/* ── Court-Safe Preview ── */}
                {item.transformedCourtSafeText && (
                    <section>
                        <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-2">
                            Court-Safe Version
                        </h3>
                        <p className="text-[13px] leading-relaxed p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-white/70">
                            {item.transformedCourtSafeText}
                        </p>
                    </section>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a section ID (snake_case) into a human-readable heading. */
function formatSectionName(sectionId: string): string {
    return sectionId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Map a confidence value (0-1) to a human-readable label. */
function getConfidenceExplanation(confidence: number): string {
    if (confidence >= 0.8) return 'High Confidence';
    if (confidence >= 0.5) return 'Medium Confidence';
    return 'Low Confidence';
}

/** Map a SentenceType to its display color for score bars and badges. */
function getTypeColor(type: SentenceType): string {
    const colors: Record<string, string> = {
        fact: '#60A5FA',
        argument: '#A78BFA',
        evidence_reference: '#34D399',
        timeline_event: '#F59E0B',
        emotion: '#F87171',
        request: '#22D3EE',
        issue: '#FB923C',
        risk: '#EF4444',
        procedure: '#94A3B8',
        opinion: '#E879F9',
        unknown: '#64748B',
    };
    return colors[type] ?? '#64748B';
}
