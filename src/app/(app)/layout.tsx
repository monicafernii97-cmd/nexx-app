'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { GlobalWorkspaceRail } from '@/components/workspace/GlobalWorkspaceRail';
import { TopNav } from '@/components/layout/TopNav';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

/**
 * Authenticated app shell layout.
 *
 * 3-column executive layout:
 * ┌───────────┬──────────────────────────────────┬────────────┐
 * │           │         TopNav (72px)             │            │
 * │  Sidebar  ├──────────────────────────────────┤  Insights  │
 * │  (280px)  │      Main Content (flex)         │   Rail     │
 * │ full-ht   │                                  │  (360px)   │
 * └───────────┴──────────────────────────────────┴────────────┘
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <WorkspaceProvider>
                <ToastProvider>
                    <div className="silk-bg min-h-[100dvh] flex p-4 md:p-6 gap-6 overflow-hidden">
                        {/* Left: Full-height Sidebar */}
                        <Sidebar />
                        
                        {/* Center + Right: TopNav + Content + Rail */}
                        <div className="flex-1 min-w-0 flex gap-6">
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

                            {/* Right: Persistent Insights Rail */}
                            <div className="hidden xl:block">
                                <GlobalWorkspaceRail />
                            </div>
                        </div>
                    </div>
                </ToastProvider>
            </WorkspaceProvider>
        </UserProvider>
    );
}
