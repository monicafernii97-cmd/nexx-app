'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import {
    Bank,
    CaretLeft,
    FileText,
    Strategy,
    Plus,
    Paperclip,
    X,
    ArrowRight,
    CheckCircle,
    DownloadSimple,
    ArrowsClockwise,
    Export,
    Lightning,
    PencilLine,
    ClockCounterClockwise,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { UI_TABS, getTemplatesForTab } from '@/lib/legal/templateCategories';
import type { UITabCategory } from '@/lib/legal/templateCategories';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import type { DocumentTemplate } from '@/lib/legal/types';
import CreateExportModal from './components/CreateExportModal';
import { useWorkspace } from '@/lib/workspace-context';
import { useExport } from './context/ExportContext';
import '@/styles/pipelines.css';

/** State for the 3-step generation flow */
type GeneratorView = 'compose' | 'working' | 'result';

/** Working state progress step */
interface ProgressStep {
    label: string;
    status: 'pending' | 'active' | 'complete';
}

/** Truncate text to maxLen characters, breaking at word boundary when possible. */
const truncateText = (text: string, maxLen = 100) => {
    if (text.length <= maxLen) return text;
    const truncated = text.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...';
};

/** Wrapper with Suspense boundary for useSearchParams */
export default function DocuVaultPage() {
    return (
        <Suspense fallback={<div className="max-w-5xl mx-auto flex items-center justify-center min-h-[50vh]" role="status" aria-live="polite"><div className="w-8 h-8 rounded-full border-2 border-[var(--champagne)] border-t-transparent animate-spin" /><span className="sr-only">Loading DocuVault…</span></div>}>
            <DocuVaultPageInner />
        </Suspense>
    );
}

/** DocuVault document generator page with intake hub, compose, working, and result views. */
function DocuVaultPageInner() {
    const searchParams = useSearchParams();
    const { userId } = useUser();
    const { activeCaseId } = useWorkspace();
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');
    const courtSettings = useQuery(api.courtSettings.get);
    const drafts = useQuery(api.courtDocumentDrafts.listByUser, { limit: 5 });
    /** True while user profile query is in-flight (prevents generation with wrong defaults). */
    const isUserProfileLoading = Boolean(userId) && (user === undefined || courtSettings === undefined);

    // Resolved court settings — courtSettings table is canonical, user profile is fallback
    const resolvedState = courtSettings?.state || user?.state || '';
    const resolvedCounty = courtSettings?.county || user?.county || '';

    // Tab & template state
    const [activeTab, setActiveTab] = useState<UITabCategory>('lead');
    const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);


    // Content input state
    const [documentContent, setDocumentContent] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Flow state
    const [view, setView] = useState<'hub' | 'working' | 'result'>('hub');
    const [progress, setProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    /** Metadata returned from the Quick Generate stream (no binary). */
    type QuickGenResult = {
      artifactId: string;
      filename: string;
      byteLength: number;
      sha256: string;
      downloadUrl: string;
    };
    const [generatedResult, setGeneratedResult] = useState<QuickGenResult | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [caseNumber, setCaseNumber] = useState<string | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const parseAbortRef = useRef<AbortController | null>(null);

    // Structured export modal state
    const [showCreateExport, setShowCreateExport] = useState(false);
    const { startStructuredExport } = useExport();

    // Abort mechanism for generation
    const generationTokenRef = useRef(0);
    const completedRef = useRef(false);
    const generationAbortRef = useRef<AbortController | null>(null);
    /** Tracks the active timeout for the popup-blocked print warning so rapid clicks don't race. */
    const printWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Abort streams on unmount
    useEffect(() => {
        return () => {
            parseAbortRef.current?.abort();
            parseAbortRef.current = null;
            generationAbortRef.current?.abort();
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
                    setView('hub');
                    break;
                }
            }
            initialSelectionDoneRef.current = matched;
        }
    }, [searchParams]);



    /** Handle document generation via the streaming API endpoint. */
    const handleGenerate = useCallback(async () => {
        if (isParsing) return;
        if (!documentContent.trim() && !selectedTemplate) return;
        if (isUserProfileLoading) {
            setGenerationError('Loading your profile. Please try again in a moment.');
            return;
        }

        // Fail fast if required profile data is missing
        if (!resolvedState || !resolvedCounty) {
            setGenerationError('Please set your state and county in Court Settings (Legal Suite → Court Settings) before generating documents.');
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
        setGeneratedResult(null);

        const steps: ProgressStep[] = [
            { label: 'Analyzing Legal Frameworks', status: 'active' },
            { label: 'Normalizing Document Content', status: 'pending' },
            { label: 'Applying Court Formatting', status: 'pending' },
            { label: 'NEXXverification Compliance', status: 'pending' },
            { label: 'Rendering & Storing PDF', status: 'pending' },
        ];
        setProgressSteps(steps);

        try {
            const res = await fetch('/api/documents/generate/stream', {
                signal: controller.signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: selectedTemplate?.id ?? 'general',
                    courtSettings: {
                        state: resolvedState,
                        county: resolvedCounty,
                    },
                    petitioner: { name: courtSettings?.petitionerLegalName || user?.name || 'Petitioner' },
                    caseType: selectedTemplate?.caseTypes?.[0] ?? undefined,
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

                // Parse SSE events (separated by \n\n)
                let boundaryIndex: number;
                while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, boundaryIndex);
                    buffer = buffer.slice(boundaryIndex + 2);

                    if (generationTokenRef.current !== currentToken) return;

                    const parsed = parseSseEvent(rawEvent);
                    if (!parsed) continue;

                    const { event: eventName, data } = parsed;

                    // Handle progress events
                    if (eventName === 'progress' && data?.progress != null) {
                        setProgress(data.progress);

                        // Map SSE step names to UI step indices
                        const stepMap: Record<string, number> = {
                            analyzing: 0, normalizing: 1, formatting: 2, compliance: 3, pdf: 4, storing: 4,
                        };
                        const stepIdx = stepMap[data.step] ?? -1;
                        if (stepIdx >= 0) {
                            setProgressSteps(prev => prev.map((s, idx) => ({
                                ...s,
                                status: idx < stepIdx ? 'complete' as const
                                    : idx === stepIdx ? 'active' as const
                                    : 'pending' as const,
                            })));
                        }
                    }

                    // Handle error events
                    if (eventName === 'error') {
                        throw new Error(data?.message ?? 'Generation failed');
                    }

                    // Handle completion — metadata only, no binary
                    if (eventName === 'complete' && data?.artifactId) {
                        if (generationTokenRef.current !== currentToken) return;
                        completedRef.current = true;
                        setGeneratedResult({
                            artifactId: data.artifactId,
                            filename: data.filename,
                            byteLength: data.byteLength,
                            sha256: data.sha256,
                            downloadUrl: data.downloadUrl,
                        });
                        setCaseNumber(data.filename?.replace('.pdf', '') ?? 'document');
                        setView('result');
                    }
                }
            }

            // If stream ended without a complete event, treat as incomplete
            if (generationTokenRef.current === currentToken && !completedRef.current) {
                setGenerationError('Document generation incomplete. Please try again.');
                setView('hub');
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            if (generationTokenRef.current !== currentToken) return;
            console.error('[DocuVault Generation Error]', error);
            setGenerationError(error instanceof Error ? error.message : 'Generation failed');
            setView('hub');
        }
    }, [documentContent, selectedTemplate, isUserProfileLoading, resolvedState, resolvedCounty, courtSettings?.petitionerLegalName, user?.name]);

    /** Parse a raw SSE event block into event name + data. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function parseSseEvent(rawEvent: string): { event: string; data: Record<string, any> } | null {
        const lines = rawEvent.split(/\r?\n/);
        let event = 'message';
        const dataLines: string[] = [];

        for (const line of lines) {
            if (!line || line.startsWith(':')) continue;
            if (line.startsWith('event:')) {
                event = line.slice('event:'.length).trim();
                continue;
            }
            if (line.startsWith('data:')) {
                dataLines.push(line.slice('data:'.length).trimStart());
            }
        }

        if (dataLines.length === 0) return null;
        try {
            return { event, data: JSON.parse(dataLines.join('\n')) };
        } catch {
            console.warn('[DocuVault] Malformed SSE data:', dataLines.join('\n'));
            return null;
        }
    }

    /** Reset all state to begin composing a new document, aborting any in-flight generation. */
    const handleNewDocument = useCallback(() => {
        // Clear any pending print-warning timer
        if (printWarningTimeoutRef.current) {
            clearTimeout(printWarningTimeoutRef.current);
            printWarningTimeoutRef.current = null;
        }

        // Abort any in-flight parse
        parseAbortRef.current?.abort();
        parseAbortRef.current = null;
        setIsParsing(false);

        // Increment token to abort any running generation
        generationTokenRef.current++;
        generationAbortRef.current?.abort();
        generationAbortRef.current = null;

        setView('hub');
        setSelectedTemplate(null);
        setDocumentContent('');
        setProgress(0);
        setProgressSteps([]);
        setGeneratedResult(null);
        setGenerationError(null);
        setCaseNumber(null);
    }, []);

    return (
        <PageContainer lockHeight>
            {/* ═══════════════════════════════════════════════════
                VIEW: HUB (Intake & Recent Documents)
               ═══════════════════════════════════════════════════ */}
            <AnimatePresence mode="wait">
            {view === 'hub' && (
                <motion.div
                    key="hub"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-h-0 flex flex-col w-full pb-4 gap-6"
                >
                    {/* Zone 1: Intake Hub (Top 55%) */}
                    <div className="flex-[0.55] min-h-0 flex flex-col space-y-3">
                        {/* Header with Navigation */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-serif text-white tracking-tight leading-none mb-1">DocuVault</h1>
                                <p className="text-[9px] text-white/20 font-bold uppercase tracking-[0.2em]">Intake & Templates</p>
                            </div>
                            
                            {/* Status Pills */}
                            <div className="flex items-center gap-2.5">
                                <div className="px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-bold uppercase tracking-widest">
                                    Draft Mode
                                </div>
                                <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                                    Jurisdiction: {resolvedState || 'Not Set'}
                                </div>
                            </div>
                        </div>

                    {/* Error banner */}
                    <AnimatePresence>
                        {generationError && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div role="alert" aria-live="assertive" className="px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                                    <X size={20} weight="bold" className="text-red-400 shrink-0" />
                                    <p className="text-sm font-medium text-red-400">{generationError}</p>
                                    <button onClick={() => setGenerationError(null)} aria-label="Dismiss generation error" className="ml-auto text-red-400/60 hover:text-red-400 cursor-pointer">
                                        <X size={16} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Main Hyperglass Container */}
                    <div className="hyper-glass overflow-hidden flex flex-col md:flex-row flex-1 min-h-0">
                        
                        {/* Left: Content Area */}
                        <div className="flex-1 flex flex-col border-r border-white/5">
                            {/* Inner Tabs */}
                            <div className="flex items-center gap-8 px-8 pt-8 pb-4 border-b border-white/5">
                                {UI_TABS.map(tab => (
                                        <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setSelectedTemplate(null);
                                        }}
                                        className={`group relative pb-4 text-[11px] font-bold uppercase tracking-[0.2em] transition-all ${
                                            activeTab === tab.id ? 'text-white' : 'text-white/20 hover:text-white/60'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {tab.id === 'create_own' ? <Plus size={14} /> : <FileText size={14} />}
                                            {tab.label}
                                        </div>
                                        {activeTab === tab.id && (
                                            <motion.div 
                                                layoutId="activeTabUnderline"
                                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" 
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Editor Area */}
                            <div className="flex-1 p-8 flex flex-col">
                                <div className="flex-1 relative group">
                                    <textarea
                                        value={documentContent}
                                        onChange={e => setDocumentContent(e.target.value)}
                                        placeholder="Paste your draft or notes here to begin... NEXX will perfectly structure and format it for court."
                                        aria-label="Document content"
                                        className="w-full h-full bg-white/5 rounded-2xl p-6 text-base font-medium text-white placeholder:text-white/10 outline-none resize-none transition-all focus:bg-white/[0.07] border border-white/5 focus:border-white/10"
                                    />
                                    
                                    {/* Action Bar Floating Over Textarea */}
                                    <div className="absolute bottom-6 right-6 flex items-center gap-3">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isParsing}
                                            className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isParsing ? (
                                                <ArrowsClockwise size={16} className="animate-spin" />
                                            ) : (
                                                <Paperclip size={16} />
                                            )}
                                            {isParsing ? 'Parsing...' : 'Upload'}
                                        </button>
                                        <input type="file" ref={fileInputRef} accept=".pdf,.docx,.txt,.md,.csv,text/*" className="hidden" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;

                                            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (matches server limit)
                                            if (file.size > MAX_FILE_SIZE) {
                                                setGenerationError('File exceeds 10 MB limit. Please use a smaller file.');
                                                e.target.value = '';
                                                return;
                                            }

                                            const name = file.name.toLowerCase();
                                            const isBinary = name.endsWith('.pdf') || name.endsWith('.docx');

                                            // Reject unsupported file types before entering parsing state
                                            const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv'];
                                            const hasSupported = SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
                                            const isTextMime = file.type.startsWith('text/');
                                            if (!hasSupported && !isTextMime) {
                                                setGenerationError('Unsupported file type. Please upload PDF, DOCX, TXT, MD, or CSV files.');
                                                e.target.value = '';
                                                return;
                                            }

                                            // Abort any in-flight parse before starting a new one
                                            parseAbortRef.current?.abort();
                                            const controller = new AbortController();
                                            parseAbortRef.current = controller;
                                            setIsParsing(true);
                                            setGenerationError(null);

                                            try {
                                                let extractedText = '';

                                                if (isBinary) {
                                                    // Convert to base64 via FileReader (avoids O(n²) reduce)
                                                    const base64 = await new Promise<string>((resolve, reject) => {
                                                        const reader = new FileReader();
                                                        reader.onload = () => {
                                                            const dataUrl = reader.result as string;
                                                            // Strip "data:*;base64," prefix
                                                            const commaIdx = dataUrl.indexOf(',');
                                                            resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
                                                        };
                                                        reader.onerror = () => reject(new Error('Failed to read file'));
                                                        reader.readAsDataURL(file);
                                                    });
                                                    if (controller.signal.aborted) return;
                                                    const res = await fetch('/api/documents/parse', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ filename: file.name, data: base64 }),
                                                        signal: controller.signal,
                                                    });
                                                    const result = await res.json();
                                                    if (!res.ok) throw new Error(result.error || 'Parse failed');
                                                    extractedText = result.text;
                                                } else {
                                                    // Read plain text client-side
                                                    extractedText = await file.text();
                                                }

                                                if (controller.signal.aborted) return;
                                                if (extractedText.trim()) {
                                                    setDocumentContent(prev => prev ? prev + '\n\n' + extractedText : extractedText);
                                                } else {
                                                    setGenerationError('No text could be extracted from this file.');
                                                }
                                            } catch (err) {
                                                if (err instanceof DOMException && err.name === 'AbortError') return;
                                                if (controller.signal.aborted) return;
                                                console.error('[File Upload Error]', err);
                                                setGenerationError(err instanceof Error ? err.message : 'Failed to read file. Please paste content manually.');
                                            } finally {
                                                if (!controller.signal.aborted) setIsParsing(false);
                                            }
                                            // Reset input so the same file can be selected again
                                            e.target.value = '';
                                        }} />
                                        
                                        <button
                                            onClick={handleGenerate}
                                            disabled={isParsing || (!documentContent.trim() && !selectedTemplate)}
                                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                                        >
                                            <Lightning size={14} weight="fill" />
                                            Generate PDF
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Quick Templates Sidebar */}
                        <div className="w-full md:w-64 bg-white/[0.02] p-5 flex flex-col space-y-5">
                            <div>
                                <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-[0.25em] mb-5">Quick Templates</h3>
                                <div className="space-y-3">
                                    {templates.slice(0, 6).map(tmpl => {
                                        const isSelected = selectedTemplate?.id === tmpl.id;
                                        return (
                                            <button
                                                key={tmpl.id}
                                                onClick={() => setSelectedTemplate(isSelected ? null : tmpl)}
                                                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 group ${
                                                    isSelected 
                                                    ? 'bg-indigo-500/10 border-indigo-500/40 text-white' 
                                                    : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10 hover:text-white'
                                                }`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isSelected ? 'bg-indigo-500/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                                                    <FileText size={16} weight={isSelected ? "fill" : "regular"} />
                                                </div>
                                                <span className="text-[11px] font-bold truncate flex-1">{tmpl.title}</span>
                                                {isSelected && <CheckCircle size={14} weight="fill" className="text-indigo-400" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-auto pt-8 border-t border-white/5">
                                <button
                                    onClick={() => setShowCreateExport(true)}
                                    disabled={isParsing}
                                    className="w-full py-3.5 rounded-xl bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-white/20 text-white text-[11px] font-bold uppercase tracking-widest hover:border-white/40 transition-all flex items-center justify-center gap-2 group shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Export size={16} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                                    {isParsing ? 'Parsing...' : 'Full Case Export'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Create Export Modal */}
                    <CreateExportModal
                        isOpen={showCreateExport}
                        onClose={() => setShowCreateExport(false)}
                        onSubmit={async (config) => {
                            if (isParsing) return;
                            setShowCreateExport(false);
                            try {
                                await startStructuredExport({
                                    ...config,
                                    pastedContent: documentContent || undefined,
                                });
                            } catch (err) {
                                console.error('[DocuVault] Export start failed:', err);
                                setGenerationError(err instanceof Error ? err.message : 'Export failed. Please try again.');
                            }
                        }}
                        defaultCaseId={activeCaseId ?? undefined}
                        lockCaseSelection={!!activeCaseId}
                    />

                    </div>

                    {/* Zone 2: Recent Documents Grid (Bottom 45%) */}
                    <div className="flex-[0.45] min-h-0 flex flex-col space-y-3 pt-2">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[10px] font-bold text-white/60 uppercase tracking-[0.15em] flex items-center gap-2">
                                <ClockCounterClockwise size={16} /> Recent Documents
                            </h3>
                            <Link href="/docuvault/gallery" className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">
                                View All
                            </Link>
                        </div>
                        
                        {/* 5-Column Grid */}
                        <div className="flex-1 min-h-0">
                            {drafts === undefined ? (
                                <div className="w-full h-full flex items-center justify-center" role="status" aria-live="polite">
                                    <div aria-hidden="true" className="w-6 h-6 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                                    <span className="sr-only">Loading recent documents</span>
                                </div>
                            ) : drafts.length === 0 ? (
                                <div className="w-full h-full flex items-center justify-center text-center text-white/20 text-[10px] font-bold uppercase tracking-widest bg-white/5 rounded-2xl border border-white/5">
                                    No drafts yet
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 h-full">
                                    {drafts.map(draft => (
                                        <Link key={draft.documentId} href={`/docuvault/review/${draft.documentId}`} className="no-underline block h-full">
                                            <div className="hyper-glass h-full flex flex-col p-4 relative group hover:glow-slate hover:border-indigo-500/30 cursor-pointer transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-bold uppercase tracking-widest text-indigo-400">
                                                        {draft.status === 'drafting' ? 'Draft' : draft.status === 'ready_to_export' ? 'Ready' : draft.status}
                                                    </div>
                                                </div>
                                                <h4 className="text-[13px] font-bold text-white truncate mb-4 group-hover:text-indigo-200 transition-colors">{draft.title || 'Untitled'}</h4>
                                                
                                                {/* Skeleton lines */}
                                                <div className="space-y-2 mt-auto opacity-50 group-hover:opacity-100 transition-opacity">
                                                    <div className="h-[2px] bg-white/20 rounded w-full"></div>
                                                    <div className="h-[2px] bg-white/20 rounded w-4/5"></div>
                                                    <div className="h-[2px] bg-white/20 rounded w-[90%]"></div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════
                VIEW: WORKING STATE
               ═══════════════════════════════════════════════════ */}
            {view === 'working' && (
                <motion.div
                    key="working"
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
                            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-2 border-[#60A5FA]/50 shadow-[0_8px_32px_rgba(96,165,250,0.3)] relative z-10 box-border">
                                <Strategy size={32} weight="duotone" className="text-[#60A5FA] drop-shadow-[0_2px_12px_rgba(96,165,250,0.8)]" />
                            </div>
                        </motion.div>
                        <h3 className="text-2xl font-serif font-bold text-white tracking-tight drop-shadow-sm">
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
                                &ldquo;{selectedTemplate?.title ?? truncateText(documentContent)}&rdquo;
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
                    key="result"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-3xl mx-auto py-6"
                >
                    {/* Error banner (e.g. popup blocked for print) */}
                    <AnimatePresence>
                        {generationError && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mb-6"
                            >
                                <div role="alert" aria-live="assertive" className="px-5 py-4 rounded-xl bg-[var(--error)]/5 border border-[var(--error)]/20 shadow-sm flex items-start gap-3">
                                    <X size={20} weight="bold" className="text-[var(--error)] shrink-0 mt-0.5" />
                                    <p className="text-sm font-medium text-[var(--error)]">
                                        {generationError}
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
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
                            <h1 className="text-2xl font-serif font-bold tracking-tight text-white drop-shadow-sm">
                                {selectedTemplate?.title || 'Generated Document'}
                            </h1>
                            <div className="flex items-center gap-2 mt-2">
                                {caseNumber && (
                                    <span className="text-[13px] font-bold px-3 py-1 rounded-md bg-white/10 border border-white/20 text-white uppercase tracking-wider">
                                        Ref: {caseNumber}
                                    </span>
                                )}
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

                            {/* Format indicators — describe how the document was generated, not verified outcomes */}
                            <div className="space-y-4">
                                <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Generation Details</p>
                                {selectedTemplate ? (
                                    <>
                                        <div className="p-5 flex items-start gap-4 border border-[#10B981]/40 bg-[#10B981]/10 rounded-[1.5rem] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(16,185,129,0.3),0_8px_24px_rgba(0,0,0,0.3)]">
                                            <div className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-[#10B981]/50">
                                                <CheckCircle size={24} weight="bold" className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-[15px] font-bold text-white tracking-wide drop-shadow-sm">
                                                    Court Format Applied
                                                </p>
                                                <p className="text-[13px] font-medium text-white/80 mt-1 leading-snug">
                                                    Generated using local court formatting rules. Independent verification recommended.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-5 flex items-start gap-4 border border-[#10B981]/40 bg-[#10B981]/10 rounded-[1.5rem] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(16,185,129,0.3),0_8px_24px_rgba(0,0,0,0.3)]">
                                            <div className="w-10 h-10 rounded-full bg-[#10B981] flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-[#10B981]/50">
                                                <CheckCircle size={24} weight="bold" className="text-white" />
                                            </div>
                                            <div>
                                                <p className="text-[15px] font-bold text-white tracking-wide drop-shadow-sm">
                                                    Page Numbering Included
                                                </p>
                                                <p className="text-[13px] font-medium text-white/80 mt-1 leading-snug">
                                                    Sequential page numbering added per court standards.
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-5 flex items-start gap-4 border border-white/20 bg-white/5 rounded-[1.5rem] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.3)]">
                                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-white/10">
                                            <FileText size={24} weight="bold" className="text-white/80" />
                                        </div>
                                        <div>
                                            <p className="text-[15px] font-bold text-white tracking-wide drop-shadow-sm">
                                                General Formatting
                                            </p>
                                            <p className="text-[13px] font-medium text-white/80 mt-1 leading-snug">
                                                Generated with standard document formatting. No template-specific court rules applied.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Actions (Right) */}
                        <div className="md:col-span-3 space-y-8">
                            {/* AI Summary */}
                            <div className="p-8 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.5)] bg-white/5 backdrop-blur-2xl rounded-[2rem]">
                                <div className="flex items-center gap-4 mb-5">
                                    <Strategy size={28} weight="duotone" className="text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.8)]" />
                                    <h3 className="text-[15px] font-bold tracking-widest uppercase text-white drop-shadow-sm">
                                        Intelligence Summary
                                    </h3>
                                </div>
                                <p className="text-[16px] text-white/90 leading-relaxed font-medium">
                                    The provided context has been synthesized into a formal <span className="font-bold text-white border-b border-white/30 pb-0.5">{selectedTemplate?.title?.toLowerCase() || 'legal document'}</span>. 
                                    {selectedTemplate
                                        ? 'Formatting and legal headings follow local court standards. Please verify all content independently before filing.'
                                        : 'Standard document formatting has been applied. Please verify all content and formatting independently before use.'}
                                </p>
                            </div>

                            {/* Action Menu */}
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        if (!generatedResult?.downloadUrl) return;
                                        const a = document.createElement('a');
                                        a.href = generatedResult.downloadUrl;
                                        a.download = generatedResult.filename;
                                        a.rel = 'noopener';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                    }}
                                    disabled={!generatedResult?.downloadUrl}
                                    className="btn-primary flex items-center justify-center gap-3 py-4 text-base shadow-md disabled:opacity-50 h-full"
                                >
                                    <DownloadSimple size={20} weight="bold" />
                                    Download PDF
                                </button>
                                
                                <div className="grid grid-rows-2 gap-3">
                                    <button
                                        onClick={() => {
                                            if (!generatedResult?.downloadUrl) return;
                                            window.open(generatedResult.downloadUrl, '_blank');
                                        }}
                                        disabled={!generatedResult?.downloadUrl}
                                        className="btn-outline flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
                                    >
                                        <FileText size={18} weight="bold" />
                                        Open PDF
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
                                    <Strategy size={20} weight="duotone" className="text-[var(--sapphire-base)]" />
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
            </AnimatePresence>
        </PageContainer>
    );
}
