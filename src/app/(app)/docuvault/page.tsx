'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect, Suspense } from 'react';
import {
    FileText,
    Plus,
    Paperclip,
    X,
    CheckCircle,
    ArrowsClockwise,
    Export,
    ClockCounterClockwise,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { UI_TABS, getTemplatesForTab } from '@/lib/legal/templateCategories';
import type { UITabCategory } from '@/lib/legal/templateCategories';
import { PageContainer } from '@/components/layout/PageLayout';
import type { DocumentTemplate } from '@/lib/legal/types';
import CreateExportModal from './components/CreateExportModal';
import { useWorkspace } from '@/lib/workspace-context';
import { useExport } from './context/ExportContext';
import '@/styles/pipelines.css';



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

/** DocuVault intake hub — single entry point for all document generation via Review Hub. */
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

    // Error state
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const parseAbortRef = useRef<AbortController | null>(null);

    // Structured export modal state (unified export path)
    const [showCreateExport, setShowCreateExport] = useState(false);
    const { startStructuredExport } = useExport();

    // Abort parse stream on unmount
    useEffect(() => {
        return () => {
            parseAbortRef.current?.abort();
            parseAbortRef.current = null;
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



    return (
        <PageContainer>
            {/* ═══════════════════════════════════════════════════
                VIEW: INTAKE HUB
               ═══════════════════════════════════════════════════ */}
            <div
                    className="flex-1 min-h-0 flex flex-col w-full max-w-5xl mx-auto pb-20 gap-6"
                >
                    {/* Zone 1: Intake Hub — compact */}
                    <div className="lg:flex-[0.35] min-h-0 lg:min-h-[420px] flex flex-col space-y-3">
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
                            <div className="flex items-center gap-6 px-6 pt-6 pb-4 border-b border-white/5">
                                {UI_TABS.map(tab => (
                                        <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setSelectedTemplate(null);
                                        }}
                                        className={`group relative pb-4 text-[9px] font-bold uppercase tracking-[0.2em] transition-all ${
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
                            <div className="flex-1 p-6 flex flex-col">
                                <div className="flex-1 relative group">
                                    <textarea
                                        value={documentContent}
                                        onChange={e => setDocumentContent(e.target.value)}
                                        placeholder="Paste your draft or notes here to begin... NEXX will perfectly structure and format it for court."
                                        aria-label="Document content"
                                        className="w-full h-full bg-white/5 rounded-2xl p-6 text-base font-medium text-white placeholder:text-white/10 outline-none resize-none transition-all focus:bg-white/[0.07] border border-white/5 focus:border-white/10"
                                    />

                                </div>
                            </div>
                        </div>

                        {/* Right: Quick Templates Sidebar */}
                        <div className="w-full md:w-56 bg-white/[0.02] p-4 flex flex-col space-y-4">
                            <div>
                                <h3 className="text-[10px] font-bold text-white/20 uppercase tracking-[0.25em] mb-5">Quick Templates</h3>
                                <div className="space-y-3">
                                    {templates.slice(0, 6).map(tmpl => {
                                        const isSelected = selectedTemplate?.id === tmpl.id;
                                        return (
                                            <button
                                                key={tmpl.id}
                                                onClick={() => setSelectedTemplate(isSelected ? null : tmpl)}
                                                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 group ${
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


                        </div>
                    </div>

                    {/* Create Export Modal */}
                    <CreateExportModal
                        isOpen={showCreateExport}
                        onClose={() => setShowCreateExport(false)}
                        onSubmit={async (config) => {
                            if (isParsing || isUserProfileLoading) {
                                setGenerationError(isParsing ? 'Please wait — file is still being parsed.' : 'Loading your profile. Please try again in a moment.');
                                return;
                            }
                            try {
                                await startStructuredExport({
                                    ...config,
                                    pastedContent: documentContent || undefined,
                                });
                                setShowCreateExport(false);
                            } catch (err) {
                                console.error('[DocuVault] Export start failed:', err);
                                setGenerationError(err instanceof Error ? err.message : 'Export failed. Please try again.');
                            }
                        }}
                        defaultCaseId={activeCaseId ?? undefined}
                        lockCaseSelection={!!activeCaseId}
                    />

                    </div>

                    {/* Zone 2: Recent Documents Grid — expanded */}
                    <div className="lg:flex-[0.65] min-h-0 lg:min-h-[320px] flex flex-col space-y-3 pt-2">
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
                                <div className="w-full min-h-[160px] flex items-center justify-center text-center text-white/30 text-[11px] font-bold uppercase tracking-widest bg-white/5 rounded-2xl border border-white/10 shadow-sm">
                                    No drafts yet
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                </div>

                {/* ── Sticky Action Bar ── */}
                <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[rgba(10,17,40,0.85)] backdrop-blur-xl">
                    <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
                        {/* Left: Upload */}
                        <div className="flex items-center gap-3">
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

                                const MAX_FILE_SIZE = 10 * 1024 * 1024;
                                if (file.size > MAX_FILE_SIZE) {
                                    setGenerationError('File exceeds 10 MB limit. Please use a smaller file.');
                                    e.target.value = '';
                                    return;
                                }

                                const name = file.name.toLowerCase();
                                const isBinary = name.endsWith('.pdf') || name.endsWith('.docx');

                                const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv'];
                                const hasSupported = SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
                                const isTextMime = file.type.startsWith('text/');
                                if (!hasSupported && !isTextMime) {
                                    setGenerationError('Unsupported file type. Please upload PDF, DOCX, TXT, MD, or CSV files.');
                                    e.target.value = '';
                                    return;
                                }

                                parseAbortRef.current?.abort();
                                const controller = new AbortController();
                                parseAbortRef.current = controller;
                                setIsParsing(true);
                                setGenerationError(null);

                                try {
                                    let extractedText = '';

                                    if (isBinary) {
                                        const base64 = await new Promise<string>((resolve, reject) => {
                                            const reader = new FileReader();
                                            reader.onload = () => {
                                                const dataUrl = reader.result as string;
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
                                e.target.value = '';
                            }} />
                        </div>

                        {/* Right: Generate PDF */}
                        <button
                            onClick={() => setShowCreateExport(true)}
                            disabled={isParsing || isUserProfileLoading}
                            className="px-6 py-2.5 rounded-xl bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/25 text-white text-[11px] font-bold uppercase tracking-widest shadow-[0_4px_16px_rgba(26,75,155,0.3)] hover:shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:-translate-y-0.5 transition-all flex items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Export size={16} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                            {isParsing ? 'Parsing...' : 'Generate PDF'}
                        </button>
                    </div>
                </div>
        </PageContainer>
    );
}
