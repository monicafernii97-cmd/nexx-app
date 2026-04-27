'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { SidebarProvider } from '@/lib/sidebar-context';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { GlobalWorkspaceRail } from '@/components/workspace/GlobalWorkspaceRail';
import { TopNav } from '@/components/layout/TopNav';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

/**
 * Authenticated app shell layout — Mobile-first.
 *
 * MOBILE (< lg):
 * ┌──────────────────────────────────────────┐
 * │  TopNav (48px: hamburger + case)         │
 * ├──────────────────────────────────────────┤
 * │  Content (full width)                    │
 * └──────────────────────────────────────────┘
 *   + Sidebar = overlay drawer (hamburger)
 *   + Rail = bottom sheet (chat/incident only)
 *
 * DESKTOP (lg+):
 * ┌──────────┬───────────────────────────────┐
 * │ Sidebar  │  TopNav + Content  (+ Rail*)  │
 * │  200px   │   * Rail only on /chat, /ir   │
 * └──────────┴───────────────────────────────┘
 */

/** Routes where the Insights Rail is relevant */
function useShowInsightsRail() {
    const pathname = usePathname();
    return pathname?.startsWith('/chat') || pathname?.startsWith('/incident-report');
}

export default function AppShellLayout({ children }: { children: ReactNode }) {
    const showRail = useShowInsightsRail();

    return (
        <UserProvider>
            <WorkspaceProvider>
                <SidebarProvider>
                    <ToastProvider>
                        <div className="silk-bg min-h-[100dvh] flex p-1.5 md:p-2 gap-2 overflow-hidden">
                            {/* Left: Full-height Sidebar (hidden on mobile, inline on lg+) */}
                            <Sidebar />
                            
                            {/* Center + Right: TopNav + Content + Rail */}
                            <div className="flex-1 min-w-0 flex gap-2">
                                {/* Center column: TopNav + Page */}
                                <motion.div
                                    layout
                                    className="flex-1 min-w-0 flex flex-col relative z-10"
                                >
                                    <TopNav />
                                    <main className="flex-1 min-w-0">
                                        {children}
                                    </main>
                                </motion.div>

                                {/* Right: Insights Rail — only on workspace routes, only on xl+ */}
                                {showRail && (
                                    <div className="hidden xl:block">
                                        <GlobalWorkspaceRail />
                                    </div>
                                )}
                            </div>
                        </div>
                    </ToastProvider>
                </SidebarProvider>
            </WorkspaceProvider>
        </UserProvider>
    );
}
