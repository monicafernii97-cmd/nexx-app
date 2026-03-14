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
                <Link href="/docuvault">
                    <button
                        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                        style={{
                            background: 'rgba(199, 208, 229, 0.08)',
                            border: '1px solid rgba(199, 208, 229, 0.15)',
                        }}
                    >
                        <ArrowLeft size={16} style={{ color: '#FFFAF3' }} />
                    </button>
                </Link>
                <div>
                    <h1 className="text-headline text-2xl" style={{ color: '#FFFAF3' }}>
                        Document Gallery
                    </h1>
                    <p className="text-sm" style={{ color: '#E8DDD3' }}>
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
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#E8DDD3' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search documents..."
                        className="input-premium pl-11"
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
                            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all"
                            style={{
                                background: activeFilter === tab.id
                                    ? 'rgba(199, 208, 229, 0.12)'
                                    : 'transparent',
                                color: activeFilter === tab.id ? '#FFFAF3' : '#E8DDD3',
                                border: activeFilter === tab.id
                                    ? '1px solid rgba(199, 208, 229, 0.25)'
                                    : '1px solid rgba(138, 122, 96, 0.08)',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}
                    className="text-xs px-3 py-1.5 rounded-lg cursor-pointer appearance-none"
                    style={{
                        background: 'rgba(232, 221, 211, 0.4)',
                        color: '#E8DDD3',
                        border: '1px solid rgba(138, 122, 96, 0.08)',
                    }}
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
                    className="text-xs font-semibold tracking-[0.15em] uppercase mb-4"
                    style={{ color: '#C7D0E5' }}
                >
                    Document Gallery
                </h2>

                {/* Empty State */}
                {documents.length === 0 && (
                    <div className="card-premium p-12 text-center">
                        <div
                            className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{
                                background: 'rgba(199, 208, 229, 0.06)',
                                border: '1px solid rgba(199, 208, 229, 0.12)',
                            }}
                        >
                            <FileText size={32} style={{ color: '#5A4A30' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: '#C7D0E5' }}>
                            No documents yet
                        </p>
                        <p className="text-xs mb-6" style={{ color: '#E8DDD3' }}>
                            Generate your first legal document to see it here.
                        </p>
                        <Link href="/docuvault">
                            <button className="btn-primary text-xs">
                                Create Document
                            </button>
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
                                className="card-premium p-5 group cursor-pointer hover:border-[rgba(199, 208, 229,0.25)] transition-all"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Preview thumbnail */}
                                    <div
                                        className="w-16 h-20 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: 'rgba(245, 239, 224, 0.03)',
                                            border: '1px solid rgba(138, 122, 96, 0.08)',
                                        }}
                                    >
                                        <FileText size={22} style={{ color: '#E8DDD3' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate mb-1" style={{ color: '#FFFAF3' }}>
                                            {doc.title}
                                        </p>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="badge text-xs">{doc.category}</span>
                                            <span className="text-xs" style={{ color: '#5A4A30' }}>{doc.fileSize}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs" style={{ color: '#E8DDD3' }}>
                                            <Clock size={10} />
                                            Updated {doc.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>
                                    {/* Actions — disabled until backend wiring */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Download not available yet"
                                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-not-allowed"
                                            style={{ background: 'rgba(199, 208, 229, 0.06)' }}
                                        >
                                            <Download size={12} style={{ color: '#FFFAF3' }} />
                                        </button>
                                        <button
                                            disabled
                                            aria-disabled="true"
                                            title="Delete not available yet"
                                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-not-allowed"
                                            style={{ background: 'rgba(199, 90, 90, 0.06)' }}
                                        >
                                            <Trash2 size={12} style={{ color: '#C75A5A' }} />
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
                            className="text-xs font-semibold tracking-[0.15em] uppercase mb-4"
                            style={{ color: '#E5A84A' }}
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
                                    className="card-premium p-4 flex items-center gap-4 cursor-pointer"
                                >
                                    <div
                                        className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: 'rgba(229, 168, 74, 0.06)',
                                            border: '1px dashed rgba(229, 168, 74, 0.2)',
                                        }}
                                    >
                                        <FileText size={16} style={{ color: '#E5A84A' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" style={{ color: '#C7D0E5' }}>
                                            {doc.title}
                                        </p>
                                        <p className="text-xs" style={{ color: '#E8DDD3' }}>Draft</p>
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
