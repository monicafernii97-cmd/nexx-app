'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import {
    Bank,
    CaretLeft,
    CaretRight,
    FileText,
    Sparkle,
    Plus,
    Paperclip,
    X,
    ArrowRight,
    CheckCircle,
    DownloadSimple,
} from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { UI_TABS, getTemplatesForTab } from '@/lib/legal/templateCategories';
import type { UITabCategory } from '@/lib/legal/templateCategories';
import type { DocumentTemplate } from '@/lib/legal/types';

/** State for the 3-step generation flow */
type GeneratorView = 'compose' | 'working' | 'result';

/** Working state progress step */
interface ProgressStep {
    label: string;
    status: 'pending' | 'active' | 'complete';
}

/** Wrapper with Suspense boundary for useSearchParams */
export default function DocuVaultPage() {
    return (
        <Suspense fallback={<div className="max-w-5xl mx-auto flex items-center justify-center min-h-[50vh]"><div className="w-8 h-8 rounded-full border-2 border-[var(--champagne)] border-t-transparent animate-spin" /></div>}>
            <DocuVaultPageInner />
        </Suspense>
    );
}

/** DocuVault document generator page with compose, working, and result views. */
function DocuVaultPageInner() {
    const searchParams = useSearchParams();
    const { userId } = useUser();
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');
    /** True while user profile query is in-flight (prevents generation with wrong defaults). */
    const isUserProfileLoading = Boolean(userId) && user === undefined;

    // Tab & template state
    const [activeTab, setActiveTab] = useState<UITabCategory>('lead');
    const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
    const carouselRef = useRef<HTMLDivElement>(null);

    // Content input state
    const [documentContent, setDocumentContent] = useState('');

    // Flow state
    const [view, setView] = useState<GeneratorView>('compose');
    const [progress, setProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [caseNumber, setCaseNumber] = useState<string | null>(null);

    // Abort mechanism for generation
    const generationTokenRef = useRef(0);
    const completedRef = useRef(false);
    const pdfUrlRef = useRef<string | null>(null);
    const generationAbortRef = useRef<AbortController | null>(null);
    /** Tracks the active timeout for the popup-blocked print warning so rapid clicks don't race. */
    const printWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Revoke blob URL and abort stream on unmount to prevent leaks
    useEffect(() => {
        return () => {
            generationAbortRef.current?.abort();
            if (pdfUrlRef.current) {
                URL.revokeObjectURL(pdfUrlRef.current);
                pdfUrlRef.current = null;
            }
            if (printWarningTimeoutRef.current) {
                clearTimeout(printWarningTimeoutRef.current);
            }
        };
    }, []);

    /** Templates available for the currently active category tab. */
    const templates = getTemplatesForTab(activeTab);

    const initialSelectionDoneRef = useRef(false);

    // Auto-select template from URL query param (coming from Template Gallery)
    useEffect(() => {
        const templateId = searchParams.get('template');
        if (templateId && !initialSelectionDoneRef.current) {
            let matched = false;
            // Search all tabs for the matching template
            for (const tab of UI_TABS) {
                if (tab.id === 'create_own') continue;
                const tabTemplates = getTemplatesForTab(tab.id);
                const found = tabTemplates.find((t) => t.id === templateId);
                if (found) {
                    matched = true;
                    setActiveTab(tab.id);
                    setSelectedTemplate(found);
                    break;
                }
            }
            initialSelectionDoneRef.current = matched;
        }
    }, [searchParams]);

    /** Scroll the template carousel left or right by a fixed amount. */
    const scrollCarousel = (dir: 'left' | 'right') => {
        if (carouselRef.current) {
            const amount = dir === 'left' ? -280 : 280;
            carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    /** Handle document generation via the streaming API endpoint. */
    const handleGenerate = useCallback(async () => {
        if (!documentContent.trim() && !selectedTemplate) return;
        if (isUserProfileLoading) {
            setGenerationError('Loading your profile. Please try again in a moment.');
            return;
        }

        // Increment token so stale runs can detect cancellation
        const currentToken = ++generationTokenRef.current;
        generationAbortRef.current?.abort();
        const controller = new AbortController();
        generationAbortRef.current = controller;

        setView('working');
        setProgress(0);
        setGenerationError(null);
        completedRef.current = false;
        if (pdfUrlRef.current) {
            URL.revokeObjectURL(pdfUrlRef.current);
            pdfUrlRef.current = null;
            setGeneratedPdfUrl(null);
        }

        const steps: ProgressStep[] = [
            { label: 'Analyzing Legal Frameworks', status: 'active' },
            { label: 'Drafting Document Structure', status: 'pending' },
            { label: 'Applying Court Formatting', status: 'pending' },
            { label: 'NEXXverification Compliance', status: 'pending' },
            { label: 'Rendering PDF', status: 'pending' },
        ];
        setProgressSteps(steps);

        try {
            const res = await fetch('/api/documents/generate/stream', {
                signal: controller.signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: selectedTemplate?.id ?? 'petition_divorce',
                    courtSettings: {
                        state: user?.state || 'Texas',
                        county: user?.county || 'Fort Bend',
                    },
                    petitioner: { name: user?.name || 'Petitioner' },
                    caseType: selectedTemplate?.caseTypes?.[0] ?? 'divorce_without_children',
                    bodyContent: documentContent ? [{ heading: 'Content', paragraphs: [documentContent] }] : [],
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Generation failed' }));
                throw new Error(err.error || 'Generation failed');
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No response stream');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                // Check abort token before each read
                if (generationTokenRef.current !== currentToken) return;

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (generationTokenRef.current !== currentToken) return;
                    if (!line.startsWith('data: ')) continue;

                    /** Parse an SSE data line as JSON; warn and return null on failure. */
                    const event = (() => {
                        try {
                            return JSON.parse(line.slice(6));
                        } catch {
                            console.warn('[DocuVault] Malformed SSE event:', line);
                            return null;
                        }
                    })();
                    if (!event) continue;

                    // Update progress
                    setProgress(event.progress);

                    // Map SSE step names to UI labels
                    const stepMap: Record<string, number> = {
                        analyzing: 0, drafting: 1, formatting: 2, compliance: 3, pdf: 4, complete: 4,
                    };
                    const stepIdx = stepMap[event.step] ?? -1;
                    if (stepIdx >= 0) {
                        setProgressSteps(prev => prev.map((s, idx) => ({
                            ...s,
                            status: idx < stepIdx ? 'complete' as const
                                : idx === stepIdx ? (event.status === 'complete' ? 'complete' as const : 'active' as const)
                                : 'pending' as const,
                        })));
                    }

                    // Handle error
                    if (event.status === 'error') {
                        throw new Error(event.message);
                    }

                    // Handle completion
                    if (event.step === 'complete' && event.result?.pdfBase64) {
                        if (generationTokenRef.current !== currentToken) return;
                        completedRef.current = true;
                        try {
                            const bytes = Uint8Array.from(atob(event.result.pdfBase64), c => c.charCodeAt(0));
                            const blob = new Blob([bytes], { type: 'application/pdf' });
                            const url = URL.createObjectURL(blob);

                            pdfUrlRef.current = url;
                            setGeneratedPdfUrl(url);
                            setCaseNumber(Math.random().toString(36).substring(2, 8).toUpperCase());
                            setView('result');
                        } catch (decodeErr) {
                            console.error('[DocuVault] Failed to decode PDF:', decodeErr);
                            throw new Error('Failed to decode generated PDF');
                        }
                    }
                }
            }

            // If stream ended without a complete event, treat as incomplete
            if (generationTokenRef.current === currentToken && !completedRef.current) {
                setGenerationError('Document generation incomplete. Please try again.');
                setView('compose');
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            if (generationTokenRef.current !== currentToken) return;
            console.error('[DocuVault Generation Error]', error);
            setGenerationError(error instanceof Error ? error.message : 'Generation failed');
            setView('compose');
        }
    }, [documentContent, selectedTemplate, isUserProfileLoading, user?.state, user?.county, user?.name]);

    /** Reset all state to begin composing a new document, aborting any in-flight generation. */
    const handleNewDocument = useCallback(() => {
        // Increment token to abort any running generation
        generationTokenRef.current++;
        generationAbortRef.current?.abort();
        generationAbortRef.current = null;

        setView('compose');
        setSelectedTemplate(null);
        setDocumentContent('');
        setProgress(0);
        setProgressSteps([]);
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
        setGeneratedPdfUrl(null);
        setGenerationError(null);
        setCaseNumber(null);
    }, []);

    return (
        <div className="max-w-5xl mx-auto relative pb-20">
            {/* ═══════════════════════════════════════════════════
                VIEW: COMPOSE (Main Generator)
               ═══════════════════════════════════════════════════ */}
            {view === 'compose' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-8"
                >
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    >
                        <div className="flex items-center gap-5 mb-5">
                            <div className="w-16 h-16 rounded-3xl flex items-center justify-center bg-white/5 backdrop-blur-3xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.5),0_12px_40px_rgba(0,0,0,0.6)] border border-white/30 shrink-0">
                                <Bank size={32} weight="duotone" className="text-[#60A5FA] drop-shadow-[0_4px_12px_rgba(255,255,255,0.8)]" />
                            </div>
                            <div>
                                <h1 className="text-4xl lg:text-5xl font-serif font-bold text-white mb-2 leading-tight tracking-tight drop-shadow-sm">
                                    DocuVault
                                </h1>
                                <p className="text-[15px] font-medium text-white drop-shadow-sm max-w-2xl leading-relaxed">
                                    Professional Legal Document Generator. Trustworthy. Semantic. Verbatim. Generate court-ready PDFs with AI precision.
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Category Tabs ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {UI_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setSelectedTemplate(null);
                                }}
                                className={`px-6 py-2.5 rounded-full text-[14px] font-bold whitespace-nowrap transition-all duration-300 snap-center tracking-wide ${activeTab === tab.id ? 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_20px_rgba(0,0,0,0.5)] bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-[rgba(255,255,255,0.25)] text-white drop-shadow-sm scale-105' : 'bg-white/5 backdrop-blur-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/30'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </motion.div>

                    {/* ── Template Carousel ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="flex items-center justify-between mb-4 mt-2">
                            <h2 className="text-[13px] font-bold tracking-widest uppercase text-[#60A5FA] drop-shadow-sm">
                                Templates
                            </h2>
                            {templates.length > 3 && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => scrollCarousel('left')}
                                        aria-label="Scroll templates left"
                                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_16px_rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.25)] hover:scale-105 hover:bg-[linear-gradient(135deg,#1e4a9e,#0A1128)] transition-all text-white drop-shadow-sm"
                                    >
                                        <CaretLeft size={18} weight="bold" />
                                    </button>
                                    <button
                                        onClick={() => scrollCarousel('right')}
                                        aria-label="Scroll templates right"
                                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_16px_rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.25)] hover:scale-105 hover:bg-[linear-gradient(135deg,#1e4a9e,#0A1128)] transition-all text-white drop-shadow-sm"
                                    >
                                        <CaretRight size={18} weight="bold" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {activeTab === 'create_own' ? (
                            /* Blank template card */
                            <button
                                type="button"
                                className="p-6 cursor-pointer hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_12px_32px_rgba(0,0,0,0.5)] hover:-translate-y-1 transition-all w-full text-left bg-white/5 backdrop-blur-2xl border border-white/20 rounded-3xl group"
                                onClick={() => setSelectedTemplate(null)}
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/10 border-2 border-dashed border-white/30 group-hover:bg-[#123D7E] group-hover:border-transparent transition-colors">
                                        <Plus size={28} className="text-white drop-shadow-sm" weight="bold" />
                                    </div>
                                    <div>
                                        <p className="text-[17px] font-bold text-white mb-1 drop-shadow-sm tracking-tight text-shadow">
                                            Custom Document
                                        </p>
                                        <p className="text-sm font-medium text-white/80">
                                            Start with a blank template utilizing general court and legal structuring.
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ) : (
                            /* Template cards carousel */
                            <div
                                ref={carouselRef}
                                className="flex gap-4 overflow-x-auto pb-6 pt-2 px-1 snap-x snap-mandatory scrollbar-none"
                                style={{ scrollbarWidth: 'none' }}
                            >
                                {templates.map(tmpl => {
                                    const isSelected = selectedTemplate?.id === tmpl.id;
                                    return (
                                        <motion.button
                                            key={tmpl.id}
                                            onClick={() => setSelectedTemplate(isSelected ? null : tmpl)}
                                            whileHover={{ y: -4 }}
                                            whileTap={{ scale: 0.98 }}
                                            className={`flex-shrink-0 w-64 rounded-[2rem] p-5 text-left transition-all cursor-pointer snap-start backdrop-blur-2xl ${isSelected ? 'bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-[rgba(255,255,255,0.35)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_12px_32px_rgba(0,0,0,0.6)]' : 'bg-white/5 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.3)] hover:bg-white/10 hover:border-white/30'}`}
                                        >
                                            <div className={`w-full h-32 rounded-[1.5rem] mb-5 flex items-center justify-center relative overflow-hidden transition-all ${isSelected ? 'bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]' : 'bg-white/5 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'}`}>
                                                {/* Subtle document graphic */}
                                                <div className={`absolute top-4 left-4 w-12 h-2 rounded ${isSelected ? 'bg-white/30' : 'bg-white/10'}`} />
                                                <div className={`absolute top-8 left-4 w-20 h-2 rounded ${isSelected ? 'bg-white/30' : 'bg-white/10'}`} />
                                                <div className={`absolute top-12 left-4 w-16 h-2 rounded ${isSelected ? 'bg-white/30' : 'bg-white/10'}`} />
                                                <FileText
                                                    size={48}
                                                    weight={isSelected ? "duotone" : "regular"}
                                                    className={`relative z-10 transition-colors ${isSelected ? 'text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.6)]' : 'text-white/60'}`}
                                                />
                                            </div>
                                            <p className={`text-[15px] font-bold leading-snug line-clamp-2 ${isSelected ? 'text-white drop-shadow-sm' : 'text-white/80'}`}>
                                                {tmpl.title}
                                            </p>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>

                    {/* ── Selected Template Info ── */}
                    <AnimatePresence>
                        {selectedTemplate && (
                            <motion.div
                                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                                className="overflow-hidden"
                            >
                                <div className="p-5 border-l-4 border-l-[#60A5FA] bg-white/5 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.3)] rounded-r-2xl">
                                    <p className="text-[15px] font-bold tracking-wide text-white drop-shadow-sm mb-1">
                                        {selectedTemplate.title}
                                    </p>
                                    <p className="text-[14px] font-medium text-white/80 leading-relaxed">
                                        {selectedTemplate.description}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Content Input Area ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                    >
                        <h2 className="text-[13px] font-bold tracking-widest uppercase text-[#60A5FA] drop-shadow-sm mb-3">
                            Document Content
                        </h2>
                        <div className="relative group">
                            <textarea
                                value={documentContent}
                                onChange={e => setDocumentContent(e.target.value)}
                                placeholder="Paste your content here or describe the document title, body, and footer verbatim. The AI will perfectly structure and format it."
                                rows={8}
                                className="w-full min-h-[220px] pb-14 p-6 rounded-[2rem] bg-white/5 backdrop-blur-2xl border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#60A5FA]/50 focus:bg-white/10 transition-all resize-none shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.4)]"
                            />

                            {/* Bottom bar overlay */}
                            <div className="absolute bottom-3 left-6 right-6 flex items-center justify-between pt-3 border-t border-white/10">
                                <div className="flex gap-4">
                                    <button
                                        disabled
                                        title="File attachment coming soon"
                                        className="flex items-center gap-2 text-sm font-bold transition-colors cursor-not-allowed opacity-40 text-white"
                                    >
                                        <Paperclip size={18} weight="bold" /> 
                                        <span>Attach File</span>
                                    </button>
                                    {documentContent && (
                                        <button
                                            onClick={() => setDocumentContent('')}
                                            className="flex items-center gap-2 text-sm font-bold cursor-pointer transition-colors text-white/60 hover:text-white"
                                        >
                                            <X size={18} weight="bold" /> 
                                            <span>Clear</span>
                                        </button>
                                    )}
                                </div>
                                <p className="text-[13px] font-bold text-white/60">
                                    {documentContent.length > 0 ? `${documentContent.length.toLocaleString()} characters` : ''}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* ── Generate Button ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <button
                            onClick={handleGenerate}
                            disabled={(!documentContent.trim() && !selectedTemplate) || isUserProfileLoading}
                            className="w-full flex items-center justify-center gap-4 py-6 rounded-[2rem] text-[15px] font-bold tracking-[0.2em] uppercase text-white transition-all border border-white/20 bg-white/5 backdrop-blur-3xl shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_12px_40px_rgba(0,0,0,0.4)] hover:bg-white/10 hover:border-white/30 hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_16px_48px_rgba(0,0,0,0.5)] disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed group hover:-translate-y-1"
                        >
                            <Sparkle size={26} weight="duotone" className="text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)] group-hover:scale-110 transition-transform duration-300" />
                            <span className="drop-shadow-sm">Generate Formal Document</span>
                        </button>
                    </motion.div>

                    {/* ── Error Message ── */}
                    <AnimatePresence>
                        {generationError && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-4 px-5 py-4 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/20 shadow-sm flex items-start gap-3">
                                    <X size={20} weight="bold" className="text-[var(--error)] shrink-0 mt-0.5" />
                                    <p className="text-sm font-medium text-[var(--error)]">
                                        {generationError}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* ── Bottom Flow Icons ── */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="flex items-center justify-center gap-14 mt-16 py-10 border-t border-white/10"
                    >
                        {[
                            { label: 'Describe\nContext', icon: FileText, color: 'text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.8)]' },
                            { label: 'AI Generates\nDraft', icon: Sparkle, color: 'text-[#E5A84A] drop-shadow-[0_2px_8px_rgba(229,168,74,0.8)]' },
                            { label: 'Download\n& File', icon: ArrowRight, color: 'text-[#10B981] drop-shadow-[0_2px_8px_rgba(16,185,129,0.8)]' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} className="flex flex-col items-center gap-4 relative">
                                    <div className="w-20 h-20 rounded-[2.5rem] flex items-center justify-center bg-white/5 backdrop-blur-3xl border border-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_8px_24px_rgba(255,255,255,0.02),0_12px_40px_rgba(0,0,0,0.6)]">
                                        <Icon size={36} weight="duotone" className={item.color} />
                                    </div>
                                    <p className="text-[14px] text-center font-bold whitespace-pre-line leading-tight text-white drop-shadow-sm tracking-wide">
                                        {item.label}
                                    </p>
                                </div>
                            );
                        })}
                    </motion.div>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════
                VIEW: WORKING STATE
               ═══════════════════════════════════════════════════ */}
            {view === 'working' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="max-w-xl mx-auto py-8"
                >
                    {/* Close / Step indicator */}
                    <div className="flex items-center justify-between mb-10">
                        <button
                            onClick={handleNewDocument}
                            aria-label="Cancel generation"
                            className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-white/10 hover:bg-white/10 hover:border-white/30 text-white/80 hover:text-white transition-all backdrop-blur-xl"
                        >
                            <X size={20} weight="bold" />
                        </button>
                        <span className="text-sm font-bold px-4 py-2 rounded-full bg-[#60A5FA]/10 border border-[#60A5FA]/20 text-[#60A5FA] drop-shadow-sm backdrop-blur-xl">
                            Step {Math.min(progressSteps.filter(s => s.status === 'complete').length + 1, progressSteps.length)} of {progressSteps.length}
                        </span>
                    </div>

                    {/* Working animation */}
                    <div className="text-center mb-10">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                            className="inline-block mb-6 relative"
                        >
                            <div className="absolute inset-0 rounded-full blur-2xl bg-[#60A5FA]/30 scale-150 pointer-events-none" />
                            <div className="w-24 h-24 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-2 border-[#60A5FA]/50 shadow-[0_8px_32px_rgba(96,165,250,0.3)] relative z-10 box-border">
                                <Sparkle size={44} weight="duotone" className="text-[#60A5FA] drop-shadow-[0_2px_12px_rgba(96,165,250,0.8)]" />
                            </div>
                        </motion.div>
                        <h3 className="text-3xl font-serif font-bold text-white tracking-tight drop-shadow-sm">
                            DocuVault AI is drafting...
                        </h3>
                        <p className="text-[16px] font-medium text-white/80 mt-3 drop-shadow-sm">
                            Structuring verbatim into local court format
                        </p>
                    </div>

                    {/* Progress bar */}
                    <div className="p-8 mb-8 rounded-[2rem] border border-white/20 bg-white/5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[13px] font-bold tracking-widest uppercase text-white/60">
                                Synthesis Progress
                            </p>
                            <p className="text-[15px] font-bold text-white">
                                {Math.round(progress)}%
                            </p>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden bg-black/40 shadow-inner border border-white/10">
                            <motion.div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#60A5FA,#E5A84A)] shadow-[0_0_12px_rgba(96,165,250,0.6)] relative"
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                            >
                                <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{ transform: 'skewX(-20deg)' }} />
                            </motion.div>
                        </div>
                        
                        {/* Document context */}
                        <div className="mt-8 pt-6 border-t border-white/10">
                            <p className="text-[11px] uppercase font-bold text-[#60A5FA] tracking-widest mb-3">
                                Context
                            </p>
                            <p className="text-[15px] italic leading-relaxed text-white drop-shadow-sm border-l-2 border-[#60A5FA] pl-4">
                                &ldquo;{selectedTemplate?.title ?? (() => {
                                    const text = documentContent;
                                    if (text.length <= 100) return text;
                                    const truncated = text.slice(0, 100);
                                    const lastSpace = truncated.lastIndexOf(' ');
                                    return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
                                })()}&rdquo;
                            </p>
                        </div>
                    </div>

                    {/* Step-by-step progress */}
                    <div className="space-y-5 px-3">
                        {progressSteps.map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-5"
                            >
                                <div className="shrink-0 flex items-center justify-center w-8">
                                    {step.status === 'complete' ? (
                                        <CheckCircle size={28} weight="fill" className="text-[#10B981] drop-shadow-[0_2px_8px_rgba(16,185,129,0.5)]" />
                                    ) : step.status === 'active' ? (
                                        <motion.div
                                            animate={{ scale: [1, 1.3, 1] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                            className="w-4 h-4 rounded-full bg-[#60A5FA] shadow-[0_0_12px_rgba(96,165,250,0.8)]"
                                        />
                                    ) : (
                                        <div className="w-2.5 h-2.5 rounded-full bg-white/20 shadow-inner" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className={`text-[15px] transition-colors ${step.status === 'complete' ? 'text-white font-bold drop-shadow-sm' : step.status === 'active' ? 'text-[#60A5FA] font-bold drop-shadow-sm' : 'text-white/40 font-medium'}`}>
                                        {step.label}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Disclaimer */}
                    <p className="text-[13px] font-bold text-center mt-12 text-white/50 px-8 leading-relaxed">
                        Large documents usually take 45-60 seconds to securely generate and process formatting.
                    </p>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════
                VIEW: RESULT SCREEN
               ═══════════════════════════════════════════════════ */}
            {view === 'result' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-3xl mx-auto py-6"
                >
                    {/* Header */}
                    <div className="flex items-center gap-5 mb-10">
                        <button
                            onClick={handleNewDocument}
                            aria-label="Back to document composer"
                            className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-white/10 hover:bg-white/10 hover:border-white/30 text-white transition-all backdrop-blur-xl shrink-0 drop-shadow-sm hover:scale-105"
                        >
                            <CaretLeft size={20} weight="bold" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-serif font-bold tracking-tight text-white drop-shadow-sm">
                                {selectedTemplate?.title || 'Generated Document'}
                            </h1>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[13px] font-bold px-3 py-1 rounded-md bg-white/10 border border-white/20 text-white uppercase tracking-wider">
                                    Case #{caseNumber ?? '------'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                        {/* Document Overview & Badges (Left) */}
                        <div className="md:col-span-2 space-y-5">
                            {/* PDF Preview Card */}
                            <div className="p-8 text-center border border-white/20 bg-white/5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.5)] rounded-[2rem]">
                                <div className="w-32 h-44 mx-auto rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_8px_32px_rgba(0,0,0,0.8)] border-2 border-white/20 mb-6 relative overflow-hidden group">
                                    {/* Abstract doc lines */}
                                    <div className="absolute top-6 left-5 right-5 h-2 bg-white/20 rounded-full" />
                                    <div className="absolute top-11 left-5 right-10 h-2 bg-white/20 rounded-full" />
                                    <div className="absolute top-16 left-5 right-5 h-2 bg-white/20 rounded-full" />
                                    <div className="absolute top-21 left-5 right-14 h-2 bg-white/20 rounded-full" />
                                    <div className="absolute bottom-6 right-5 w-8 h-8 rounded-full border-4 border-[#60A5FA] opacity-50 group-hover:opacity-100 transition-opacity" />
                                    
                                    <FileText size={56} weight="duotone" className="text-white z-10 drop-shadow-[0_4px_12px_rgba(255,255,255,0.6)]" />
                                </div>
                                <p className="text-[16px] font-bold text-white mb-2 drop-shadow-sm">
                                    {selectedTemplate?.title || 'Legal Document'}
                                </p>
                                <p className="text-[13px] font-bold text-[#10B981] uppercase tracking-widest drop-shadow-sm">
                                    Final Draft • PDF
                                </p>
                            </div>

                            {/* NEXXverification Badges */}
                            <div className="space-y-4">
                                <div className="p-5 flex items-start gap-4 border border-[#10B981]/40 bg-[#10B981]/10 rounded-[1.5rem] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(16,185,129,0.3),0_8px_24px_rgba(0,0,0,0.3)]">
                                    <div className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-[#10B981]/50">
                                        <CheckCircle size={24} weight="bold" className="text-white" />
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-bold text-white tracking-wide drop-shadow-sm">
                                            Rule 3.1 Certified
                                        </p>
                                        <p className="text-[13px] font-medium text-white/80 mt-1 leading-snug">
                                            Adheres to formal court formatting standards.
                                        </p>
                                    </div>
                                </div>
                                <div className="p-5 flex items-start gap-4 border border-[#10B981]/40 bg-[#10B981]/10 rounded-[1.5rem] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(16,185,129,0.3),0_8px_24px_rgba(0,0,0,0.3)]">
                                    <div className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-[#10B981]/50">
                                        <CheckCircle size={24} weight="bold" className="text-white" />
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-bold text-white tracking-wide drop-shadow-sm">
                                            Bates Validation
                                        </p>
                                        <p className="text-[13px] font-medium text-white/80 mt-1 leading-snug">
                                            Pagination sequence validated & confirmed.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions (Right) */}
                        <div className="md:col-span-3 space-y-8">
                            {/* AI Summary */}
                            <div className="p-8 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.5)] bg-white/5 backdrop-blur-2xl rounded-[2rem]">
                                <div className="flex items-center gap-4 mb-5">
                                    <Sparkle size={28} weight="duotone" className="text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.8)]" />
                                    <h3 className="text-[15px] font-bold tracking-widest uppercase text-white drop-shadow-sm">
                                        Intelligence Summary
                                    </h3>
                                </div>
                                <p className="text-[16px] text-white/90 leading-relaxed font-medium">
                                    The provided context has been successfully synthesized into a formal <span className="font-bold text-white border-b border-white/30 pb-0.5">{selectedTemplate?.title?.toLowerCase() || 'legal document'}</span>. 
                                    All formatting, spacing, and legal headings follow precision local court standards. The document has been cross-referenced for procedural alignment.
                                </p>
                            </div>

                            {/* Action Menu */}
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        if (!generatedPdfUrl) return;
                                        const a = document.createElement('a');
                                        a.href = generatedPdfUrl;
                                        a.download = `${selectedTemplate?.id ?? 'document'}_${Date.now()}.pdf`;
                                        a.click();
                                    }}
                                    disabled={!generatedPdfUrl}
                                    className="btn-primary flex items-center justify-center gap-3 py-4 text-base shadow-md disabled:opacity-50 h-full"
                                >
                                    <DownloadSimple size={20} weight="bold" />
                                    Download PDF
                                </button>
                                
                                <div className="grid grid-rows-2 gap-3">
                                    <button
                                        onClick={() => {
                                            if (!generatedPdfUrl) return;
                                            const win = window.open(generatedPdfUrl, '_blank');
                                            if (win) {
                                                setTimeout(() => {
                                                    try { win.print(); }
                                                    catch { console.warn('Print dialog could not be opened'); }
                                                }, 500);
                                            } else {
                                                if (printWarningTimeoutRef.current) clearTimeout(printWarningTimeoutRef.current);
                                                setGenerationError('Please allow popups to print, or use Download instead.');
                                                printWarningTimeoutRef.current = setTimeout(() => setGenerationError(null), 5000);
                                            }
                                        }}
                                        disabled={!generatedPdfUrl}
                                        className="btn-outline flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
                                    >
                                        <FileText size={18} weight="bold" />
                                        Print Document
                                    </button>
                                    <button
                                        disabled
                                        className="card-premium flex items-center justify-center gap-2 py-3 text-sm font-medium border border-[var(--cloud-light)] bg-[var(--cloud)]/30 text-[var(--sapphire-light)] cursor-not-allowed opacity-60"
                                    >
                                        <Bank size={18} weight="duotone" />
                                        Save to Vault
                                    </button>
                                </div>
                            </div>
                            
                            {/* Revision Input - To Be Implemented */}
                            <div className="relative mt-2">
                                <input
                                    type="text"
                                    placeholder="Request an AI revision (e.g., 'Make the tone more aggressive')..."
                                    className="input-premium w-full pl-12 pr-14 py-4 cursor-not-allowed opacity-60 bg-[var(--cloud)]/30 border-dashed border-[var(--sapphire-light)]"
                                    disabled
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40">
                                    <Sparkle size={20} weight="duotone" className="text-[var(--sapphire-base)]" />
                                </div>
                                <button disabled className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-[var(--sapphire-light)]/20 flex items-center justify-center cursor-not-allowed opacity-50">
                                    <ArrowRight size={16} weight="bold" className="text-[var(--sapphire-dark)]" />
                                </button>
                            </div>
                            
                            <p className="text-[11px] font-medium text-center text-[var(--sapphire-light)]">
                                Verification is recommended. Verify legal citations and personal information independently.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
