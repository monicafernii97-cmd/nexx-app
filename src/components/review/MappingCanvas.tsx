'use client';

/**
 * Mapping Canvas — Section tiles containing review items.
 *
 * Each section is a collapsible tile showing:
 * - Section name + item count
 * - Lock toggle (locks section from GPT regeneration)
 * - Review items with confidence indicators, text, and actions
 *
 * Items can be selected (opens TraceSidebar), excluded, or edited inline.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CaretDown,
    Eye,
    EyeSlash,
    PencilSimple,
} from '@phosphor-icons/react';
import type { MappingReviewItem } from '@/lib/export-assembly/types/exports';
import type { ExportOverrides } from '@/lib/export-assembly/orchestrator';
import SectionLockToggle from '@/components/review/SectionLockToggle';
import InlineOverrideEditor from '@/components/review/InlineOverrideEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MappingCanvasProps {
    sectionGroups: Map<string, MappingReviewItem[]>;
    overrides: ExportOverrides;
    textMode: 'original' | 'court_safe';
    selectedItemId: string | null;
    onSelectItem: (nodeId: string | null) => void;
    onLockSection: (sectionId: string, locked: boolean) => void;
    onExcludeItem: (nodeId: string, excluded: boolean) => void;
    onEditItem: (nodeId: string, text: string) => void;
    onMoveItem: (nodeId: string, toSection: string) => void;
}

// ---------------------------------------------------------------------------
// Confidence Colors
// ---------------------------------------------------------------------------

function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return '#34D399'; // emerald
    if (confidence >= 0.5) return '#F59E0B'; // amber
    return '#F87171'; // rose
}

function getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
}

// ---------------------------------------------------------------------------
// Section Tile
// ---------------------------------------------------------------------------

function SectionTile({
    sectionId,
    items,
    isLocked,
    textMode,
    selectedItemId,
    onSelectItem,
    onLockSection,
    onExcludeItem,
    onEditItem,
    onMoveItem: _onMoveItem,
}: {
    sectionId: string;
    items: MappingReviewItem[];
    isLocked: boolean;
    textMode: 'original' | 'court_safe';
    selectedItemId: string | null;
    onSelectItem: (nodeId: string | null) => void;
    onLockSection: (sectionId: string, locked: boolean) => void;
    onExcludeItem: (nodeId: string, excluded: boolean) => void;
    onEditItem: (nodeId: string, text: string) => void;
    onMoveItem: (nodeId: string, toSection: string) => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    const includedCount = items.filter(i => i.includedInExport && !i.userOverride?.exclude).length;
    const avgConfidence = items.length > 0
        ? items.reduce((sum, i) => sum + i.confidence, 0) / items.length
        : 0;

    return (
        <motion.div
            layout
            className={`rounded-2xl border overflow-hidden transition-colors ${
                isLocked
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.03]'
            }`}
        >
            {/* Section Header */}
            <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <CaretDown
                        size={14}
                        weight="bold"
                        className={`text-white/40 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <div>
                        <h3 className="text-[14px] font-bold text-white tracking-tight">
                            {formatSectionName(sectionId)}
                        </h3>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            {includedCount}/{items.length} items · avg confidence {Math.round(avgConfidence * 100)}%
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {/* Confidence Indicator */}
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: getConfidenceColor(avgConfidence) }}
                    />
                    {/* Lock Toggle */}
                    <SectionLockToggle
                        sectionId={sectionId}
                        isLocked={isLocked}
                        onToggle={onLockSection}
                    />
                </div>
            </div>

            {/* Items */}
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-2">
                            {items.map(item => {
                                const isExcluded = item.userOverride?.exclude ?? !item.includedInExport;
                                const isSelected = item.nodeId === selectedItemId;
                                const isEditing = item.nodeId === editingItemId;
                                const displayText = textMode === 'court_safe' && item.transformedCourtSafeText
                                    ? item.transformedCourtSafeText
                                    : item.userOverride?.editedText ?? item.originalText;

                                return (
                                    <motion.div
                                        key={item.nodeId}
                                        layout
                                        className={`group relative rounded-xl p-3.5 transition-all cursor-pointer ${
                                            isExcluded
                                                ? 'opacity-40 bg-white/[0.02] border border-white/5'
                                                : isSelected
                                                    ? 'bg-[#60A5FA]/10 border border-[#60A5FA]/30 shadow-[0_0_12px_rgba(96,165,250,0.1)]'
                                                    : 'bg-white/[0.04] border border-white/10 hover:bg-white/[0.07] hover:border-white/15'
                                        }`}
                                        onClick={() => onSelectItem(isSelected ? null : item.nodeId)}
                                    >
                                        {/* Item Header */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {/* Type Badge */}
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                                    getTypeBadgeClass(item.dominantType)
                                                }`}>
                                                    {item.dominantType}
                                                </span>
                                                {/* Confidence */}
                                                <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: getConfidenceColor(item.confidence) }}>
                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getConfidenceColor(item.confidence) }} />
                                                    {getConfidenceLabel(item.confidence)} ({Math.round(item.confidence * 100)}%)
                                                </span>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setEditingItemId(isEditing ? null : item.nodeId)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                    title="Edit text"
                                                >
                                                    <PencilSimple size={13} weight="bold" />
                                                </button>
                                                <button
                                                    onClick={() => onExcludeItem(item.nodeId, !isExcluded)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                    title={isExcluded ? 'Include' : 'Exclude'}
                                                >
                                                    {isExcluded ? <Eye size={13} weight="bold" /> : <EyeSlash size={13} weight="bold" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Text Content or Inline Editor */}
                                        {isEditing ? (
                                            <div onClick={e => e.stopPropagation()}>
                                                <InlineOverrideEditor
                                                    nodeId={item.nodeId}
                                                    currentText={displayText}
                                                    onSave={(text) => {
                                                        onEditItem(item.nodeId, text);
                                                        setEditingItemId(null);
                                                    }}
                                                    onCancel={() => setEditingItemId(null)}
                                                />
                                            </div>
                                        ) : (
                                            <p className={`text-[13px] leading-relaxed line-clamp-3 ${
                                                isExcluded ? 'text-white/30 line-through' : 'text-white/75'
                                            }`}>
                                                {displayText}
                                            </p>
                                        )}

                                        {/* Edited indicator */}
                                        {item.userOverride?.editedText && !isEditing && (
                                            <span className="inline-block mt-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                                Edited
                                            </span>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSectionName(sectionId: string): string {
    return sectionId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getTypeBadgeClass(type: string): string {
    switch (type) {
        case 'fact': return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
        case 'argument': return 'bg-violet-500/15 text-violet-400 border border-violet-500/20';
        case 'evidence_reference': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
        case 'timeline_event': return 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
        case 'emotion': return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
        case 'request': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20';
        case 'issue': return 'bg-orange-500/15 text-orange-400 border border-orange-500/20';
        case 'risk': return 'bg-red-500/15 text-red-400 border border-red-500/20';
        default: return 'bg-white/10 text-white/50 border border-white/10';
    }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MappingCanvas({
    sectionGroups,
    overrides,
    textMode,
    selectedItemId,
    onSelectItem,
    onLockSection,
    onExcludeItem,
    onEditItem,
    onMoveItem: _onMoveItem,
}: MappingCanvasProps) {
    const sectionIds = Array.from(sectionGroups.keys());
    const lockedSet = new Set(
        overrides.sectionOverrides.filter(s => s.isLocked).map(s => s.sectionId),
    );

    return (
        <div className="space-y-4">
            {sectionIds.map(sectionId => (
                <SectionTile
                    key={sectionId}
                    sectionId={sectionId}
                    items={sectionGroups.get(sectionId) ?? []}
                    isLocked={lockedSet.has(sectionId)}
                    textMode={textMode}
                    selectedItemId={selectedItemId}
                    onSelectItem={onSelectItem}
                    onLockSection={onLockSection}
                    onExcludeItem={onExcludeItem}
                    onEditItem={onEditItem}
                    onMoveItem={_onMoveItem}
                />
            ))}

            {sectionIds.length === 0 && (
                <div className="flex items-center justify-center py-20 text-white/30 text-[14px]">
                    No sections mapped. The assembly may be empty.
                </div>
            )}
        </div>
    );
}
