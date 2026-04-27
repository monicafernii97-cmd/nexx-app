'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useCallback } from 'react';
import {
    FileText,
    Search,
    ArrowLeft,
    ArrowRight,
    X,
    Plus,
    Scale,
    Shield,
    Paperclip,
    CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UI_TABS, getTemplatesForTab } from '@/lib/legal/templateCategories';
import type { UITabCategory } from '@/lib/legal/templateCategories';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import type { DocumentTemplate } from '@/lib/legal/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/** Human-readable labels for document categories */
const CATEGORY_LABELS: Record<string, string> = {
    petition: 'Petition',
    motion_temporary: 'Temporary Motion',
    motion_procedure: 'Procedure Motion',
    motion_custody: 'Custody Motion',
    motion_enforcement: 'Enforcement Motion',
    motion_discovery: 'Discovery Motion',
    response: 'Response',
    counter_filing: 'Counter Filing',
    notice_hearing: 'Notice',
    notice_filing: 'Notice',
    notice_case_status: 'Notice',
    notice_parenting: 'Notice',
    declaration: 'Declaration',
    order: 'Proposed Order',
    certificate: 'Certificate',
    exhibit: 'Exhibit',
};

/** Human-readable labels for case types */
const CASE_TYPE_LABELS: Record<string, string> = {
    divorce_with_children: 'Divorce (w/ Children)',
    divorce_without_children: 'Divorce (no Children)',
    custody_establishment: 'Custody Establishment',
    custody_modification: 'Custody Modification',
    child_support: 'Child Support',
    child_support_modification: 'Child Support Modification',
    paternity: 'Paternity',
    protective_order: 'Protective Order',
    enforcement: 'Enforcement',
    termination: 'Termination',
    sapcr: 'SAPCR',
    relocation: 'Relocation',
    visitation: 'Visitation',
    other: 'Other',
};

/** Template Gallery page — browse, search, filter, preview, and select legal document templates. */
export default function TemplateGalleryPage() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);

    /** Close preview modal (stable ref for focus trap). */
    const handleClosePreview = useCallback(() => setPreviewTemplate(null), []);
    const previewDialogRef = useFocusTrap(!!previewTemplate, handleClosePreview);

    /** Aggregate all templates from every tab (excluding 'create_own') into a flat list. */
    const allTemplates = useMemo(() => {
        const templates: { template: DocumentTemplate; tabId: UITabCategory; tabLabel: string }[] = [];
        UI_TABS.filter((t) => t.id !== 'create_own').forEach((tab) => {
            getTemplatesForTab(tab.id).forEach((tmpl) => {
                templates.push({ template: tmpl, tabId: tab.id, tabLabel: tab.label });
            });
        });
        return templates;
    }, []);

    /** Filter tabs including 'All' plus each template category. */
    const filterTabs = [
        { id: 'all', label: 'All' },
        ...UI_TABS.filter((t) => t.id !== 'create_own').map((t) => ({
            id: t.id,
            label: t.label === 'LEAD' ? 'LEAD' : t.label,
        })),
    ];

    /** Filter the template list by active tab and free-text search query. */
    const filteredTemplates = useMemo(() => {
        return allTemplates.filter(({ template, tabId }) => {
            if (activeFilter !== 'all' && tabId !== activeFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return (
                    template.title.toLowerCase().includes(q) ||
                    template.description.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [allTemplates, activeFilter, searchQuery]);

    /** Navigate to the DocuVault generator with the selected template pre-loaded. */
    const handleUseTemplate = (templateId: string) => {
        router.push(`/docuvault?template=${encodeURIComponent(templateId)}`);
    };

    return (
        <PageContainer>
            {/* Header */}
            <PageHeader
                icon={FileText}
                title="Template Gallery"
                description="Your blueprint for legal success. Browse ironclad templates designed to protect your peace and assert your rights."
                rightElement={
                    <Link
                        href="/docuvault"
                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all bg-white/10 border border-white/20 hover:bg-white/20 shadow-sm backdrop-blur-xl"
                        aria-label="Back to DocuVault"
                    >
                        <ArrowLeft size={14} strokeWidth={3} className="text-white drop-shadow-sm" />
                    </Link>
                }
            />

            {/* Search */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-5"
            >
                <div className="relative group">
                    <Search
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-[#60A5FA] transition-colors"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search templates..."
                        aria-label="Search templates"
                        className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/5 backdrop-blur-2xl border border-white/15 text-[12px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#60A5FA]/40 focus:bg-white/8 transition-all shadow-sm font-medium"
                    />
                </div>
            </motion.div>

            {/* Filter Tabs */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex items-center justify-between mb-6"
            >
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-widest uppercase whitespace-nowrap cursor-pointer transition-all ${
                                activeFilter === tab.id
                                    ? 'bg-[linear-gradient(135deg,#E5A84A,#B47B04)] text-white border border-white/20 shadow-sm'
                                    : 'bg-white/5 text-white/60 border border-white/8 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] font-bold tracking-wide text-white/50 shrink-0 ml-3">
                    {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
                </p>
            </motion.div>

            {/* Template Grid */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mb-6">
                    {filteredTemplates.map(({ template, tabLabel }, i) => (
                        <motion.button
                            type="button"
                            key={template.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * Math.min(i, 15) }}
                            onClick={() => setPreviewTemplate(template)}
                            className="p-3 rounded-xl group transition-all border border-white/8 bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.07] hover:border-white/15 shadow-sm hover:-translate-y-0.5 text-left flex flex-col h-full"
                        >
                            {/* Document preview icon */}
                            <div
                                className="w-full h-12 rounded-lg mb-2.5 flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-white/15 transition-all group-hover:border-white/25"
                            >
                                <FileText size={18} className="text-white/80 group-hover:text-white group-hover:scale-105 transition-all duration-200" />
                            </div>

                            {/* Category badge */}
                            <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-[10px] font-bold tracking-widest uppercase bg-white/8 text-white/70 border border-white/10 px-2 py-0.5 rounded">
                                    {tabLabel}
                                </span>
                            </div>

                            {/* Title */}
                            <p className="text-[12px] font-bold leading-snug mb-1 line-clamp-2 text-white/90 flex-1">
                                {template.title}
                            </p>

                            {/* Description */}
                            <p className="text-[10px] leading-relaxed line-clamp-2 text-white/40 mb-2">
                                {template.description}
                            </p>

                            {/* Requirement indicators */}
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-auto pt-2 border-t border-white/6">
                                {template.requiresDeclaration && (
                                    <div className="flex items-center gap-1" title="Requires Declaration">
                                        <Shield size={10} className="text-white/50" />
                                        <span className="text-[10px] font-bold tracking-wide uppercase text-white/50">Decl.</span>
                                    </div>
                                )}
                                {template.requiresProposedOrder && (
                                    <div className="flex items-center gap-1" title="Requires Proposed Order">
                                        <Scale size={10} className="text-white/50" />
                                        <span className="text-[10px] font-bold tracking-wide uppercase text-white/50">Order</span>
                                    </div>
                                )}
                                {template.supportsExhibits && (
                                    <div className="flex items-center gap-1" title="Supports Exhibits">
                                        <Paperclip size={10} className="text-white/50" />
                                        <span className="text-[10px] font-bold tracking-wide uppercase text-white/50">Exhibits</span>
                                    </div>
                                )}
                            </div>
                        </motion.button>
                    ))}

                    {/* +Create Own card */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * Math.min(filteredTemplates.length, 15) }}
                    >
                        <Link href="/docuvault" className="no-underline">
                            <div className="p-4 rounded-xl group transition-all border border-dashed border-white/20 bg-white/[0.03] backdrop-blur-xl hover:bg-white/[0.07] hover:border-white/30 hover:-translate-y-0.5 h-full flex flex-col items-center justify-center min-h-[160px]">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 border border-dashed border-white/25 bg-white/5 group-hover:bg-white/10 group-hover:border-white/40 transition-all group-hover:scale-105 duration-200">
                                    <Plus size={18} className="text-white/60" strokeWidth={2.5} />
                                </div>
                                <p className="text-[11px] font-bold mb-0.5 text-white/70">Create Your Own</p>
                                <p className="text-[10px] text-white/40 text-center">Start with a blank template</p>
                            </div>
                        </Link>
                    </motion.div>
                </div>

                {/* Empty state */}
                {filteredTemplates.length === 0 && (
                    <div className="text-center py-20 px-8 rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.4)] mt-8">
                        <FileText
                            size={56}
                            className="mx-auto mb-6 text-white drop-shadow-sm"
                        />
                        <p className="text-[18px] font-bold text-white mb-4 drop-shadow-sm">
                            No templates match your search.
                        </p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setActiveFilter('all');
                            }}
                            className="text-[14px] font-bold tracking-wide cursor-pointer transition-all border-b-2 border-white pb-0.5 text-white hover:text-[#60A5FA] hover:border-[#60A5FA]"
                        >
                            Clear filters
                        </button>
                    </div>
                )}
            </motion.div>

            {/* ═══════════════════════════════════════════════════
                PREVIEW MODAL
               ═══════════════════════════════════════════════════ */}
            <AnimatePresence>
                {previewTemplate && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50"
                            style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
                            onClick={() => setPreviewTemplate(null)}
                        />

                        {/* Modal */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="template-preview-title"
                        >
                            <div
                                ref={previewDialogRef}
                                tabIndex={-1}
                                className="w-full max-w-lg rounded-2xl overflow-hidden pointer-events-auto max-h-[85vh] flex flex-col"
                                style={{
                                    background: 'linear-gradient(180deg, #0D2B5E 0%, #0A1E54 100%)',
                                    border: '1px solid rgba(208, 227, 255, 0.15)',
                                    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.5)',
                                    outline: 'none',
                                }}
                            >
                                {/* Modal header */}
                                <div className="flex items-start justify-between p-8 pb-6 border-b border-white/10">
                                    <div className="flex-1 min-w-0">
                                        <span
                                            className="text-[11px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full inline-block mb-4 text-white bg-white/10 border border-white/20 shadow-sm"
                                        >
                                            {CATEGORY_LABELS[previewTemplate.category] || previewTemplate.category}
                                        </span>
                                        <h2
                                            id="template-preview-title"
                                            className="text-2xl font-serif font-bold leading-snug text-white drop-shadow-sm"
                                        >
                                            {previewTemplate.title}
                                        </h2>
                                    </div>
                                    <button
                                        onClick={() => setPreviewTemplate(null)}
                                        aria-label="Close preview"
                                        className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 ml-4 transition-all bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:scale-105"
                                    >
                                        <X size={20} strokeWidth={2.5} />
                                    </button>
                                </div>

                                {/* Modal body (scrollable) */}
                                <div className="flex-1 overflow-y-auto px-8 py-6" style={{ scrollbarWidth: 'thin' }}>
                                    {/* Description */}
                                    <p
                                        className="text-[15px] leading-relaxed mb-8 text-white font-medium"
                                    >
                                        {previewTemplate.description}
                                    </p>

                                    {/* Requirements badges */}
                                    <div className="flex flex-wrap gap-3 mb-8">
                                        {previewTemplate.requiresDeclaration && (
                                            <div
                                                className="flex items-center gap-2 text-[12px] font-bold tracking-wide uppercase px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                                            >
                                                <Shield size={14} className="text-[#E5A84A]" />
                                                Requires Declaration
                                            </div>
                                        )}
                                        {previewTemplate.requiresProposedOrder && (
                                            <div
                                                className="flex items-center gap-2 text-[12px] font-bold tracking-wide uppercase px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                                            >
                                                <Scale size={14} className="text-[#60A5FA]" />
                                                Requires Proposed Order
                                            </div>
                                        )}
                                        {previewTemplate.supportsExhibits && (
                                            <div
                                                className="flex items-center gap-2 text-[12px] font-bold tracking-wide uppercase px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white"
                                            >
                                                <Paperclip size={14} className="text-[#10B981]" />
                                                Supports Exhibits
                                            </div>
                                        )}
                                    </div>

                                    {/* Case Types */}
                                    <div className="mb-8 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                                        <h3
                                            className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-white drop-shadow-sm"
                                        >
                                            Applicable Case Types
                                        </h3>
                                        <div className="flex flex-wrap gap-2">
                                            {previewTemplate.caseTypes.map((ct) => (
                                                <span
                                                    key={ct}
                                                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 shadow-sm"
                                                >
                                                    {CASE_TYPE_LABELS[ct] || ct}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Document Sections */}
                                    <div className="mb-8 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                                        <h3
                                            className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-white drop-shadow-sm"
                                        >
                                            Document Structure
                                        </h3>
                                        <div className="space-y-2.5">
                                            {previewTemplate.sections.map((section, idx) => (
                                                <div
                                                    key={`${section.id}-${idx}`}
                                                    className="flex items-center gap-3 text-[14px] font-medium px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                                                >
                                                    <CheckCircle2
                                                        size={16}
                                                        className={section.required ? "text-[#10B981]" : "text-white/40"}
                                                    />
                                                    <span className="text-white drop-shadow-sm">
                                                        {section.title || section.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                                    </span>
                                                    {!section.required && (
                                                        <span className="ml-auto text-[11px] font-bold tracking-wider uppercase text-white/50 bg-white/5 px-2 py-1 rounded-md">
                                                            Optional
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* State Variants */}
                                    {previewTemplate.stateVariants && Object.keys(previewTemplate.stateVariants).length > 0 && (
                                        <div className="mb-4 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                                            <h3
                                                className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-white drop-shadow-sm"
                                            >
                                                State Variants
                                            </h3>
                                            <div className="space-y-2">
                                                {Object.entries(previewTemplate.stateVariants).map(([state, name]) => (
                                                    <div
                                                        key={state}
                                                        className="flex flex-col sm:flex-row sm:items-start sm:gap-3 text-[14px]"
                                                    >
                                                        <span className="font-bold text-white shrink-0 min-w-[120px]">
                                                            {state}:
                                                        </span>
                                                        <span className="font-medium text-white/90">{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Modal footer */}
                                <div
                                    className="p-6 flex items-center gap-4 border-t border-white/10 bg-white/5"
                                >
                                    <button
                                        onClick={() => setPreviewTemplate(null)}
                                        className="flex-1 py-4 rounded-[1rem] text-[14px] font-bold tracking-wider uppercase cursor-pointer transition-all bg-white/10 border border-white/20 text-white hover:bg-white/20"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleUseTemplate(previewTemplate.id)}
                                        className="flex-[2] py-4 rounded-[1rem] text-[15px] font-bold tracking-wider uppercase cursor-pointer transition-all flex items-center justify-center gap-3 bg-[linear-gradient(135deg,#60A5FA,#2563EB)] border-none text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_24px_rgba(37,99,235,0.5)] hover:shadow-[0_12px_32px_rgba(37,99,235,0.6)] hover:-translate-y-1"
                                    >
                                        Use This Template
                                        <ArrowRight size={18} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </PageContainer>
    );
}
