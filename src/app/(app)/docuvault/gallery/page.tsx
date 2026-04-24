'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import {
    FileText,
    MagnifyingGlass as Search,
    ArrowLeft,
    DownloadSimple as Download,
    Trash,
    Clock,
    Plus,
    DotsThreeOutlineVertical,
    CheckCircle,
    XCircle,
    WarningCircle
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { EXPORT_PATH_LABELS, EXPORT_PATHS } from '@/lib/export-assembly/exportPathLabels';
import type { ExportPath } from '@/lib/export-assembly/types/exports';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

/** Gallery page displaying saved and generated legal documents. */
export default function DocuVaultGalleryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
    const [deletingId, setDeletingId] = useState<Id<'generatedDocuments'> | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── Fetch real data from Convex ──
    const exports = useQuery(api.generatedDocumentsExport.getRecentExports, { limit: 100 });
    const deleteExport = useMutation(api.generatedDocumentsExport.deleteExport);

    const filterTabs = [
        { id: 'all', label: 'All' },
        ...EXPORT_PATHS.map(path => ({
            id: path,
            label: EXPORT_PATH_LABELS[path],
        })),
    ];

    // Map exports to display items
    const documents = useMemo(() => {
        if (!exports) return [];
        return exports.map(doc => ({
            id: doc._id,
            title: doc.filename ?? doc.templateTitle,
            category: doc.exportPath ?? doc.templateId,
            createdAt: new Date(doc.createdAt),
            status: (['completed', 'final', 'filed'].includes(doc.status) ? 'complete' : 'draft') as 'complete' | 'draft',
            canDelete: ['draft', 'drafting', 'failed'].includes(doc.status),
            fileSize: '-',
            exportPath: doc.exportPath as ExportPath | undefined,
            version: doc.version,
            rootExportId: doc.rootExportId,
            currentStage: doc.currentStage,
            dbStatus: doc.status,
            storageId: doc.storageId,
        }));
    }, [exports]);

    const filteredDocs = documents
        .filter(doc => {
            if (activeFilter !== 'all' && doc.category !== activeFilter) return false;
            if (searchQuery && !doc.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
            if (sortBy === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
            return a.title.localeCompare(b.title);
        });

    const completeDocs = filteredDocs.filter(d => d.status === 'complete');
    const draftDocs = filteredDocs.filter(d => d.status === 'draft');

    /** Handle delete with confirmation and user-visible error feedback. */
    const handleDelete = async (docId: Id<'generatedDocuments'>) => {
        if (!window.confirm('Delete this document? This cannot be undone.')) return;
        setDeletingId(docId);
        setDeleteError(null);
        try {
            await deleteExport({ documentId: docId });
        } catch (err) {
            console.error('[Gallery] Delete failed:', err);
            setDeleteError('Failed to delete document. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    /** Get display label for export path */
    const getPathLabel = (path?: ExportPath) => {
        if (!path) return 'Document';
        return EXPORT_PATH_LABELS[path] ?? path;
    };

    return (
        <PageContainer>
            <PageHeader
                icon={FileText}
                title="Document Gallery"
                description="Your arsenal of evidence. Access, manage, and deploy your finalized, court-ready documents."
                rightElement={
                    <Link
                        href="/docuvault"
                        className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all bg-white/10 border border-white/30 hover:bg-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_4px_12px_rgba(0,0,0,0.4)] backdrop-blur-xl shrink-0"
                        aria-label="Back to DocuVault"
                    >
                        <ArrowLeft size={20} weight="bold" className="text-white drop-shadow-sm" />
                    </Link>
                }
            />

            {/* Search */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6"
            >
                <div className="relative group">
                    <Search size={22} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/70 group-focus-within:text-[#60A5FA] transition-colors" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="w-full h-16 pl-16 pr-6 rounded-[2rem] bg-white/5 backdrop-blur-2xl border border-white/20 text-[16px] text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-[#60A5FA]/50 focus:bg-white/10 transition-all shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.4)] font-medium"
                        aria-label="Search documents"
                    />
                </div>
            </motion.div>

            {/* Filter Tabs */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-6 w-full"
            >
                <div className="flex gap-3 overflow-x-auto pb-2 min-w-0" style={{ scrollbarWidth: 'none' }}>
                    {filterTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id)}
                            aria-pressed={activeFilter === tab.id}
                            className={`px-6 py-3 rounded-full text-[13px] font-bold tracking-widest uppercase whitespace-nowrap cursor-pointer transition-all shadow-sm ${
                                activeFilter === tab.id
                                    ? 'bg-[linear-gradient(135deg,#E5A84A,#B47B04)] text-white border border-white/30 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5),0_8px_24px_rgba(229,168,74,0.6)] drop-shadow-sm'
                                    : 'bg-white/5 backdrop-blur-xl text-white border border-white/10 hover:bg-white/10 hover:border-white/30 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Document Gallery */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                {/* Delete error banner */}
                {deleteError && (
                    <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                        <p className="text-[13px] text-red-400 font-medium">{deleteError}</p>
                        <button
                            onClick={() => setDeleteError(null)}
                            className="text-[12px] text-red-300/60 hover:text-red-300 transition-colors ml-4"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-[14px] font-bold tracking-[0.2em] uppercase text-white drop-shadow-sm m-0">
                        Document Gallery
                        {exports !== undefined && (
                            <span className="text-white/40 ml-2 font-medium">({documents.length})</span>
                        )}
                    </h2>

                    <div className="relative shrink-0">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                            aria-label="Sort documents"
                            className="text-[12px] font-bold tracking-widest uppercase pl-4 pr-9 py-2 rounded-full cursor-pointer appearance-none bg-white/5 backdrop-blur-xl text-white border border-white/20 hover:bg-white/10 outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.3)]"
                        >
                            <option value="newest" className="bg-[#0A1128] text-white">Newest</option>
                            <option value="oldest" className="bg-[#0A1128] text-white">Oldest</option>
                            <option value="name" className="bg-[#0A1128] text-white">Name</option>
                        </select>
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 1L5 5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Loading state */}
                {exports === undefined && (
                    <div className="p-16 rounded-[2rem] text-center border border-white/10 bg-white/5 backdrop-blur-2xl">
                        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin mx-auto mb-4" />
                        <p className="text-[14px] text-white/50 font-medium">Loading documents…</p>
                    </div>
                )}

                {/* Empty State */}
                {exports !== undefined && documents.length === 0 && (
                    <div className="p-16 rounded-[2rem] text-center border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.4)]">
                        <div
                            className="w-24 h-24 rounded-[2rem] mx-auto mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-2 border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
                        >
                            <FileText size={40} className="text-white drop-shadow-sm" />
                        </div>
                        <p className="text-[20px] font-bold mb-3 text-white drop-shadow-sm">
                            No documents yet
                        </p>
                        <p className="text-[16px] mb-8 text-white font-medium">
                            Generate your first legal document to see it here.
                        </p>
                        <Link href="/docuvault" className="text-[15px] font-bold tracking-widest uppercase px-8 py-4 rounded-full inline-flex items-center gap-3 no-underline transition-all bg-[linear-gradient(135deg,#60A5FA,#2563EB)] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_24px_rgba(37,99,235,0.5)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_12px_32px_rgba(37,99,235,0.6)] hover:-translate-y-1">
                            <Plus size={20} weight="bold" /> Create Document
                        </Link>
                    </div>
                )}

                {/* No matching results */}
                {exports !== undefined && documents.length > 0 && filteredDocs.length === 0 && (
                    <div className="p-12 rounded-[2rem] text-center border border-white/10 bg-white/5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.4)]">
                        <Search size={40} className="mx-auto mb-4 text-white/40" />
                        <p className="text-[18px] font-bold mb-2 text-white drop-shadow-sm">
                            No matching documents
                        </p>
                        <p className="text-[15px] text-white/60 font-medium">
                            Try adjusting your search or filter to find what you&apos;re looking for.
                        </p>
                    </div>
                )}

                {/* Completed Documents Grid */}
                <AnimatePresence>
                    {completeDocs.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                            {completeDocs.map((doc, i) => (
                                <motion.div
                                    key={doc.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ delay: 0.05 * i }}
                                    className="p-6 rounded-[2rem] group transition-all border border-white/10 bg-white/5 backdrop-blur-2xl hover:bg-white/10 hover:border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.4)] hover:-translate-y-1"
                                >
                                    <div className="flex items-start gap-5">
                                        {/* Preview thumbnail */}
                                        <div
                                            className="w-20 h-24 rounded-xl flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-2 border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                                        >
                                            <FileText size={28} className="text-white drop-shadow-sm" />
                                        </div>
                                        <div className="flex-1 min-w-0 py-1">
                                            <p className="text-[17px] font-bold truncate mb-2 text-white drop-shadow-sm">
                                                {doc.title}
                                            </p>
                                            <div className="flex items-center gap-3 mb-3 flex-wrap">
                                                <span className="text-[11px] font-bold tracking-widest uppercase bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-full">
                                                    {getPathLabel(doc.exportPath)}
                                                </span>
                                                {doc.version && doc.version > 1 && (
                                                    <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-1 rounded-full">
                                                        v{doc.version}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                                    doc.dbStatus === 'filed' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                    : doc.dbStatus === 'final' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                    : 'bg-white/5 text-white/40'
                                                }`}>
                                                    {doc.dbStatus.toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                                                <Clock size={14} className="text-[#60A5FA]" />
                                                {doc.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex gap-3">
                                            {doc.storageId && (
                                                <a
                                                    href={`/api/documents/export/${doc.id}/download`}
                                                    download={doc.title}
                                                    className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors shadow-sm"
                                                    aria-label="Download document"
                                                >
                                                    <Download size={16} weight="bold" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </AnimatePresence>

                {/* Draft/Failed Documents */}
                {draftDocs.length > 0 && (
                    <>
                        <h2
                            className="text-[14px] font-bold tracking-[0.2em] uppercase mt-8 mb-6 text-white drop-shadow-sm"
                        >
                            In Progress
                        </h2>
                        <div className="space-y-4">
                            {draftDocs.map((doc, i) => (
                                <motion.div
                                    key={doc.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * i }}
                                    className="p-5 rounded-[1.5rem] flex items-center gap-5 bg-white/5 border border-white/10 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.3)]"
                                >
                                    <div
                                        className={`w-12 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#0A1128] border-2 border-dashed ${
                                            doc.dbStatus === 'failed' ? 'border-red-500/50' : 'border-[#E5A84A]'
                                        } shadow-inner`}
                                    >
                                        <FileText size={20} className={doc.dbStatus === 'failed' ? 'text-red-400' : 'text-[#E5A84A]'} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[16px] font-bold truncate text-white drop-shadow-sm">
                                            {doc.title}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className={`text-[13px] font-bold uppercase tracking-widest ${
                                                doc.dbStatus === 'failed' ? 'text-red-400' : 'text-[#E5A84A]'
                                            }`}>
                                                {doc.dbStatus === 'failed' ? 'Failed' : 'Draft'}
                                            </p>
                                            {doc.currentStage && (
                                                <span className="text-[10px] text-white/30">
                                                    Stage: {doc.currentStage}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Delete draft/failed only */}
                                    {doc.canDelete && (
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            disabled={deletingId === doc.id}
                                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-[#F87171] hover:bg-red-500/10 hover:border-red-500/30 transition-colors shadow-sm disabled:opacity-40"
                                            aria-label="Delete document"
                                        >
                                            <Trash size={16} weight="bold" />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
            </motion.div>
        </PageContainer>
    );
}
