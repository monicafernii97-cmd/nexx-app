'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
    FileText,
    Search,
    ArrowLeft,
    Download,
    Trash2,
    Clock,
    Plus,
} from 'lucide-react';
import Link from 'next/link';
import { UI_TABS } from '@/lib/legal/templateCategories';

/** Mock document data (will connect to Convex backend) */
interface SavedDocument {
    id: string;
    title: string;
    category: string;
    createdAt: Date;
    status: 'complete' | 'draft';
    fileSize: string;
}

/** Gallery page displaying saved and draft legal documents with search and filters. */
export default function DocuVaultGalleryPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');

    // Placeholder — will be populated from Convex
    const documents: SavedDocument[] = [];

    const filterTabs = [
        { id: 'all', label: 'All' },
        ...UI_TABS.filter(t => t.id !== 'create_own').map(t => ({
            id: t.id,
            label: t.label === 'LEAD' ? 'LEAD' : t.label,
        })),
    ];

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

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-5 mb-10"
            >
                <Link
                    href="/docuvault"
                    className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-all bg-white/10 border border-white/30 hover:bg-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_4px_12px_rgba(0,0,0,0.4)] backdrop-blur-xl shrink-0"
                    aria-label="Back to DocuVault"
                >
                    <ArrowLeft size={20} strokeWidth={3} className="text-white drop-shadow-sm" />
                </Link>
                <div>
                    <h1 className="text-4xl font-serif font-bold tracking-tight text-white drop-shadow-sm">
                        Document Gallery
                    </h1>
                    <p className="text-[15px] font-medium text-white mt-1 drop-shadow-sm">
                        Your generated and saved legal documents
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

            {/* Filter Tabs + Sort */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex items-center justify-between mb-6"
            >
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
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
                <div className="relative shrink-0">
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                        aria-label="Sort documents"
                        className="text-[13px] font-bold tracking-widest uppercase pl-5 pr-10 py-3 rounded-full cursor-pointer appearance-none bg-white/5 backdrop-blur-xl text-white border border-white/20 hover:bg-white/10 outline-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.3)]"
                    >
                        <option value="newest" className="bg-[#0A1128] text-white">Newest</option>
                        <option value="oldest" className="bg-[#0A1128] text-white">Oldest</option>
                        <option value="name" className="bg-[#0A1128] text-white">Name</option>
                    </select>
                    {/* Add visual dropdown arrow since appearance-none hides it */}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 1L5 5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                </div>
            </motion.div>

            {/* Document Gallery Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2
                    className="text-[14px] font-bold tracking-[0.2em] uppercase mb-6 text-white drop-shadow-sm"
                >
                    Document Gallery
                </h2>

                {/* Empty State */}
                {documents.length === 0 && (
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
                            <Plus size={20} strokeWidth={3} /> Create Document
                        </Link>
                    </div>
                )}

                {/* Completed Documents Grid */}
                {completeDocs.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        {completeDocs.map((doc, i) => (
                            <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
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
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-[11px] font-bold tracking-widest uppercase bg-white/10 text-white border border-white/20 px-3 py-1.5 rounded-full">{doc.category}</span>
                                            <span className="text-[13px] font-bold text-white">{doc.fileSize}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                                            <Clock size={14} className="text-[#60A5FA]" />
                                            Updated {doc.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                    {/* Actions — disabled until backend wiring */}
                                    <div className="flex gap-3">
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Download not available yet"
                                            className="w-10 h-10 rounded-full flex items-center justify-center cursor-not-allowed bg-white/5 border border-white/10 text-white shadow-sm"
                                        >
                                            <Download size={16} strokeWidth={2.5} />
                                        </button>
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Delete not available yet"
                                            className="w-10 h-10 rounded-full flex items-center justify-center cursor-not-allowed bg-white/5 border border-white/10 text-[#F87171] shadow-sm"
                                        >
                                            <Trash2 size={16} strokeWidth={2.5} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Drafts Section */}
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
                                        className="w-12 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#0A1128] border-2 border-dashed border-[#E5A84A] shadow-inner"
                                    >
                                        <FileText size={20} className="text-[#E5A84A] drop-shadow-sm" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[16px] font-bold truncate text-white drop-shadow-sm">
                                            {doc.title}
                                        </p>
                                        <p className="text-[13px] font-bold text-[#E5A84A] uppercase tracking-widest mt-1">Draft</p>
                                    </div>

                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}
