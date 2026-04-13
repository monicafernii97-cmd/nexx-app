'use client';

import { useState, useMemo, useCallback } from 'react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { FileText, MagnifyingGlass, Funnel } from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { ItemCard } from '@/components/workspace/ItemCard';
import { EmptyState } from '@/components/workspace/EmptyState';
import { FilterTabs } from '@/components/workspace/FilterTabs';

/**
 * Drafts Page — Manages all saved draft snippets from chat.
 *
 * Shows court-ready versions, affidavit language, motion paragraphs,
 * and other draft content created from AI sessions.
 */

const DRAFT_TABS = [
    { id: 'all', label: 'All' },
    { id: 'draft_snippet', label: 'Drafts' },
    { id: 'hearing_prep_point', label: 'Hearing Prep' },
    { id: 'exhibit_note', label: 'Exhibits' },
    { id: 'procedure_note', label: 'Procedures' },
];

// M3: Module-scoped stable Set — prevents stale closure in useMemo
const DRAFT_TYPES = new Set(['draft_snippet', 'hearing_prep_point', 'exhibit_note', 'procedure_note']);

export default function DraftsPage() {
    const { memory, removeMemory } = useWorkspace();
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const allDrafts = useMemo(() => {
        if (!memory) return [];
        return memory.filter(item => DRAFT_TYPES.has(item.type));
    }, [memory]);

    const filteredItems = useMemo(() => {
        return allDrafts.filter(item => {
            const matchesTab = activeTab === 'all' || item.type === activeTab;
            const matchesSearch = !searchQuery.trim() ||
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.content.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [allDrafts, activeTab, searchQuery]);

    const tabConfigs = useMemo(() => {
        return DRAFT_TABS.map(tab => ({
            ...tab,
            count: tab.id === 'all'
                ? allDrafts.length
                : allDrafts.filter(d => d.type === tab.id).length,
        }));
    }, [allDrafts]);

    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
        setActiveTab('all');
    }, []);

    const hasDrafts = allDrafts.length > 0;
    const isFilterMiss = hasDrafts && filteredItems.length === 0;

    return (
        <PageContainer>
            <PageHeader
                icon={FileText}
                title="Drafts & Work Product"
                description="Court-ready language, affidavit text, motion paragraphs, and hearing prep created from AI sessions."
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <FilterTabs
                    tabs={tabConfigs}
                    activeTabId={activeTab}
                    onTabChange={setActiveTab}
                    activeColor="var(--accent-platinum)"
                />

                <div className="relative max-w-sm w-full">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <MagnifyingGlass size={16} className="text-white/30" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search drafts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[var(--accent-platinum)]/50 focus:border-[var(--accent-platinum)]/50 transition-all"
                    />
                </div>
            </div>

            {memory === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-40 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 glass-ethereal rounded-2xl border border-white/10" />
                    ))}
                </div>
            ) : !hasDrafts ? (
                <EmptyState
                    icon={FileText}
                    title="No Drafts Yet"
                    description="Court-ready versions, motion paragraphs, and hearing outlines created from AI sessions will appear here."
                    actionLabel="Start New Chat"
                    actionHref="/chat"
                />
            ) : isFilterMiss ? (
                <EmptyState
                    icon={searchQuery ? MagnifyingGlass : Funnel}
                    title={searchQuery ? 'No Matches Found' : 'No Items in This Category'}
                    description={searchQuery
                        ? 'Try refining your search terms or clearing filters.'
                        : 'None of your drafts match this filter. Try another category or view all.'
                    }
                    actionLabel="Clear Filters"
                    onAction={handleClearSearch}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {filteredItems.map(item => (
                        <ItemCard
                            key={item._id}
                            id={item._id}
                            type={item.type}
                            title={item.title}
                            content={item.content}
                            createdAt={item.createdAt}
                            onRemove={removeMemory}
                            sourceConversationId={(item as any).sourceConversationId}
                        />
                    ))}
                </div>
            )}
        </PageContainer>
    );
}
