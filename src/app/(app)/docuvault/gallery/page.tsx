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
                className="flex items-center gap-4 mb-8"
            >
                <Link
                    href="/docuvault"
                    className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.1)]"
                    aria-label="Back to DocuVault"
                >
                    <ArrowLeft size={16} className="text-white" />
                </Link>
                <div>
                    <h1 className="text-headline text-2xl text-white">
                        Document Gallery
                    </h1>
                    <p className="text-[14px] text-white/70">
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
                <div className="relative">
                    <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0A1128]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="input-premium pl-12 h-12"
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
                <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {filterTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id)}
                            aria-pressed={activeFilter === tab.id}
                            className={`px-4 py-2.5 rounded-[9999px] text-[11px] font-bold tracking-wider uppercase whitespace-nowrap cursor-pointer transition-all shadow-sm ${
                                activeFilter === tab.id
                                    ? 'bg-[#C58B07] text-[#FFFFFF] border-transparent shadow-[0_4px_12px_rgba(197,139,7,0.4)]'
                                    : 'bg-[#0A1128] text-[rgba(255,255,255,0.7)] border border-[rgba(255,255,255,0.2)] hover:text-white hover:border-[rgba(255,255,255,0.4)]'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                    aria-label="Sort documents"
                    className="text-[12px] font-semibold tracking-wider uppercase px-4 py-2 rounded-xl cursor-pointer appearance-none bg-[#0A1128] text-white border border-[rgba(255,255,255,0.2)] outline-none"
                >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name</option>
                </select>
            </motion.div>

            {/* Document Gallery Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <h2
                    className="text-xs font-bold tracking-[0.15em] uppercase mb-4 text-[#C58B07]"
                >
                    Document Gallery
                </h2>

                {/* Empty State */}
                {documents.length === 0 && (
                    <div className="card-premium p-12 text-center border border-[rgba(255,255,255,0.05)] bg-[rgba(10,17,40,0.4)] backdrop-blur-md">
                        <div
                            className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-[#1A4B9B]/20 border border-[#1A4B9B]/40 shadow-[0_4px_15px_rgba(26,75,155,0.2)]"
                        >
                            <FileText size={32} className="text-white" />
                        </div>
                        <p className="text-[15px] font-medium mb-2 text-white">
                            No documents yet
                        </p>
                        <p className="text-[13px] mb-6 text-white/60">
                            Generate your first legal document to see it here.
                        </p>
                        <Link href="/docuvault" className="btn-primary text-sm font-semibold tracking-wider uppercase px-6 py-3 rounded-[9999px] inline-flex items-center gap-2 shadow-[0_4px_15px_rgba(26,75,155,0.4)] no-underline">
                            <Plus size={16} strokeWidth={3} /> Create Document
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
                                className="card-premium p-5 group transition-all border border-[rgba(255,255,255,0.08)] bg-[rgba(10,17,40,0.5)] hover:bg-[rgba(10,17,40,0.7)] hover:border-[rgba(255,255,255,0.2)] shadow-sm"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Preview thumbnail */}
                                    <div
                                        className="w-16 h-20 rounded-lg flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-[rgba(255,255,255,0.15)] shadow-sm"
                                    >
                                        <FileText size={22} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[15px] font-semibold truncate mb-1 text-white">
                                            {doc.title}
                                        </p>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="badge text-[10px] font-bold tracking-wider uppercase bg-[#0A1128] text-white border border-[rgba(255,255,255,0.2)] px-2 py-1 rounded-[9999px]">{doc.category}</span>
                                            <span className="text-[11px] font-medium text-white/70">{doc.fileSize}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/50">
                                            <Clock size={12} />
                                            Updated {doc.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                    {/* Actions — disabled until backend wiring */}
                                    <div className="flex gap-2">
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Download not available yet"
                                            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-not-allowed bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.05)] text-white/30"
                                        >
                                            <Download size={14} />
                                        </button>
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Delete not available yet"
                                            className="w-8 h-8 rounded-xl flex items-center justify-center cursor-not-allowed bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.05)] text-[var(--error)] opacity-50"
                                        >
                                            <Trash2 size={14} />
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
                            className="text-xs font-bold tracking-[0.15em] uppercase mb-4 text-[#C58B07]"
                        >
                            In Progress
                        </h2>
                        <div className="space-y-3">
                            {draftDocs.map((doc, i) => (
                                <motion.div
                                    key={doc.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05 * i }}
                                    className="card-premium p-4 flex items-center gap-4 bg-[rgba(10,17,40,0.5)] border border-[rgba(255,255,255,0.08)]"
                                >
                                    <div
                                        className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#0A1128]/50 border border-dashed border-[#C58B07]/40"
                                    >
                                        <FileText size={16} className="text-[#C58B07]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[15px] font-semibold truncate text-white">
                                            {doc.title}
                                        </p>
                                        <p className="text-[12px] font-medium text-white/50">Draft</p>
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
