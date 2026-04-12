'use client';

/**
 * WorkspaceShell — 3-zone desktop layout for the case workspace.
 *
 * Zones:
 * - Left: existing Sidebar (handled by parent layout)
 * - Center: main conversation or page content (narrower reading column)
 * - Right: 320px PinnedItemsRail
 *
 * On mobile, the right rail collapses to an icon bar.
 */

import { useState, type ReactNode } from 'react';
import { PinnedItemsRail } from './PinnedItemsRail';
import type { PinnableType } from '@/lib/integration/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PinnedItem {
    _id: string;
    type: PinnableType;
    title: string;
    content: string;
    createdAt: number;
}

interface WorkspaceShellProps {
    children: ReactNode;
    pinnedItems: PinnedItem[];
    onUnpin: (id: string) => void;
    /** Hide the rail entirely (e.g., on non-chat pages) */
    hideRail?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** 3-zone workspace layout with center content and collapsible right rail. */
export function WorkspaceShell({
    children,
    pinnedItems,
    onUnpin,
    hideRail = false,
}: WorkspaceShellProps) {
    const [isRailExpanded, setIsRailExpanded] = useState(true);

    return (
        <div className="flex gap-4 h-full min-h-0 w-full">
            {/* Center — main content area */}
            <div className="flex-1 min-w-0 overflow-hidden">
                {children}
            </div>

            {/* Right rail — pinned items */}
            {/* Desktop: full expanded/collapsed toggle. Mobile: always collapsed icon bar */}
            {!hideRail && (
                <div className="flex flex-shrink-0">
                    <div className="hidden lg:flex">
                        <PinnedItemsRail
                            items={pinnedItems}
                            onUnpin={onUnpin}
                            isExpanded={isRailExpanded}
                            onToggle={() => setIsRailExpanded((prev) => !prev)}
                        />
                    </div>
                    <div className="flex lg:hidden">
                        <PinnedItemsRail
                            items={pinnedItems}
                            onUnpin={onUnpin}
                            isExpanded={false}
                            onToggle={() => setIsRailExpanded((prev) => !prev)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
