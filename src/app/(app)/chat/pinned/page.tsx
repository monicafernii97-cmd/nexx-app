'use client';

import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { PushPin, Notebook } from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import { ItemCard } from '@/components/workspace/ItemCard';
import { EmptyState } from '@/components/workspace/EmptyState';

/**
 * Pinned Items Page — Full-screen view of the focus rail.
 * Allows users to review and manage their most important fragments.
 */
export default function PinnedItemsPage() {
    const { pins, removePin } = useWorkspace();

    return (
        <PageContainer>
            <PageHeader
                icon={PushPin}
                title="Pinned Focus"
                description="Most critical case evidence and strategic points pinned for immediate focus. Managed from your workspace rail."
            />

            {pins === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-40 animate-pulse">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-48 glass-ethereal rounded-2xl border border-white/10" />
                    ))}
                </div>
            ) : pins.length === 0 ? (
                <EmptyState
                    icon={PushPin}
                    title="No Pins Active"
                    description="You haven't pinned any items yet. Pinning allows you to prioritize the most important facts across all case views."
                    actionLabel="Go to Chat"
                    actionHref="/chat"
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                    {pins.map(pin => (
                        <ItemCard
                            key={pin._id}
                            id={pin._id}
                            type={pin.type}
                            title={pin.title}
                            content={pin.content}
                            createdAt={pin.createdAt}
                            onRemove={removePin}
                            isPinned
                        />
                    ))}
                </div>
            )}
        </PageContainer>
    );
}
