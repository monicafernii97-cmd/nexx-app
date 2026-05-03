'use client';

/**
 * Clarification Modal — Multi-mode interceptor dialog.
 *
 * Modes:
 * - Structure mode (original): unstructured document → AI restructure
 * - Court modes (8 specific): field editing, auto-fill, persistence toggle
 *
 * Court modes: missing_structure, court_required_fields, court_caption_repair,
 * court_title_repair, court_prayer_repair, court_certificate_repair,
 * court_signature_repair, duplicate_content_repair
 */

import React, { useId, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    WarningCircle, ArrowRight, CircleNotch, Info,
    CheckCircle, FloppyDisk, ChatTeardropDots,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CourtDocumentIssue, ClarificationModalMode, ClarificationResolution } from '@/lib/exports/courtDocumentIssues';
import { ISSUE_TO_MODE, MODE_PRIORITY } from '@/lib/exports/courtDocumentIssues';
import type { CourtIdentity } from '@/lib/exports/resolveCourtIdentity';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Possible user-selected actions when the structure clarification modal is shown. */
export type ClarificationAction = 'generate_titles' | 'go_to_nexchat' | 'other';

/** Props for the ClarificationModal component. */
interface ClarificationModalProps {
    /** Whether the modal is currently visible. */
    isOpen: boolean;
    /** Called when the user dismisses the modal without choosing an action. */
    onClose: () => void;
    /** Called when the user picks a structure-mode action. */
    onContinue: (action: ClarificationAction, details: string, resolvedText?: string) => void;
    /** The raw unstructured text for context (used when generating titles). */
    rawDocumentText?: string;
    // ── Court mode props ──
    /** Specific court modal mode. When set, renders court-specific panel. */
    courtMode?: ClarificationModalMode;
    /** Court document issues to display/resolve. */
    courtIssues?: CourtDocumentIssue[];
    /** Current resolved court identity for auto-fill. */
    courtIdentity?: CourtIdentity;
    /** Called when user resolves court issues. */
    onResolve?: (resolution: ClarificationResolution) => void;
    /** Called when user wants to save fields to Court Settings. Returns success. */
    onSaveToSettings?: (patch: Partial<CourtIdentity>) => Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════
// Mode Config
// ═══════════════════════════════════════════════════════════════

type ModeConfig = {
    title: string;
    description: string;
    fields: { key: string; label: string; placeholder: string; multiline?: boolean }[];
};

const MODE_CONFIGS: Record<ClarificationModalMode, ModeConfig> = {
    court_caption_repair: {
        title: 'Caption Details Needed',
        description: 'This filing needs a few caption details so it can be properly docketed.',
        fields: [
            { key: 'causeNumber', label: 'Cause Number', placeholder: 'e.g., 2024-12345-F' },
            { key: 'county', label: 'County', placeholder: 'e.g., Harris' },
            { key: 'state', label: 'State', placeholder: 'e.g., Texas' },
            { key: 'courtName', label: 'Court Name', placeholder: 'e.g., District Court' },
            { key: 'judicialDistrict', label: 'Judicial District', placeholder: 'e.g., 387th Judicial District' },
        ],
    },
    court_title_repair: {
        title: 'Document Title Needed',
        description: 'This filing needs a specific court-document title.',
        fields: [
            { key: 'resolvedTitle', label: 'Document Title', placeholder: 'e.g., Motion for Temporary Orders' },
            { key: 'resolvedSubtitle', label: 'Subtitle (optional)', placeholder: 'e.g., Pending Final Hearing' },
        ],
    },
    court_required_fields: {
        title: 'Filing Details Needed',
        description: 'This filing needs a few more details about the parties involved.',
        fields: [
            { key: 'filingPartyLegalName', label: 'Your Full Legal Name', placeholder: 'e.g., Jane Doe' },
            { key: 'filingPartyRole', label: 'Your Role', placeholder: 'petitioner or respondent' },
            { key: 'opposingPartyLegalName', label: 'Opposing Party Name', placeholder: 'e.g., John Doe' },
        ],
    },
    court_prayer_repair: {
        title: 'Prayer Section Needed',
        description: 'This motion needs a Prayer section telling the Court what relief is requested.',
        fields: [
            { key: 'prayerText', label: 'Prayer Text', placeholder: 'WHEREFORE, PREMISES CONSIDERED...', multiline: true },
        ],
    },
    court_certificate_repair: {
        title: 'Certificate of Service Needed',
        description: 'This filing needs a Certificate of Service.',
        fields: [
            { key: 'certificateText', label: 'Certificate Text', placeholder: 'I certify that a true and correct copy...', multiline: true },
        ],
    },
    court_signature_repair: {
        title: 'Signature Block Needed',
        description: 'This filing needs a signature block matching your representation status.',
        fields: [
            { key: 'filingPartyLegalName', label: 'Full Legal Name', placeholder: 'e.g., Jane Doe' },
        ],
    },
    duplicate_content_repair: {
        title: 'Duplicate Content Found',
        description: 'NEXX found repeated content that should be removed before filing.',
        fields: [],
    },
    missing_structure: {
        title: 'Document Structure Needed',
        description: 'This document appears to be missing structured sections or titles.',
        fields: [],
    },
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Get the highest-priority mode from a list of issues. */
function getPriorityMode(issues: CourtDocumentIssue[]): ClarificationModalMode | undefined {
    const modes = new Set(issues.map(i => ISSUE_TO_MODE[i.id]));
    return MODE_PRIORITY.find(m => modes.has(m));
}

/** Check if a field key maps to a CourtIdentity patch field. */
const IDENTITY_FIELDS = new Set([
    'causeNumber', 'county', 'state', 'courtName', 'judicialDistrict',
    'resolvedTitle', 'resolvedSubtitle', 'filingPartyLegalName',
    'filingPartyRole', 'opposingPartyLegalName',
]);

const TEXT_RESOLUTION_FIELDS = new Set(['prayerText', 'certificateText']);

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export default function ClarificationModal({
    isOpen, onClose, onContinue, rawDocumentText,
    courtMode, courtIssues, courtIdentity, onResolve, onSaveToSettings,
}: ClarificationModalProps) {
    const titleId = useId();
    const descriptionId = useId();
    const router = useRouter();

    // ── Structure mode state ──
    const [selectedAction, setSelectedAction] = useState<ClarificationAction>('generate_titles');
    const [details, setDetails] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Court mode state ──
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [saveToSettings, setSaveToSettings] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

    // Determine active mode
    const activeMode = courtMode ?? (courtIssues?.length ? getPriorityMode(courtIssues) : undefined);
    const isCourtMode = !!activeMode && activeMode !== 'missing_structure';
    const config = activeMode ? MODE_CONFIGS[activeMode] : null;

    // Issues for this mode
    const modeIssues = useMemo(() => {
        if (!courtIssues || !activeMode) return [];
        return courtIssues.filter(i => ISSUE_TO_MODE[i.id] === activeMode);
    }, [courtIssues, activeMode]);

    // Initialize field values from identity/suggestions
    const getFieldDefault = useCallback((key: string): string => {
        // Check suggestions first
        for (const issue of modeIssues) {
            if (issue.fieldKey === key && issue.suggestedValue) return issue.suggestedValue;
        }
        // Then current identity
        if (courtIdentity) {
            const val = (courtIdentity as Record<string, unknown>)[key];
            if (typeof val === 'string' && val.trim()) return val;
        }
        return '';
    }, [modeIssues, courtIdentity]);

    if (!isOpen) return null;

    // ── Structure mode handler (original logic) ──
    const handleStructureContinue = async () => {
        setError(null);
        if (selectedAction === 'go_to_nexchat') {
            onClose();
            router.push('/chat');
            return;
        }
        if (selectedAction === 'generate_titles' || selectedAction === 'other') {
            setIsProcessing(true);
            try {
                const instruction = selectedAction === 'generate_titles'
                    ? `Analyze this unstructured legal document text and add appropriate section headings and structure. Break it into logical sections with Roman numeral headings (I, II, III, etc.) that follow standard legal document conventions. ${details ? `Additional instructions: ${details}` : ''}`
                    : details || 'Please help restructure this document.';
                const res = await fetch('/api/review/revise', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        originalText: rawDocumentText || '(No document text available)',
                        instruction,
                        sectionName: 'Full Document',
                    }),
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }
                const reader = res.body?.getReader();
                if (!reader) throw new Error('No response body');
                const decoder = new TextDecoder();
                let fullText = '';
                let sseBuffer = '';
                let streamError: string | null = null;
                let sawDoneEvent = false;
                while (true) {
                    const { done, value } = await reader.read();
                    if (!done && value) sseBuffer += decoder.decode(value, { stream: true });
                    if (done) sseBuffer += decoder.decode();
                    const parseBuffer = done ? `${sseBuffer}\n\n` : sseBuffer;
                    const events = parseBuffer.split('\n\n');
                    sseBuffer = done ? '' : events.pop() ?? '';
                    for (const event of events) {
                        const line = event.trim();
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.error) { streamError = parsed.error; break; }
                            if (parsed.done) { sawDoneEvent = true; fullText = parsed.fullText || fullText; }
                            else if (parsed.delta) { fullText += parsed.delta; }
                        } catch { /* skip malformed */ }
                    }
                    if (streamError || done) break;
                }
                if (streamError) throw new Error(streamError);
                if (!sawDoneEvent) throw new Error('Stream ended without completion signal');
                onContinue(selectedAction, details, fullText);
            } catch (err) {
                console.error('[ClarificationModal] Error:', err);
                setError((err as Error).message || 'Something went wrong. Please try again.');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    // ── Court mode: Apply resolution ──
    const handleCourtApply = async () => {
        if (!onResolve || !activeMode) return;
        setError(null);
        setIsProcessing(true);

        try {
            // Build patch from field values
            const patch: Partial<CourtIdentity> = {};
            const textParts: string[] = [];

            for (const [key, value] of Object.entries(fieldValues)) {
                if (!value.trim()) continue;
                if (IDENTITY_FIELDS.has(key)) {
                    (patch as Record<string, unknown>)[key] = value.trim();
                } else if (TEXT_RESOLUTION_FIELDS.has(key)) {
                    textParts.push(value.trim());
                }
            }

            // Dispatch resolution based on mode
            if (Object.keys(patch).length > 0) {
                onResolve({ type: 'patch_court_identity', patch, saveToProfile: saveToSettings });
            }
            if (textParts.length > 0) {
                onResolve({ type: 'replace_document_text', resolvedText: textParts.join('\n\n') });
            }

            // Save to Court Settings if requested
            if (saveToSettings && Object.keys(patch).length > 0 && onSaveToSettings) {
                setSaveStatus('saving');
                const success = await onSaveToSettings(patch);
                setSaveStatus(success ? 'saved' : 'failed');
            }
        } catch (err) {
            console.error('[ClarificationModal] Court apply error:', err);
            setError((err as Error).message || 'Something went wrong.');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Court mode: Send to NEXchat ──
    const handleSendToNexchat = () => {
        onResolve?.({ type: 'send_to_nexchat' });
    };

    // ═══════════════════════════════════════════════════════════
    // Render
    // ═══════════════════════════════════════════════════════════

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm"
                    onClick={isProcessing ? undefined : onClose}
                />

                {/* Modal Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                    className="hyper-glass w-full max-w-[540px] flex flex-col relative z-10 max-h-[85vh] overflow-hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={descriptionId}
                >
                    {/* Header */}
                    <div className="p-6 pb-4 border-b border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                            {isCourtMode
                                ? <WarningCircle size={20} weight="fill" className="text-amber-400" />
                                : <Info size={20} weight="fill" className="text-[#38BDF8]" />
                            }
                            <h2 id={titleId} className="text-[16px] font-bold text-white tracking-tight">
                                {config?.title ?? 'Clarification Needed'}
                            </h2>
                        </div>
                        <p id={descriptionId} className="text-[14px] text-white/70 leading-relaxed">
                            {config?.description ?? 'This document needs additional information.'}
                        </p>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-4 overflow-y-auto flex-1">
                        {isCourtMode ? (
                            <>
                                {/* Issue list */}
                                {modeIssues.length > 0 && (
                                    <div className="space-y-2">
                                        {modeIssues.map(issue => (
                                            <div key={issue.id} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                <p className="text-[13px] font-semibold text-amber-300">{issue.title}</p>
                                                <p className="text-[12px] text-white/50 mt-0.5">{issue.message}</p>
                                                {issue.suggestedValue && issue.sourceSuggestion && (
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            From {issue.sourceSuggestion.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="text-[12px] text-white/60">&quot;{issue.suggestedValue}&quot;</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Field inputs */}
                                {config && config.fields.length > 0 && (
                                    <div className="space-y-3">
                                        {config.fields.map(field => {
                                            const defaultVal = getFieldDefault(field.key);
                                            const currentVal = fieldValues[field.key] ?? defaultVal;
                                            return (
                                                <div key={field.key}>
                                                    <label className="text-[12px] font-semibold text-white/60 block mb-1">
                                                        {field.label}
                                                    </label>
                                                    {field.multiline ? (
                                                        <textarea
                                                            value={currentVal}
                                                            onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                            placeholder={field.placeholder}
                                                            disabled={isProcessing}
                                                            className="w-full min-h-[80px] rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 resize-y transition-colors"
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={currentVal}
                                                            onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                            placeholder={field.placeholder}
                                                            disabled={isProcessing}
                                                            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2.5 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 transition-colors"
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Persistence toggle */}
                                <div className="flex items-center gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setSaveToSettings(!saveToSettings)}
                                        disabled={isProcessing}
                                        className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
                                            saveToSettings
                                                ? 'bg-[#3B82F6] border-[#3B82F6]'
                                                : 'border-white/30 bg-transparent'
                                        }`}
                                        aria-label="Save to Court Settings"
                                    >
                                        {saveToSettings && <CheckCircle size={10} weight="bold" className="text-white" />}
                                    </button>
                                    <span className="text-[12px] text-white/50">
                                        Save to Court Settings (use for all future documents)
                                    </span>
                                </div>

                                {/* Save status toast */}
                                {saveStatus === 'saved' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] flex items-center gap-2">
                                        <FloppyDisk size={14} weight="fill" /> Saved to Court Settings.
                                    </motion.div>
                                )}
                                {saveStatus === 'failed' && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px]">
                                        Used for this document, but could not save to Court Settings.
                                    </motion.div>
                                )}
                            </>
                        ) : (
                            /* ── Structure mode (original) ── */
                            <>
                                <OptionCard
                                    title="Generate titles and structure for me"
                                    description="AI will analyze the text and add section headings"
                                    selected={selectedAction === 'generate_titles'}
                                    onClick={() => setSelectedAction('generate_titles')}
                                    disabled={isProcessing}
                                />
                                <OptionCard
                                    title="Go to NexChat for a full court-ready draft"
                                    description="Open the AI chat for in-depth document creation"
                                    selected={selectedAction === 'go_to_nexchat'}
                                    onClick={() => setSelectedAction('go_to_nexchat')}
                                    disabled={isProcessing}
                                />
                                <OptionCard
                                    title="Other (specify below)"
                                    description="Provide custom instructions for restructuring"
                                    selected={selectedAction === 'other'}
                                    onClick={() => setSelectedAction('other')}
                                    disabled={isProcessing}
                                />
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-2 overflow-hidden">
                                    <textarea
                                        value={details}
                                        onChange={e => setDetails(e.target.value)}
                                        className="w-full min-h-[80px] rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#3B82F6]/50 resize-y transition-colors"
                                        placeholder={selectedAction === 'other' ? 'Describe how you want the document restructured...' : 'Additional details or instructions (optional)...'}
                                        disabled={isProcessing}
                                    />
                                </motion.div>
                            </>
                        )}

                        {/* Error display */}
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12px]">
                                <WarningCircle size={14} weight="fill" className="inline mr-1.5" />
                                {error}
                            </motion.div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-5 px-6 border-t border-white/5 bg-black/20 rounded-b-[20px] flex items-center justify-between gap-3">
                        {isCourtMode ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSendToNexchat}
                                    disabled={isProcessing}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                                >
                                    <ChatTeardropDots size={14} /> Send to NEXchat
                                </button>
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={onClose} disabled={isProcessing}
                                        className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleCourtApply} disabled={isProcessing}
                                        className="btn-primary flex items-center gap-2 !text-[13px] !py-2.5 disabled:opacity-50">
                                        {isProcessing ? (
                                            <><CircleNotch size={14} className="animate-spin" /> Applying...</>
                                        ) : (
                                            <>{saveToSettings ? 'Apply & Save' : 'Use for This Doc Only'} <ArrowRight size={14} weight="bold" /></>
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-3 ml-auto">
                                <button type="button" onClick={onClose} disabled={isProcessing}
                                    className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleStructureContinue}
                                    disabled={isProcessing || (selectedAction === 'other' && !details.trim())}
                                    className="btn-primary flex items-center gap-2 !text-[13px] !py-2.5 disabled:opacity-50">
                                    {isProcessing ? (
                                        <><CircleNotch size={14} className="animate-spin" /> Processing...</>
                                    ) : (
                                        <>Continue <ArrowRight size={14} weight="bold" /></>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

/** Accessible radio-style option card rendered as a semantic button. */
function OptionCard({ title, description, selected, onClick, disabled }: {
    title: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={`w-full flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 text-left ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${
                selected
                    ? 'border-[#3B82F6]/50 bg-[#3B82F6]/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
        >
            <div aria-hidden="true" className={`w-4 h-4 mt-0.5 rounded-full flex shrink-0 items-center justify-center ${
                selected ? 'border-[4px] border-[#3B82F6] bg-white' : 'border-[1.5px] border-white/30'
            }`} />
            <div>
                <span className={`text-[14px] font-semibold block ${selected ? 'text-white' : 'text-white/70'}`}>
                    {title}
                </span>
                {description && (
                    <span className="text-[11px] text-white/40 block mt-0.5">{description}</span>
                )}
            </div>
        </button>
    );
}
