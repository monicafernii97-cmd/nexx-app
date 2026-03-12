'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import {
    Landmark,
    ChevronLeft,
    ChevronRight,
    FileText,
    Sparkles,
    Plus,
    Paperclip,
    X,
    Menu,
    Search,
    ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
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

/** DocuVault document generator page with compose, working, and result views. */
export default function DocuVaultPage() {
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

    // Gallery drawer
    const [showGallery, setShowGallery] = useState(false);
    const [gallerySearch, setGallerySearch] = useState('');

    // Get templates for current tab
    const templates = getTemplatesForTab(activeTab);

    // Carousel scroll
    const scrollCarousel = (dir: 'left' | 'right') => {
        if (carouselRef.current) {
            const amount = dir === 'left' ? -240 : 240;
            carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    /** Handle document generation via the streaming API endpoint. */
    const handleGenerate = useCallback(async () => {
        if (!documentContent.trim() && !selectedTemplate) return;

        // Increment token so stale runs can detect cancellation
        const currentToken = ++generationTokenRef.current;

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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: selectedTemplate?.id ?? 'petition_divorce',
                    courtSettings: { state: 'Texas', county: 'Fort Bend' },
                    petitioner: { name: 'Petitioner' },
                    caseType: 'divorce_no_children',
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

                        const bytes = Uint8Array.from(atob(event.result.pdfBase64), c => c.charCodeAt(0));
                        const blob = new Blob([bytes], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);

                        pdfUrlRef.current = url;
                        setGeneratedPdfUrl(url);
                        setCaseNumber(Math.random().toString(36).substr(2, 6).toUpperCase());
                        setView('result');
                    }
                }
            }

            // If stream ended without a complete event, treat as incomplete
            if (generationTokenRef.current === currentToken && !completedRef.current) {
                setGenerationError('Document generation incomplete. Please try again.');
                setView('compose');
            }
        } catch (error) {
            if (generationTokenRef.current !== currentToken) return;
            console.error('[DocuVault Generation Error]', error);
            setGenerationError(error instanceof Error ? error.message : 'Generation failed');
            setView('compose');
        }
    }, [documentContent, selectedTemplate]);

    /** Reset to compose view, aborting any in-flight generation. */
    const handleNewDocument = useCallback(() => {
        // Increment token to abort any running generation
        generationTokenRef.current++;

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
        <div className="max-w-5xl mx-auto relative">
            {/* ═══════════════════════════════════════════════════
                GALLERY DRAWER (LEFT SIDE)
               ═══════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showGallery && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40"
                            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
                            onClick={() => setShowGallery(false)}
                        />
                        {/* Drawer */}
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed left-0 top-0 bottom-0 w-80 z-50 overflow-y-auto"
                            style={{
                                background: 'linear-gradient(180deg, #1A1008 0%, #211607 100%)',
                                borderRight: '1px solid rgba(197, 139, 7, 0.15)',
                            }}
                        >
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-serif font-semibold" style={{ color: '#F5EFE0' }}>
                                        Template Gallery
                                    </h2>
                                    <button
                                        onClick={() => setShowGallery(false)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                        style={{ background: 'rgba(197, 139, 7, 0.08)' }}
                                    >
                                        <X size={16} style={{ color: '#C58B07' }} />
                                    </button>
                                </div>

                                {/* Search */}
                                <div className="relative mb-5">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#5A4A30' }} />
                                    <input
                                        type="text"
                                        value={gallerySearch}
                                        onChange={e => setGallerySearch(e.target.value)}
                                        placeholder="Search templates..."
                                        className="input-gilded pl-9 text-xs"
                                        style={{ fontSize: '12px' }}
                                        aria-label="Search templates"
                                    />
                                </div>

                                {/* Template categories */}
                                {UI_TABS.filter(t => t.id !== 'create_own').map(tab => {
                                    const tabTemplates = getTemplatesForTab(tab.id)
                                        .filter(t => !gallerySearch || t.title.toLowerCase().includes(gallerySearch.toLowerCase()));
                                    return (
                                        <div key={tab.id} className="mb-5">
                                            <h3
                                                className="text-xs font-semibold tracking-[0.15em] uppercase mb-2"
                                                style={{ color: '#92783A' }}
                                            >
                                                {tab.label}
                                                <span className="ml-2" style={{ color: '#5A4A30' }}>
                                                    {tabTemplates.length}
                                                </span>
                                            </h3>
                                            <div className="space-y-1">
                                                {tabTemplates.map(tmpl => (
                                                    <button
                                                        key={tmpl.id}
                                                        onClick={() => {
                                                            setSelectedTemplate(tmpl);
                                                            setActiveTab(tab.id);
                                                            setShowGallery(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all cursor-pointer"
                                                        style={{
                                                            color: selectedTemplate?.id === tmpl.id ? '#C58B07' : '#B8A88A',
                                                            background: selectedTemplate?.id === tmpl.id
                                                                ? 'rgba(197, 139, 7, 0.08)'
                                                                : 'transparent',
                                                        }}
                                                    >
                                                        {tmpl.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Saved Documents Link */}
                                <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(197, 139, 7, 0.1)' }}>
                                    <Link href="/docuvault/gallery" className="no-underline">
                                        <div
                                            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all"
                                            style={{ background: 'rgba(197, 139, 7, 0.05)' }}
                                        >
                                            <FileText size={16} style={{ color: '#C58B07' }} />
                                            <div>
                                                <p className="text-sm font-medium" style={{ color: '#F5EFE0' }}>
                                                    Saved Documents
                                                </p>
                                                <p className="text-xs" style={{ color: '#8A7A60' }}>
                                                    View your document gallery
                                                </p>
                                            </div>
                                            <ArrowRight size={14} className="ml-auto" style={{ color: '#C58B07' }} />
                                        </div>
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════════════════════════════════════════════════
                VIEW: COMPOSE (Main Generator)
               ═══════════════════════════════════════════════════ */}
            {view === 'compose' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start justify-between mb-8"
                    >
                        <div className="flex items-center gap-4">
                            {/* Gallery Toggle (LEFT hamburger) */}
                            <button
                                onClick={() => setShowGallery(true)}
                                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:scale-105"
                                style={{
                                    background: 'rgba(197, 139, 7, 0.08)',
                                    border: '1px solid rgba(197, 139, 7, 0.2)',
                                }}
                            >
                                <Menu size={18} style={{ color: '#C58B07' }} />
                            </button>
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                                        style={{
                                            background: 'rgba(197, 139, 7, 0.12)',
                                            border: '1px solid rgba(197, 139, 7, 0.25)',
                                        }}
                                    >
                                        <Landmark size={20} style={{ color: '#C58B07' }} />
                                    </div>
                                    <h1 className="text-headline text-2xl" style={{ color: '#F5EFE0' }}>
                                        DocuVault
                                    </h1>
                                </div>
                                <p className="text-sm" style={{ color: '#8A7A60' }}>
                                    Professional Legal Document Generator
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-xs mb-6"
                        style={{ color: '#5A4A30' }}
                    >
                        Generate court-ready PDFs with AI precision. Trustworthy. Semantic. Verbatim.
                    </motion.p>

                    {/* ── Category Tabs ── */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex gap-2 mb-6 overflow-x-auto pb-1"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {UI_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setSelectedTemplate(null);
                                }}
                                className="px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer"
                                style={{
                                    background: activeTab === tab.id
                                        ? 'linear-gradient(135deg, #C58B07, #E5B84A)'
                                        : 'rgba(42, 29, 14, 0.4)',
                                    color: activeTab === tab.id ? '#02022d' : '#8A7A60',
                                    border: activeTab === tab.id
                                        ? 'none'
                                        : '1px solid rgba(138, 122, 96, 0.12)',
                                }}
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
                        className="mb-8"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h2
                                className="text-xs font-semibold tracking-[0.15em] uppercase"
                                style={{ color: '#92783A' }}
                            >
                                Templates
                            </h2>
                            {templates.length > 3 && (
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => scrollCarousel('left')}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                        style={{ background: 'rgba(197, 139, 7, 0.06)' }}
                                    >
                                        <ChevronLeft size={14} style={{ color: '#C58B07' }} />
                                    </button>
                                    <button
                                        onClick={() => scrollCarousel('right')}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                                        style={{ background: 'rgba(197, 139, 7, 0.06)' }}
                                    >
                                        <ChevronRight size={14} style={{ color: '#C58B07' }} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {activeTab === 'create_own' ? (
                            /* Blank template card */
                            <div
                                className="card-gilded p-6 cursor-pointer transition-all hover:scale-[1.01]"
                                onClick={() => setSelectedTemplate(null)}
                                style={{
                                    borderColor: 'rgba(197, 139, 7, 0.25)',
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-xl flex items-center justify-center"
                                        style={{
                                            background: 'rgba(197, 139, 7, 0.08)',
                                            border: '1px dashed rgba(197, 139, 7, 0.3)',
                                        }}
                                    >
                                        <Plus size={22} style={{ color: '#C58B07' }} />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm mb-0.5" style={{ color: '#F5EFE0' }}>
                                            Custom Document
                                        </p>
                                        <p className="text-xs" style={{ color: '#8A7A60' }}>
                                            Blank template with general court and legal document structure
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Template cards carousel */
                            <div
                                ref={carouselRef}
                                className="flex gap-3 overflow-x-auto pb-2"
                                style={{ scrollbarWidth: 'none' }}
                            >
                                {templates.map(tmpl => {
                                    const isSelected = selectedTemplate?.id === tmpl.id;
                                    return (
                                        <motion.button
                                            key={tmpl.id}
                                            onClick={() => setSelectedTemplate(isSelected ? null : tmpl)}
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex-shrink-0 w-44 rounded-2xl p-4 text-left transition-all cursor-pointer"
                                            style={{
                                                background: isSelected
                                                    ? 'rgba(197, 139, 7, 0.08)'
                                                    : 'rgba(42, 29, 14, 0.3)',
                                                border: isSelected
                                                    ? '1px solid rgba(197, 139, 7, 0.35)'
                                                    : '1px solid rgba(138, 122, 96, 0.08)',
                                            }}
                                        >
                                            {/* Document preview icon */}
                                            <div
                                                className="w-full h-24 rounded-xl mb-3 flex items-center justify-center"
                                                style={{
                                                    background: isSelected
                                                        ? 'rgba(197, 139, 7, 0.06)'
                                                        : 'rgba(26, 16, 8, 0.5)',
                                                    border: '1px solid rgba(138, 122, 96, 0.06)',
                                                }}
                                            >
                                                <FileText
                                                    size={28}
                                                    style={{
                                                        color: isSelected ? '#C58B07' : '#5A4A30',
                                                    }}
                                                />
                                            </div>
                                            <p
                                                className="text-xs font-medium leading-tight line-clamp-2"
                                                style={{
                                                    color: isSelected ? '#F5EFE0' : '#B8A88A',
                                                }}
                                            >
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
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-6 overflow-hidden"
                            >
                                <div
                                    className="px-4 py-3 rounded-xl"
                                    style={{
                                        background: 'rgba(197, 139, 7, 0.04)',
                                        border: '1px solid rgba(197, 139, 7, 0.12)',
                                    }}
                                >
                                    <p className="text-xs font-semibold mb-1" style={{ color: '#C58B07' }}>
                                        Selected: {selectedTemplate.title}
                                    </p>
                                    <p className="text-xs" style={{ color: '#8A7A60' }}>
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
                        className="mb-6"
                    >
                        <textarea
                            value={documentContent}
                            onChange={e => setDocumentContent(e.target.value)}
                            placeholder="Paste your content here or describe the document title, body, and footer verbatim..."
                            rows={8}
                            className="input-gilded resize-none"
                            style={{ minHeight: '160px' }}
                        />

                        {/* Bottom bar */}
                        <div className="flex items-center justify-between mt-3">
                            <div className="flex gap-3">
                                <button
                                    disabled
                                    title="File attachment coming soon"
                                    className="flex items-center gap-1.5 text-xs transition-colors cursor-not-allowed"
                                    style={{ color: '#8A7A60', opacity: 0.5 }}
                                >
                                    <Paperclip size={13} /> Attach
                                </button>
                                {documentContent && (
                                    <button
                                        onClick={() => setDocumentContent('')}
                                        className="flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
                                        style={{ color: '#8A7A60' }}
                                    >
                                        <X size={13} /> Clear
                                    </button>
                                )}
                            </div>
                            <p className="text-xs" style={{ color: '#5A4A30' }}>
                                {documentContent.length > 0 ? `${documentContent.length} chars` : ''}
                            </p>
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
                            disabled={!documentContent.trim() && !selectedTemplate}
                            className="btn-gold w-full flex items-center justify-center gap-2 py-3.5 text-sm disabled:opacity-40"
                        >
                            <Sparkles size={16} />
                            Generate
                        </button>
                    </motion.div>

                    {/* ── Error Message ── */}
                    {generationError && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-4 px-4 py-3 rounded-xl"
                            style={{
                                background: 'rgba(220, 38, 38, 0.08)',
                                border: '1px solid rgba(220, 38, 38, 0.2)',
                            }}
                        >
                            <p className="text-sm" style={{ color: '#DC2626' }}>
                                {generationError}
                            </p>
                        </motion.div>
                    )}

                    {/* ── Bottom Flow Icons ── */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="flex items-center justify-center gap-8 mt-8"
                    >
                        {[
                            { label: 'Describe\nDocument', icon: FileText },
                            { label: 'AI Generated\nDraft', icon: Sparkles },
                            { label: 'Download\n& Export', icon: ArrowRight },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} className="flex flex-col items-center gap-2">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{
                                            background: 'rgba(197, 139, 7, 0.06)',
                                            border: '1px solid rgba(197, 139, 7, 0.12)',
                                        }}
                                    >
                                        <Icon size={16} style={{ color: '#8A7A60' }} />
                                    </div>
                                    <p
                                        className="text-xs text-center whitespace-pre-line leading-tight"
                                        style={{ color: '#5A4A30' }}
                                    >
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-lg mx-auto"
                >
                    {/* Close / Step indicator */}
                    <div className="flex items-center justify-between mb-8">
                        <button
                            onClick={handleNewDocument}
                            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                            style={{ background: 'rgba(197, 139, 7, 0.06)' }}
                        >
                            <X size={16} style={{ color: '#8A7A60' }} />
                        </button>
                        <p className="text-xs" style={{ color: '#8A7A60' }}>
                            Step {Math.min(progressSteps.filter(s => s.status === 'complete').length + 1, progressSteps.length)} of {progressSteps.length}
                        </p>
                    </div>

                    {/* Document context */}
                    <div
                        className="card-gilded p-6 mb-8"
                        style={{ borderColor: 'rgba(197, 139, 7, 0.15)' }}
                    >
                        <p className="text-xs uppercase tracking-[0.15em] mb-2" style={{ color: '#92783A' }}>
                            Document Context
                        </p>
                        <p className="text-sm italic leading-relaxed" style={{ color: '#D4C9B0' }}>
                            &ldquo;{selectedTemplate?.title || (() => {
                                const text = documentContent;
                                if (text.length <= 120) return text;
                                const truncated = text.slice(0, 120);
                                const lastSpace = truncated.lastIndexOf(' ');
                                return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
                            })()}...&rdquo;
                        </p>
                    </div>

                    {/* Working animation */}
                    <div className="text-center mb-8">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            className="inline-block mb-4"
                        >
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(197, 139, 7, 0.12), rgba(197, 139, 7, 0.04))',
                                    border: '1px solid rgba(197, 139, 7, 0.2)',
                                }}
                            >
                                <Sparkles size={24} style={{ color: '#C58B07' }} />
                            </div>
                        </motion.div>
                        <p className="text-sm font-medium" style={{ color: '#F5EFE0' }}>
                            DocuVault AI is working...
                        </p>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold tracking-[0.1em] uppercase" style={{ color: '#92783A' }}>
                                Synthesis
                            </p>
                            <p className="text-xs font-bold" style={{ color: '#C58B07' }}>
                                {Math.round(progress)}%
                            </p>
                        </div>
                        <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: 'rgba(138, 122, 96, 0.1)' }}
                        >
                            <motion.div
                                className="h-full rounded-full"
                                style={{ background: 'linear-gradient(90deg, #C58B07, #E5B84A)' }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>

                    {/* Step-by-step progress */}
                    <div className="space-y-3">
                        {progressSteps.map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-start gap-3"
                            >
                                <div className="mt-0.5">
                                    {step.status === 'complete' ? (
                                        <div
                                            className="w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: 'rgba(90, 158, 111, 0.15)' }}
                                        >
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#5A9E6F' }} />
                                        </div>
                                    ) : step.status === 'active' ? (
                                        <motion.div
                                            animate={{ scale: [1, 1.2, 1] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                            className="w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: 'rgba(197, 139, 7, 0.15)' }}
                                        >
                                            <div className="w-2 h-2 rounded-full" style={{ background: '#C58B07' }} />
                                        </motion.div>
                                    ) : (
                                        <div
                                            className="w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: 'rgba(138, 122, 96, 0.08)' }}
                                        >
                                            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(138, 122, 96, 0.3)' }} />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p
                                        className="text-sm font-medium"
                                        style={{
                                            color: step.status === 'complete'
                                                ? '#5A9E6F'
                                                : step.status === 'active'
                                                    ? '#F5EFE0'
                                                    : '#5A4A30',
                                        }}
                                    >
                                        {step.label}
                                    </p>
                                    {step.status === 'active' && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-xs mt-0.5"
                                            style={{ color: '#8A7A60' }}
                                        >
                                            Processing...
                                        </motion.p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Disclaimer */}
                    <p className="text-xs text-center mt-8" style={{ color: '#3A3020' }}>
                        AI results may produce inaccurate information. Large documents usually take 45-60 seconds to generate.
                    </p>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════
                VIEW: RESULT SCREEN
               ═══════════════════════════════════════════════════ */}
            {view === 'result' && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-2xl mx-auto"
                >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={handleNewDocument}
                            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                            style={{
                                background: 'rgba(197, 139, 7, 0.08)',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                            }}
                        >
                            <ChevronLeft size={16} style={{ color: '#C58B07' }} />
                        </button>
                        <div>
                            <h1 className="text-headline text-lg" style={{ color: '#F5EFE0' }}>
                                {selectedTemplate?.title || 'Generated Document'}
                            </h1>
                            <p className="text-xs" style={{ color: '#8A7A60' }}>
                                Case #{caseNumber ?? '------'}
                            </p>
                        </div>
                    </div>

                    {/* AI Summary */}
                    <div className="card-gilded p-5 mb-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: '#5A8EC9' }}>
                            Intelligence Summary
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: '#D4C9B0' }}>
                            I&apos;ve synthesized the provided content into a formal{' '}
                            {selectedTemplate?.title?.toLowerCase() || 'legal document'}.
                            All formatting follows local court standards. The document has been cross-referenced
                            for procedural alignment.
                        </p>
                    </div>

                    {/* PDF Preview Card */}
                    <div
                        className="rounded-2xl p-6 mb-6 text-center"
                        style={{
                            background: 'rgba(245, 239, 224, 0.03)',
                            border: '1px solid rgba(197, 139, 7, 0.15)',
                        }}
                    >
                        {/* PDF Icon */}
                        <div
                            className="w-28 h-36 mx-auto rounded-xl mb-4 flex items-center justify-center"
                            style={{
                                background: 'rgba(245, 239, 224, 0.04)',
                                border: '1px solid rgba(138, 122, 96, 0.1)',
                            }}
                        >
                            <FileText size={36} style={{ color: '#8A7A60' }} />
                        </div>
                        <p className="text-sm font-semibold mb-1" style={{ color: '#F5EFE0' }}>
                            {selectedTemplate?.title || 'Legal Document'} v.1
                        </p>
                        <p className="text-xs" style={{ color: '#8A7A60' }}>
                            FORMAL ARCHIVE • ~1.2 MB
                        </p>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-center gap-6 mt-5">
                            {/* Download */}
                            <button
                                onClick={() => {
                                    if (!generatedPdfUrl) return;
                                    const a = document.createElement('a');
                                    a.href = generatedPdfUrl;
                                    a.download = `${selectedTemplate?.id ?? 'document'}_${Date.now()}.pdf`;
                                    a.click();
                                }}
                                disabled={!generatedPdfUrl}
                                className="flex flex-col items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(197, 139, 7, 0.06)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                                >
                                    <ArrowRight size={16} className="rotate-90" style={{ color: '#C58B07' }} />
                                </div>
                                <span className="text-xs" style={{ color: '#8A7A60' }}>Download</span>
                            </button>
                            {/* Print */}
                            <button
                                onClick={() => {
                                    if (!generatedPdfUrl) return;
                                    const win = window.open(generatedPdfUrl, '_blank');
                                    if (win) {
                                        // Give the PDF time to render before printing
                                        setTimeout(() => {
                                            try { win.print(); }
                                            catch { console.warn('Print dialog could not be opened'); }
                                        }, 500);
                                    } else {
                                        // Popup blocked — inform user
                                        alert('Please allow popups to print the document, or use Download instead.');
                                    }
                                }}
                                disabled={!generatedPdfUrl}
                                className="flex flex-col items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(197, 139, 7, 0.06)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                                >
                                    <FileText size={16} style={{ color: '#C58B07' }} />
                                </div>
                                <span className="text-xs" style={{ color: '#8A7A60' }}>Print</span>
                            </button>
                            {/* Save — TODO: wire to Convex backend */}
                            <button
                                disabled
                                aria-disabled="true"
                                title="Save to DocuVault coming soon"
                                className="flex flex-col items-center gap-1.5 transition-colors opacity-40 cursor-not-allowed"
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(197, 139, 7, 0.06)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                                >
                                    <Landmark size={16} style={{ color: '#C58B07' }} />
                                </div>
                                <span className="text-xs" style={{ color: '#8A7A60' }}>Save</span>
                            </button>
                        </div>
                    </div>

                    {/* NEXXverification Badges */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div
                            className="px-4 py-3 rounded-xl flex items-start gap-3"
                            style={{
                                background: 'rgba(90, 158, 111, 0.06)',
                                border: '1px solid rgba(90, 158, 111, 0.15)',
                            }}
                        >
                            <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: '#5A9E6F' }} />
                            <div>
                                <p className="text-xs font-semibold" style={{ color: '#5A9E6F' }}>
                                    Rule 3.1 Certified
                                </p>
                                <p className="text-xs" style={{ color: '#8A7A60' }}>
                                    Formal formatting standards met
                                </p>
                            </div>
                        </div>
                        <div
                            className="px-4 py-3 rounded-xl flex items-start gap-3"
                            style={{
                                background: 'rgba(90, 158, 111, 0.06)',
                                border: '1px solid rgba(90, 158, 111, 0.15)',
                            }}
                        >
                            <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: '#5A9E6F' }} />
                            <div>
                                <p className="text-xs font-semibold" style={{ color: '#5A9E6F' }}>
                                    Bates Validation
                                </p>
                                <p className="text-xs" style={{ color: '#8A7A60' }}>
                                    Sequence validated & confirmed
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Revision Input — TODO: wire to re-generation API */}
                    <div
                        className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{
                            background: 'rgba(42, 29, 14, 0.3)',
                            border: '1px solid rgba(138, 122, 96, 0.1)',
                            opacity: 0.5,
                        }}
                    >
                        <Plus size={16} style={{ color: '#8A7A60' }} />
                        <input
                            type="text"
                            placeholder="Revision requests coming soon..."
                            className="flex-1 bg-transparent text-sm outline-none"
                            style={{ color: '#B8A88A' }}
                            disabled
                            aria-disabled="true"
                        />
                        <button
                            disabled
                            className="w-8 h-8 rounded-full flex items-center justify-center cursor-not-allowed opacity-50"
                            style={{
                                background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                            }}
                        >
                            <ArrowRight size={14} style={{ color: '#02022d' }} />
                        </button>
                    </div>

                    {/* Disclaimer */}
                    <p className="text-xs text-center mt-4" style={{ color: '#3A3020' }}>
                        AI may make mistakes. Verify legal citations independently.
                    </p>
                </motion.div>
            )}
        </div>
    );
}
