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
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-8"
            >
                <Link
                    href="/docuvault"
                    className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors no-underline"
                    style={{
                        background: 'rgba(208, 227, 255, 0.08)',
                        border: '1px solid rgba(208, 227, 255, 0.15)',
                    }}
                    aria-label="Back to DocuVault"
                >
                    <ArrowLeft size={16} style={{ color: '#F7F2EB' }} />
                </Link>
                <div>
                    <h1 className="text-headline text-2xl" style={{ color: '#F7F2EB' }}>
                        Template Gallery
                    </h1>
                    <p className="text-sm" style={{ color: '#FFF9F0' }}>
                        Browse and preview legal document templates
                    </p>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6"
            >
                <div className="relative">
                    <Search
                        size={16}
                        className="absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: '#FFF9F0' }}
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search templates..."
                        className="input-premium pl-11"
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
                <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id)}
                            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all"
                            style={{
                                background:
                                    activeFilter === tab.id
                                        ? 'rgba(208, 227, 255, 0.12)'
                                        : 'transparent',
                                color: activeFilter === tab.id ? '#F7F2EB' : '#FFF9F0',
                                border:
                                    activeFilter === tab.id
                                        ? '1px solid rgba(208, 227, 255, 0.25)'
                                        : '1px solid rgba(138, 122, 96, 0.08)',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <p className="text-xs flex-shrink-0 ml-4" style={{ color: '#D0E3FF' }}>
                    {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
                </p>
            </motion.div>

            {/* Template Grid */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {filteredTemplates.map(({ template, tabLabel }, i) => (
                        <motion.button
                            type="button"
                            key={template.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.03 * Math.min(i, 15) }}
                            onClick={() => setPreviewTemplate(template)}
                            className="group rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:scale-[1.02] text-left"
                            style={{
                                background: 'rgba(208, 227, 255, 0.04)',
                                border: '1px solid rgba(208, 227, 255, 0.1)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(208, 227, 255, 0.25)';
                                e.currentTarget.style.background = 'rgba(208, 227, 255, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'rgba(208, 227, 255, 0.1)';
                                e.currentTarget.style.background = 'rgba(208, 227, 255, 0.04)';
                            }}
                        >
                            {/* Document preview icon */}
                            <div
                                className="w-full h-28 rounded-xl mb-4 flex items-center justify-center"
                                style={{
                                    background: 'rgba(10, 30, 84, 0.4)',
                                    border: '1px solid rgba(208, 227, 255, 0.08)',
                                }}
                            >
                                <FileText size={32} style={{ color: '#D0E3FF', opacity: 0.6 }} />
                            </div>

                            {/* Category badge */}
                            <div className="flex items-center gap-2 mb-2">
                                <span
                                    className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
                                    style={{
                                        background: 'rgba(208, 227, 255, 0.08)',
                                        color: '#D0E3FF',
                                        border: '1px solid rgba(208, 227, 255, 0.12)',
                                    }}
                                >
                                    {tabLabel}
                                </span>
                            </div>

                            {/* Title */}
                            <p
                                className="text-sm font-medium leading-snug mb-2 line-clamp-2"
                                style={{ color: '#F7F2EB' }}
                            >
                                {template.title}
                            </p>

                            {/* Description */}
                            <p
                                className="text-xs leading-relaxed line-clamp-2"
                                style={{ color: '#FFF9F0', opacity: 0.7 }}
                            >
                                {template.description}
                            </p>

                            {/* Requirement indicators */}
                            <div className="flex items-center gap-3 mt-3">
                                {template.requiresDeclaration && (
                                    <div
                                        className="flex items-center gap-1"
                                        title="Requires Declaration"
                                    >
                                        <Shield size={10} style={{ color: '#D0E3FF', opacity: 0.5 }} />
                                        <span className="text-[10px]" style={{ color: '#D0E3FF', opacity: 0.5 }}>
                                            Decl.
                                        </span>
                                    </div>
                                )}
                                {template.requiresProposedOrder && (
                                    <div
                                        className="flex items-center gap-1"
                                        title="Requires Proposed Order"
                                    >
                                        <Scale size={10} style={{ color: '#D0E3FF', opacity: 0.5 }} />
                                        <span className="text-[10px]" style={{ color: '#D0E3FF', opacity: 0.5 }}>
                                            Order
                                        </span>
                                    </div>
                                )}
                                {template.supportsExhibits && (
                                    <div className="flex items-center gap-1" title="Supports Exhibits">
                                        <Paperclip size={10} style={{ color: '#D0E3FF', opacity: 0.5 }} />
                                        <span className="text-[10px]" style={{ color: '#D0E3FF', opacity: 0.5 }}>
                                            Exhibits
                                        </span>
                                    </div>
                                )}
                            </div>
                        </motion.button>
                    ))}

                    {/* +Create Own card */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.03 * Math.min(filteredTemplates.length, 15) }}
                    >
                        <Link href="/docuvault" className="no-underline">
                            <div
                                className="rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:scale-[1.02] h-full flex flex-col items-center justify-center min-h-[220px]"
                                style={{
                                    background: 'rgba(208, 227, 255, 0.02)',
                                    border: '1px dashed rgba(208, 227, 255, 0.2)',
                                }}
                            >
                                <div
                                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                                    style={{
                                        background: 'rgba(208, 227, 255, 0.06)',
                                        border: '1px dashed rgba(208, 227, 255, 0.2)',
                                    }}
                                >
                                    <Plus size={24} style={{ color: '#D0E3FF' }} />
                                </div>
                                <p
                                    className="text-sm font-semibold mb-1"
                                    style={{ color: '#F7F2EB' }}
                                >
                                    Create Your Own
                                </p>
                                <p className="text-xs text-center" style={{ color: '#FFF9F0', opacity: 0.6 }}>
                                    Start with a blank template
                                </p>
                            </div>
                        </Link>
                    </motion.div>
                </div>

                {/* Empty state */}
                {filteredTemplates.length === 0 && (
                    <div className="text-center py-12">
                        <FileText
                            size={32}
                            className="mx-auto mb-3"
                            style={{ color: '#D0E3FF', opacity: 0.3 }}
                        />
                        <p className="text-sm" style={{ color: '#D0E3FF' }}>
                            No templates match your search.
                        </p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setActiveFilter('all');
                            }}
                            className="text-xs mt-2 cursor-pointer underline"
                            style={{ color: '#FFF9F0', background: 'none', border: 'none' }}
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
                                <div className="flex items-start justify-between p-6 pb-4">
                                    <div className="flex-1 min-w-0">
                                        <span
                                            className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full inline-block mb-3"
                                            style={{
                                                background: 'rgba(208, 227, 255, 0.08)',
                                                color: '#D0E3FF',
                                                border: '1px solid rgba(208, 227, 255, 0.15)',
                                            }}
                                        >
                                            {CATEGORY_LABELS[previewTemplate.category] || previewTemplate.category}
                                        </span>
                                        <h2
                                            id="template-preview-title"
                                            className="text-lg font-serif font-semibold leading-snug"
                                            style={{ color: '#F7F2EB' }}
                                        >
                                            {previewTemplate.title}
                                        </h2>
                                    </div>
                                    <button
                                        onClick={() => setPreviewTemplate(null)}
                                        aria-label="Close preview"
                                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0 ml-4 transition-colors"
                                        style={{
                                            background: 'rgba(208, 227, 255, 0.08)',
                                            border: 'none',
                                            color: '#D0E3FF',
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Modal body (scrollable) */}
                                <div className="flex-1 overflow-y-auto px-6 pb-2" style={{ scrollbarWidth: 'thin' }}>
                                    {/* Description */}
                                    <p
                                        className="text-sm leading-relaxed mb-5"
                                        style={{ color: '#FFF9F0' }}
                                    >
                                        {previewTemplate.description}
                                    </p>

                                    {/* Requirements badges */}
                                    <div className="flex flex-wrap gap-2 mb-5">
                                        {previewTemplate.requiresDeclaration && (
                                            <div
                                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                                                style={{
                                                    background: 'rgba(229, 168, 74, 0.08)',
                                                    border: '1px solid rgba(229, 168, 74, 0.2)',
                                                    color: '#E5A84A',
                                                }}
                                            >
                                                <Shield size={12} />
                                                Requires Declaration
                                            </div>
                                        )}
                                        {previewTemplate.requiresProposedOrder && (
                                            <div
                                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                                                style={{
                                                    background: 'rgba(112, 150, 209, 0.08)',
                                                    border: '1px solid rgba(112, 150, 209, 0.2)',
                                                    color: '#7096D1',
                                                }}
                                            >
                                                <Scale size={12} />
                                                Requires Proposed Order
                                            </div>
                                        )}
                                        {previewTemplate.supportsExhibits && (
                                            <div
                                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                                                style={{
                                                    background: 'rgba(90, 158, 111, 0.08)',
                                                    border: '1px solid rgba(90, 158, 111, 0.2)',
                                                    color: '#5A9E6F',
                                                }}
                                            >
                                                <Paperclip size={12} />
                                                Supports Exhibits
                                            </div>
                                        )}
                                    </div>

                                    {/* Case Types */}
                                    <div className="mb-5">
                                        <h3
                                            className="text-xs font-semibold tracking-[0.15em] uppercase mb-2"
                                            style={{ color: '#D0E3FF' }}
                                        >
                                            Applicable Case Types
                                        </h3>
                                        <div className="flex flex-wrap gap-1.5">
                                            {previewTemplate.caseTypes.map((ct) => (
                                                <span
                                                    key={ct}
                                                    className="text-[11px] px-2 py-1 rounded-md"
                                                    style={{
                                                        background: 'rgba(208, 227, 255, 0.06)',
                                                        color: '#D0E3FF',
                                                        border: '1px solid rgba(208, 227, 255, 0.1)',
                                                    }}
                                                >
                                                    {CASE_TYPE_LABELS[ct] || ct}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Document Sections */}
                                    <div className="mb-5">
                                        <h3
                                            className="text-xs font-semibold tracking-[0.15em] uppercase mb-2"
                                            style={{ color: '#D0E3FF' }}
                                        >
                                            Document Structure
                                        </h3>
                                        <div className="space-y-1.5">
                                            {previewTemplate.sections.map((section, idx) => (
                                                <div
                                                    key={`${section.id}-${idx}`}
                                                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                                                    style={{
                                                        background: 'rgba(208, 227, 255, 0.03)',
                                                        border: '1px solid rgba(208, 227, 255, 0.06)',
                                                    }}
                                                >
                                                    <CheckCircle2
                                                        size={12}
                                                        style={{
                                                            color: section.required ? '#5A9E6F' : '#D0E3FF',
                                                            opacity: section.required ? 1 : 0.4,
                                                        }}
                                                    />
                                                    <span style={{ color: '#F7F2EB' }}>
                                                        {section.title || section.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                                    </span>
                                                    {!section.required && (
                                                        <span className="ml-auto text-[10px]" style={{ color: '#D0E3FF', opacity: 0.4 }}>
                                                            Optional
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* State Variants */}
                                    {previewTemplate.stateVariants && Object.keys(previewTemplate.stateVariants).length > 0 && (
                                        <div className="mb-5">
                                            <h3
                                                className="text-xs font-semibold tracking-[0.15em] uppercase mb-2"
                                                style={{ color: '#D0E3FF' }}
                                            >
                                                State Variants
                                            </h3>
                                            <div className="space-y-1">
                                                {Object.entries(previewTemplate.stateVariants).map(([state, name]) => (
                                                    <div
                                                        key={state}
                                                        className="flex items-center gap-2 text-xs"
                                                        style={{ color: '#FFF9F0', opacity: 0.7 }}
                                                    >
                                                        <span className="font-medium" style={{ color: '#D0E3FF' }}>
                                                            {state}:
                                                        </span>
                                                        <span>{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Modal footer */}
                                <div
                                    className="p-6 pt-4 flex items-center gap-3"
                                    style={{ borderTop: '1px solid rgba(208, 227, 255, 0.08)' }}
                                >
                                    <button
                                        onClick={() => setPreviewTemplate(null)}
                                        className="flex-1 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all"
                                        style={{
                                            background: 'rgba(208, 227, 255, 0.06)',
                                            border: '1px solid rgba(208, 227, 255, 0.15)',
                                            color: '#D0E3FF',
                                        }}
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={() => handleUseTemplate(previewTemplate.id)}
                                        className="flex-[2] py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-2"
                                        style={{
                                            background: 'linear-gradient(135deg, #F7F2EB, #D0E3FF)',
                                            border: 'none',
                                            color: '#0A1E54',
                                        }}
                                    >
                                        Use This Template
                                        <ArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
