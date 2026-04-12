'use client';

import { useState, useMemo, useCallback } from 'react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { Notebook, MagnifyingGlass, Funnel } from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { ALL_SAVE_TYPE_TABS } from '@/lib/workspace-constants';
import { ItemCard } from '@/components/workspace/ItemCard';
import { EmptyState } from '@/components/workspace/EmptyState';
import { FilterTabs } from '@/components/workspace/FilterTabs';

/**
 * Key Points Page — Centralized explorer for all saved case insights.
 * Features full 12-type filtering, search, and bulk management.
 */
export default function KeyPointsPage() {
    const { memory, removeMemory, pins } = useWorkspace();
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Filter memory by tab and search query
    const filteredItems = useMemo(() => {
        if (!memory) return [];
        return memory.filter(item => {
            const matchesTab = activeTab === 'all' || item.type === activeTab;
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 item.content.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [memory, activeTab, searchQuery]);

    const tabConfigs = useMemo(() => {
        return ALL_SAVE_TYPE_TABS.map(tab => ({
            ...tab,
            count: tab.id === 'all' ? memory?.length : memory?.filter(m => m.type === tab.id).length
        }));
    }, [memory]);

    // CR #2 — Clear Search actually resets local state
    const handleClearSearch = useCallback(() => {
        setSearchQuery('');
        setActiveTab('all');
    }, []);

    // CR #5 — Distinguish truly-empty workspace from empty tab/search filter
    const hasAnyMemory = (memory?.length ?? 0) > 0;
    const isFilterMiss = hasAnyMemory && filteredItems.length === 0;

    return (
        <PageContainer>
            <PageHeader
                icon={Notebook}
                title="Key Points Explorer"
                description="Manage strategic facts, risk concerns, and legal strategy points captured across all case sessions."
            />

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <FilterTabs 
                    tabs={tabConfigs}
                    activeTabId={activeTab}
                    onTabChange={setActiveTab}
                    activeColor="var(--support-violet)"
                />

                <div className="relative max-w-sm w-full">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <MagnifyingGlass size={16} className="text-white/30" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search points..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-[14px] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[var(--support-violet)]/50 focus:border-[var(--support-violet)]/50 transition-all"
                    />
                </div>
            </div>

            {memory === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-40 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 glass-ethereal rounded-2xl border border-white/10" />
                    ))}
                </div>
            ) : !hasAnyMemory ? (
                /* Truly empty — no data at all */
                <EmptyState
                    icon={Notebook}
                    title="Workspace Empty"
                    description="You haven't saved any key points yet. Insights from AI sessions will appear here."
                    actionLabel="Start New Chat"
                    actionHref="/chat"
                />
            ) : isFilterMiss ? (
                /* Has data but current filter/search yields nothing */
                <EmptyState
                    icon={searchQuery ? MagnifyingGlass : Funnel}
                    title={searchQuery ? "No Matches Found" : "No Items in This Category"}
                    description={searchQuery ? "Try refining your search terms or clearing filters." : "None of your saved points match this filter. Try another category or view all."}
                    actionLabel="Clear Filters"
                    onAction={handleClearSearch}
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {filteredItems.map(item => {
                        const isPinned = pins?.some(p => p.sourceMessageId === item.sourceMessageId && p.title === item.title);
                        return (
                            <ItemCard
                                key={item._id}
                                id={item._id}
                                type={item.type}
                                title={item.title}
                                content={item.content}
                                createdAt={item.createdAt}
                                onRemove={removeMemory}
                                isPinned={isPinned}
                            />
                        );
                    })}
                </div>
            )}
        </PageContainer>
    );
}
