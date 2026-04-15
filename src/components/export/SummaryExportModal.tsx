'use client';

/**
 * Summary Export Modal — Configuration for case summary generation.
 *
 * Allows audience selection, organization, and section toggles.
 * Produces a typed ExportRequest via buildSummaryRequest().
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
    X,
    FileText,
    CheckCircle,
    CaretDown,
} from '@phosphor-icons/react';
import { buildSummaryRequest, SUMMARY_DEFAULTS, type SummaryFormState } from '@/lib/export-assembly/utils/exportRequestBuilder';
import type { ExportRequest } from '@/lib/export-assembly/types/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (request: ExportRequest) => void;
    availableNodeIds?: string[];
    availableTimelineIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIENCES: { value: SummaryFormState['audience']; label: string; description: string }[] = [
    { value: 'internal', label: 'Internal Use', description: 'Full detail for your own reference' },
    { value: 'attorney', label: 'For Attorney', description: 'Professional summary for legal counsel' },
    { value: 'client', label: 'Client-Facing', description: 'Clear, accessible language' },
];

const ORGANIZATIONS: { value: SummaryFormState['organization']; label: string; description: string }[] = [
    { value: 'chronological', label: 'Chronological', description: 'Events in time order' },
    { value: 'issue_based', label: 'Issue-Based', description: 'Grouped by legal issues' },
    { value: 'topic_based', label: 'Topic-Based', description: 'Grouped by subject matter' },
];

const DETAIL_LEVELS: { value: SummaryFormState['detailLevel']; label: string }[] = [
    { value: 'concise', label: 'Concise' },
    { value: 'standard', label: 'Standard' },
    { value: 'detailed', label: 'Detailed' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SummaryExportModal({
    isOpen,
    onClose,
    onSubmit,
    availableNodeIds = [],
    availableTimelineIds = [],
}: SummaryExportModalProps) {
    const [form, setForm] = useState<SummaryFormState>({ ...SUMMARY_DEFAULTS });
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSubmit = () => {
        const request = buildSummaryRequest(
            form,
            availableNodeIds,
            [],
            availableTimelineIds,
        );
        onSubmit(request);
    };

    return (
        <AnimatePresence>
            {isOpen && (
            <motion.div
                key="summary-export-modal"
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
                            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#10B981,#059669)] flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <FileText size={24} weight="duotone" className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Case Summary</h2>
                                <p className="text-[13px] font-medium text-white/60">Configure your report</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                        >
                            <X size={18} weight="bold" />
                        </button>
                    </div>

                    {/* Audience */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-emerald-400 mb-2 block">
                            Audience
                        </label>
                        <div className="space-y-2">
                            {AUDIENCES.map(a => (
                                <button
                                    key={a.value}
                                    onClick={() => setForm(prev => ({ ...prev, audience: a.value }))}
                                    className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between ${form.audience === a.value
                                        ? 'bg-emerald-500/15 border border-emerald-500/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-[13px] font-bold ${form.audience === a.value ? 'text-emerald-400' : 'text-white/80'}`}>
                                            {a.label}
                                        </p>
                                        <p className="text-[11px] text-white/40">{a.description}</p>
                                    </div>
                                    {form.audience === a.value && (
                                        <CheckCircle size={20} weight="fill" className="text-emerald-400 shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Organization */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-emerald-400 mb-2 block">
                            Organization
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {ORGANIZATIONS.map(org => (
                                <button
                                    key={org.value}
                                    onClick={() => setForm(prev => ({ ...prev, organization: org.value }))}
                                    className={`p-3 rounded-xl text-center transition-all ${form.organization === org.value
                                        ? 'bg-emerald-500/15 border border-emerald-500/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <p className={`text-[12px] font-bold ${form.organization === org.value ? 'text-emerald-400' : 'text-white/70'}`}>
                                        {org.label}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Detail Level */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-emerald-400 mb-2 block">
                            Detail Level
                        </label>
                        <div className="flex rounded-xl bg-white/5 border border-white/10 p-1">
                            {DETAIL_LEVELS.map(dl => (
                                <button
                                    key={dl.value}
                                    onClick={() => setForm(prev => ({ ...prev, detailLevel: dl.value }))}
                                    className={`flex-1 py-2 rounded-lg text-[12px] font-bold transition-all ${form.detailLevel === dl.value
                                        ? 'bg-emerald-500/20 text-emerald-400 shadow-sm'
                                        : 'text-white/50 hover:text-white/80'
                                    }`}
                                >
                                    {dl.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Include Toggles */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-emerald-400 mb-3 block">
                            Include Sections
                        </label>
                        <div className="space-y-2">
                            {([
                                { key: 'includeTimeline' as const, label: 'Timeline Overview' },
                                { key: 'includeEvidenceAppendix' as const, label: 'Evidence Appendix' },
                                { key: 'includeRecommendations' as const, label: 'Recommended Next Steps' },
                            ]).map(toggle => (
                                <label
                                    key={toggle.key}
                                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors"
                                >
                                    <span className="text-[13px] font-semibold text-white/80">{toggle.label}</span>
                                    <div
                                        className={`w-10 h-6 rounded-full relative transition-colors ${form[toggle.key] ? 'bg-emerald-500' : 'bg-white/20'}`}
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
                                    <div>
                                        <label className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-1 block">
                                            Summary Title
                                        </label>
                                        <input
                                            type="text"
                                            value={form.title ?? ''}
                                            onChange={e => setForm(prev => ({ ...prev, title: e.target.value || undefined }))}
                                            placeholder="Auto-generated"
                                            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-1 block">
                                            Output Format
                                        </label>
                                        <div className="flex gap-2">
                                            {(['pdf', 'docx'] as const).map(fmt => (
                                                <button
                                                    key={fmt}
                                                    onClick={() => setForm(prev => ({ ...prev, outputFormat: fmt }))}
                                                    className={`px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wide transition-all ${form.outputFormat === fmt
                                                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                                                        : 'bg-white/5 border border-white/10 text-white/50 hover:text-white/80'
                                                    }`}
                                                >
                                                    {fmt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        className="w-full py-4 rounded-2xl text-[14px] font-bold tracking-[0.15em] uppercase text-white bg-[linear-gradient(135deg,#10B981,#059669)] border border-white/25 shadow-[0_8px_24px_rgba(16,185,129,0.3),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_32px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 transition-all"
                    >
                        Assemble Summary
                    </button>
                </motion.div>
            </motion.div>
            )}
        </AnimatePresence>
    );
}
