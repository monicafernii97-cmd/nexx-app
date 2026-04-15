'use client';

/**
 * Court Export Modal — Configuration for court document generation.
 *
 * Pre-fills from userCourtSettings (state, county, parties, cause number).
 * Produces a typed ExportRequest via buildCourtRequest().
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
    X,
    Scales,
    CaretDown,
    CheckCircle,
    WarningCircle,
} from '@phosphor-icons/react';
import { buildCourtRequest, COURT_DEFAULTS, type CourtFormState } from '@/lib/export-assembly/utils/exportRequestBuilder';
import type { ExportRequest } from '@/lib/export-assembly/types/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourtExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (request: ExportRequest) => void;
    /** Pre-fill from userCourtSettings */
    courtSettings?: {
        state?: string;
        county?: string;
        courtName?: string;
        causeNumber?: string;
        petitionerLegalName?: string;
        respondentLegalName?: string;
        petitionerRole?: 'petitioner' | 'respondent';
    };
    /** All available workspace node IDs */
    availableNodeIds?: string[];
    /** All available timeline IDs */
    availableTimelineIds?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES: { value: CourtFormState['documentType']; label: string; description: string }[] = [
    { value: 'motion', label: 'Motion', description: 'Request for court action' },
    { value: 'response', label: 'Response', description: 'Reply to opposing motion' },
    { value: 'affidavit', label: 'Affidavit', description: 'Sworn statement of facts' },
    { value: 'declaration', label: 'Declaration', description: 'Unsworn written statement' },
    { value: 'petition', label: 'Petition', description: 'Initial filing to open a case' },
    { value: 'notice', label: 'Notice', description: 'Formal notification to court/parties' },
    { value: 'proposed_order', label: 'Proposed Order', description: 'Draft order for judge signature' },
    { value: 'objection', label: 'Objection', description: 'Formal opposition to a filing' },
];

const DRAFT_STYLES: { value: CourtFormState['tone']; label: string; description: string }[] = [
    { value: 'neutral', label: 'Neutral Factual', description: 'Just the facts — no persuasion' },
    { value: 'judge_friendly', label: 'Judge-Friendly Formal', description: 'Respectful, structured, professional' },
    { value: 'assertive', label: 'Assertive', description: 'Firm advocacy with factual support' },
    { value: 'detailed_advocacy', label: 'Detailed Advocacy', description: 'Comprehensive persuasive argument' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CourtExportModal({
    isOpen,
    onClose,
    onSubmit,
    courtSettings,
    availableNodeIds = [],
    availableTimelineIds = [],
}: CourtExportModalProps) {
    // Compute initial form state from court settings (avoid useEffect+setState)
    const initialForm = useMemo<CourtFormState>(() => ({
        ...COURT_DEFAULTS,
        jurisdictionId: courtSettings?.state && courtSettings?.county
            ? `${courtSettings.state}|${courtSettings.county}`
            : undefined,
    }), [courtSettings]);

    const [form, setForm] = useState<CourtFormState>(initialForm);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleSubmit = () => {
        const request = buildCourtRequest(
            form,
            availableNodeIds,
            [], // evidenceIds — populated later from exhibit selection
            availableTimelineIds,
        );
        onSubmit(request);
    };

    const hasJurisdiction = Boolean(courtSettings?.state && courtSettings?.county);
    const hasParties = Boolean(courtSettings?.petitionerLegalName);

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
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                {/* Modal */}
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
                            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] flex items-center justify-center shadow-lg shadow-[#1A4B9B]/30">
                                <Scales size={24} weight="duotone" className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Court Document</h2>
                                <p className="text-[13px] font-medium text-white/60">Configure your filing</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                        >
                            <X size={18} weight="bold" />
                        </button>
                    </div>

                    {/* Jurisdiction Status */}
                    <div className="flex gap-3 mb-5">
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold ${hasJurisdiction ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                            {hasJurisdiction ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
                            {hasJurisdiction ? `${courtSettings?.county}, ${courtSettings?.state}` : 'No jurisdiction set'}
                        </div>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold ${hasParties ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                            {hasParties ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}
                            {hasParties ? 'Parties set' : 'Parties missing'}
                        </div>
                    </div>

                    {/* Document Type */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-[#60A5FA] mb-2 block">
                            Document Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {DOCUMENT_TYPES.map(dt => (
                                <button
                                    key={dt.value}
                                    onClick={() => setForm(prev => ({ ...prev, documentType: dt.value }))}
                                    className={`p-3 rounded-xl text-left transition-all ${form.documentType === dt.value
                                        ? 'bg-[#60A5FA]/15 border border-[#60A5FA]/40 shadow-[0_0_12px_rgba(96,165,250,0.15)]'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
                                    }`}
                                >
                                    <p className={`text-[13px] font-bold ${form.documentType === dt.value ? 'text-[#60A5FA]' : 'text-white/80'}`}>
                                        {dt.label}
                                    </p>
                                    <p className="text-[11px] text-white/40 mt-0.5">{dt.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Draft Style */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-[#60A5FA] mb-2 block">
                            Draft Style
                        </label>
                        <div className="space-y-2">
                            {DRAFT_STYLES.map(ds => (
                                <button
                                    key={ds.value}
                                    onClick={() => setForm(prev => ({ ...prev, tone: ds.value }))}
                                    className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between ${form.tone === ds.value
                                        ? 'bg-[#60A5FA]/15 border border-[#60A5FA]/40'
                                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-[13px] font-bold ${form.tone === ds.value ? 'text-[#60A5FA]' : 'text-white/80'}`}>
                                            {ds.label}
                                        </p>
                                        <p className="text-[11px] text-white/40">{ds.description}</p>
                                    </div>
                                    {form.tone === ds.value && (
                                        <CheckCircle size={20} weight="fill" className="text-[#60A5FA] shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Include Toggles */}
                    <div className="mb-5">
                        <label className="text-[11px] font-bold tracking-widest uppercase text-[#60A5FA] mb-3 block">
                            Include Sections
                        </label>
                        <div className="space-y-2">
                            {([
                                { key: 'includeCaption' as const, label: 'Caption / Case Style Header' },
                                { key: 'includeLegalStandard' as const, label: 'Legal Standard / Grounds' },
                                { key: 'includePrayer' as const, label: 'Prayer for Relief' },
                                { key: 'includeCertificateOfService' as const, label: 'Certificate of Service' },
                                { key: 'includeProposedOrder' as const, label: 'Proposed Order' },
                            ]).map(toggle => (
                                <label
                                    key={toggle.key}
                                    className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors"
                                >
                                    <span className="text-[13px] font-semibold text-white/80">{toggle.label}</span>
                                    <div
                                        className={`w-10 h-6 rounded-full relative transition-colors ${form[toggle.key] ? 'bg-[#60A5FA]' : 'bg-white/20'}`}
                                        onClick={() => setForm(prev => ({ ...prev, [toggle.key]: !prev[toggle.key] }))}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${form[toggle.key] ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Advanced Options */}
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
                                            Document Title Override
                                        </label>
                                        <input
                                            type="text"
                                            value={form.title ?? ''}
                                            onChange={e => setForm(prev => ({ ...prev, title: e.target.value || undefined }))}
                                            placeholder="Auto-generated from document type"
                                            className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-[13px] placeholder:text-white/30 focus:outline-none focus:border-[#60A5FA]/50"
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
                                                        ? 'bg-[#60A5FA]/15 border border-[#60A5FA]/40 text-[#60A5FA]'
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
                        className="w-full py-4 rounded-2xl text-[14px] font-bold tracking-[0.15em] uppercase text-white bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/25 shadow-[0_8px_24px_rgba(26,75,155,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_32px_rgba(26,75,155,0.5)] hover:-translate-y-0.5 transition-all"
                    >
                        Assemble Document
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
