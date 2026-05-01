'use client';

/**
 * Mapping Canvas — Section tiles containing review items.
 *
 * Each section is a collapsible tile showing:
 * - Section name + item count
 * - Lock toggle (locks section from GPT regeneration)
 * - Review items with text preview and inline editing
 *
 * Items can be selected (opens TraceSidebar) or edited inline.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CaretDown,
    PencilSimple,
    ChatCircle,
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
    selectedItemId: string | null;
    onSelectItem: (nodeId: string | null) => void;
    onLockSection: (sectionId: string, locked: boolean) => void;
    onExcludeItem: (nodeId: string, excluded: boolean) => void;
    onEditItem: (nodeId: string, text: string) => void;
    onReviseItem: (nodeId: string) => void;
    onMoveItem: (nodeId: string, toSection: string) => void;
}

// Confidence helpers removed in Review Hub redesign (Phase 1)

// ---------------------------------------------------------------------------
// Section Tile
// ---------------------------------------------------------------------------

/** A collapsible section tile displaying review items grouped by section. */
function SectionTile({
    sectionId,
    items,
    isLocked,
    selectedItemId,
    onSelectItem,
    onLockSection,
    onExcludeItem,
    onEditItem,
    onReviseItem,
    // Reserved for future drag-to-reorder functionality (Sprint 9B)
    onMoveItem: _onMoveItem,
}: {
    sectionId: string;
    items: MappingReviewItem[];
    isLocked: boolean;
    selectedItemId: string | null;
    onSelectItem: (nodeId: string | null) => void;
    onLockSection: (sectionId: string, locked: boolean) => void;
    onExcludeItem: (nodeId: string, excluded: boolean) => void;
    onEditItem: (nodeId: string, text: string) => void;
    onReviseItem: (nodeId: string) => void;
    onMoveItem: (nodeId: string, toSection: string) => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);

    const includedCount = items.filter(i => i.includedInExport && !i.userOverride?.exclude).length;

    return (
        <motion.div
            layout
            className={`card-premium mb-4 ${
                isLocked
                    ? 'border-emerald-500/30'
                    : 'border-white/10'
            }`}
        >
            {/* Section Header */}
            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-5 cursor-pointer hover:bg-white/5 transition-colors text-left"
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-expanded={!isCollapsed}
                aria-label={`${formatSectionName(sectionId)}: ${includedCount} of ${items.length} items`}
            >
                <div className="flex items-center gap-3">
                    <CaretDown
                        size={14}
                        weight="bold"
                        className={`text-white/40 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <div>
                        <h3 className="text-[18px] font-bold text-white tracking-tight font-[family-name:var(--font-playfair)]">
                            {formatSectionName(sectionId)}
                        </h3>
                        <p className="text-[11px] text-white/40 mt-1">
                            {includedCount}/{items.length} items
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {/* Lock Toggle */}
                    <SectionLockToggle
                        sectionId={sectionId}
                        isLocked={isLocked}
                        onToggle={onLockSection}
                    />
                </div>
            </button>

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
                                const displayText = item.userOverride?.editedText ?? item.originalText;

                                return (
                                    <motion.div
                                        key={item.nodeId}
                                        layout
                                        role="button"
                                        tabIndex={0}
                                        className={`group relative rounded-xl p-4 transition-all cursor-pointer border ${
                                            isExcluded
                                                ? 'opacity-40 border-white/5 bg-transparent'
                                                : isSelected
                                                    ? 'bg-[#1A4B9B]/20 border-[#2563EB]/40 shadow-[0_0_15px_rgba(37,99,235,0.15)]'
                                                    : 'bg-transparent border-transparent hover:bg-white/[0.03] hover:border-white/10'
                                        }`}
                                        onClick={() => onSelectItem(isSelected ? null : item.nodeId)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelectItem(isSelected ? null : item.nodeId);
                                            }
                                        }}
                                        aria-pressed={isSelected}
                                        aria-label={`${item.dominantType} item: ${displayText.slice(0, 60)}`}
                                    >
                                        {/* Item Header — edit/revise actions on hover */}
                                        <div className="flex items-center justify-end mb-2">
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => onReviseItem(item.nodeId)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-[#3B82F6]/20 text-white/40 hover:text-[#3B82F6] transition-colors"
                                                    title="Revise section"
                                                    aria-label="Revise section"
                                                >
                                                    <ChatCircle size={14} weight="bold" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingItemId(isEditing ? null : item.nodeId)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                    title="Edit text"
                                                    aria-label="Edit text"
                                                >
                                                    <PencilSimple size={13} weight="bold" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Text Content or Inline Editor */}
                                        {isEditing ? (
                                            <div onClick={e => e.stopPropagation()}>
                                                <InlineOverrideEditor
                                                    currentText={displayText}
                                                    onSave={(text) => {
                                                        onEditItem(item.nodeId, text);
                                                        setEditingItemId(null);
                                                    }}
                                                    onCancel={() => setEditingItemId(null)}
                                                />
                                            </div>
                                        ) : (
                                            <p className={`text-[14px] leading-relaxed font-[family-name:var(--font-outfit)] ${
                                                isExcluded ? 'text-white/30 line-through' : 'text-white/80'
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

/** Format a section ID (snake_case) into a human-readable heading. */
function formatSectionName(sectionId: string): string {
    return sectionId
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}



// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * MappingCanvas — Renders section tiles with review items for the Review Hub.
 *
 * Each section tile is collapsible and shows the items mapped to that section
 * with inline editing. Accepts override
 * callbacks for locking, editing, and moving items.
 */
export default function MappingCanvas({
    sectionGroups,
    overrides,
    selectedItemId,
    onSelectItem,
    onLockSection,
    onExcludeItem,
    onEditItem,
    onReviseItem,
    onMoveItem: _onMoveItem,
}: MappingCanvasProps) {
    const sectionIds = Array.from(sectionGroups.keys());
    const lockedSet = new Set(
        overrides.sectionOverrides.filter(s => s.isLocked).map(s => s.sectionId),
    );

    return (
        <div className="space-y-6">
            {sectionIds.map(sectionId => (
                <SectionTile
                    key={sectionId}
                    sectionId={sectionId}
                    items={sectionGroups.get(sectionId) ?? []}
                    isLocked={lockedSet.has(sectionId)}
                    selectedItemId={selectedItemId}
                    onSelectItem={onSelectItem}
                    onLockSection={onLockSection}
                    onExcludeItem={onExcludeItem}
                    onEditItem={onEditItem}
                    onReviseItem={onReviseItem}
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
