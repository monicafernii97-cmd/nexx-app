'use client';

/**
 * Exhibit Export Modal — Configuration for exhibit packet generation.
 *
 * Evidence selection, labeling scheme, Bates numbering,
 * cover sheets, and organization controls.
 * Produces a typed ExportRequest via buildExhibitRequest().
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
    X,
    FolderOpen,
    CaretDown,
    Hash,
    TextAa,
} from '@phosphor-icons/react';
import { buildExhibitRequest, EXHIBIT_DEFAULTS, type ExhibitFormState } from '@/lib/export-assembly/utils/exportRequestBuilder';
import type { ExportRequest } from '@/lib/export-assembly/types/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExhibitExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (request: ExportRequest) => void;
    availableNodeIds?: string[];
    availableTimelineIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKET_TYPES: { value: ExhibitFormState['packetType']; label: string; description: string }[] = [
    { value: 'packet_with_index', label: 'Packet + Index', description: 'Standard filing packet with index page' },
    { value: 'packet_with_covers', label: 'Packet + Covers', description: 'Each exhibit gets a cover sheet' },
    { value: 'hearing_binder', label: 'Hearing Binder', description: 'Organized for courtroom use' },
    { value: 'mediation_binder', label: 'Mediation Binder', description: 'Formatted for mediation sessions' },
    { value: 'index_only', label: 'Index Only', description: 'Just the exhibit list' },
    { value: 'packet_only', label: 'Packet Only', description: 'Exhibits without index' },
];

const LABEL_STYLES: { value: ExhibitFormState['labelStyle']; label: string; icon: typeof TextAa; example: string }[] = [
    { value: 'alpha', label: 'Alphabetical', icon: TextAa, example: 'A, B, C…' },
    { value: 'numeric', label: 'Numeric', icon: Hash, example: '1, 2, 3…' },
    { value: 'party_numeric', label: 'Party-Numeric', icon: Hash, example: 'R-1, R-2…' },
];

const ORGANIZATIONS: { value: ExhibitFormState['organization']; label: string }[] = [
    { value: 'chronological', label: 'Chronological' },
    { value: 'issue_based', label: 'By Issue' },
    { value: 'witness_based', label: 'By Witness' },
    { value: 'source_based', label: 'By Source' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExhibitExportModal({
    isOpen,
    onClose,
    onSubmit,
    availableNodeIds = [],
    availableTimelineIds = [],
}: ExhibitExportModalProps) {
    const [form, setForm] = useState<ExhibitFormState>({ ...EXHIBIT_DEFAULTS });
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSubmit = () => {
        const request = buildExhibitRequest(
            form,
            availableNodeIds,
            [],
            availableTimelineIds,
        );
        onSubmit(request);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', duration: 0.5 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[2rem] border border-white/20 bg-[linear-gradient(135deg,rgba(18,61,126,0.6),rgba(10,17,40,0.95))] backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)] p-6"
                    style={{ scrollbarWidth: 'none' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#8B5CF6,#7C3AED)] flex items-center justify-center shadow-lg shadow-violet-500/30">
                                <FolderOpen size={24} weight="duotone" className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Exhibit Packet</h2>
                                <p className="text-[13px] font-medium text-white/60">Configure your exhibits</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                        >
                            <X size={18} weight="bold" />
                        </button>
                    </div>

                    {/* Exhibit Mode */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-violet-400 mb-2 block">
                            Exhibit Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {([
                                { value: 'court_structured' as const, label: 'Court Filing', description: 'Formatted for filing' },
                                { value: 'administrative' as const, label: 'Internal', description: 'For case management' },
                            ]).map(mode => (
                                <button
                                    key={mode.value}
                                    onClick={() => setForm(prev => ({ ...prev, exhibitMode: mode.value }))}
                                    className={`p-3 rounded-xl text-left transition-all ${form.exhibitMode === mode.value
                                        ? 'bg-violet-500/15 border border-violet-500/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <p className={`text-[13px] font-bold ${form.exhibitMode === mode.value ? 'text-violet-400' : 'text-white/80'}`}>
                                        {mode.label}
                                    </p>
                                    <p className="text-[11px] text-white/40 mt-0.5">{mode.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Packet Type */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-violet-400 mb-2 block">
                            Packet Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {PACKET_TYPES.map(pt => (
                                <button
                                    key={pt.value}
                                    onClick={() => setForm(prev => ({ ...prev, packetType: pt.value }))}
                                    className={`p-3 rounded-xl text-left transition-all ${form.packetType === pt.value
                                        ? 'bg-violet-500/15 border border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.1)]'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <p className={`text-[12px] font-bold ${form.packetType === pt.value ? 'text-violet-400' : 'text-white/80'}`}>
                                        {pt.label}
                                    </p>
                                    <p className="text-[10px] text-white/40 mt-0.5">{pt.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Label Style */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-violet-400 mb-2 block">
                            Label Style
                        </label>
                        <div className="flex gap-2">
                            {LABEL_STYLES.map(ls => (
                                <button
                                    key={ls.value}
                                    onClick={() => setForm(prev => ({ ...prev, labelStyle: ls.value }))}
                                    className={`flex-1 p-3 rounded-xl text-center transition-all ${form.labelStyle === ls.value
                                        ? 'bg-violet-500/15 border border-violet-500/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <p className={`text-[12px] font-bold ${form.labelStyle === ls.value ? 'text-violet-400' : 'text-white/70'}`}>
                                        {ls.label}
                                    </p>
                                    <p className="text-[10px] text-white/40 mt-0.5">{ls.example}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Organization */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-violet-400 mb-2 block">
                            Organization
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {ORGANIZATIONS.map(org => (
                                <button
                                    key={org.value}
                                    onClick={() => setForm(prev => ({ ...prev, organization: org.value }))}
                                    className={`p-2.5 rounded-xl text-center transition-all ${form.organization === org.value
                                        ? 'bg-violet-500/15 border border-violet-500/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <p className={`text-[12px] font-bold ${form.organization === org.value ? 'text-violet-400' : 'text-white/70'}`}>
                                        {org.label}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Feature Toggles */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-violet-400 mb-3 block">
                            Features
                        </label>
                        <div className="space-y-2">
                            {([
                                { key: 'includeCoverSheets' as const, label: 'Cover Sheets' },
                                { key: 'includeSummaries' as const, label: 'Exhibit Summaries' },
                                { key: 'includeDividerPages' as const, label: 'Divider Pages' },
                                { key: 'includeBatesNumbers' as const, label: 'Bates Numbering' },
                                { key: 'includeSourceMetadata' as const, label: 'Source Metadata' },
                                { key: 'mergedOutput' as const, label: 'Merged Single PDF' },
                            ]).map(toggle => (
                                <label
                                    key={toggle.key}
                                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors"
                                >
                                    <span className="text-[13px] font-semibold text-white/80">{toggle.label}</span>
                                    <div
                                        className={`w-10 h-6 rounded-full relative transition-colors ${form[toggle.key] ? 'bg-violet-500' : 'bg-white/20'}`}
                                        onClick={() => setForm(prev => ({ ...prev, [toggle.key]: !prev[toggle.key] }))}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form[toggle.key] ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Advanced */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors mb-5"
                    >
                        <CaretDown
                            size={14}
                            weight="bold"
                            className={`text-white/40 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                        />
                        <span className="text-[12px] font-bold text-white/50 tracking-wide uppercase">Advanced Options</span>
                    </button>

                    <AnimatePresence>
                        {showAdvanced && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mb-5"
                            >
                                <div className="space-y-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                    <label className="flex items-center justify-between p-2 cursor-pointer">
                                        <span className="text-[12px] font-semibold text-white/70">Include Confidential Notes</span>
                                        <div
                                            className={`w-10 h-6 rounded-full relative transition-colors ${form.includeConfidentialNotes ? 'bg-violet-500' : 'bg-white/20'}`}
                                            onClick={() => setForm(prev => ({ ...prev, includeConfidentialNotes: !prev.includeConfidentialNotes }))}
                                        >
                                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form.includeConfidentialNotes ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                        </div>
                                    </label>
                                    <div>
                                        <label className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-1 block">
                                            Packet Title
                                        </label>
                                        <input
                                            type="text"
                                            value={form.title ?? ''}
                                            onChange={e => setForm(prev => ({ ...prev, title: e.target.value || undefined }))}
                                            placeholder="Auto-generated"
                                            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        className="w-full py-4 rounded-2xl text-[14px] font-bold tracking-[0.15em] uppercase text-white bg-[linear-gradient(135deg,#8B5CF6,#7C3AED)] border border-white/25 shadow-[0_8px_24px_rgba(139,92,246,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_32px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all"
                    >
                        Assemble Exhibits
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
