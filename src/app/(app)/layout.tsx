'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { GlobalWorkspaceRail } from '@/components/workspace/GlobalWorkspaceRail';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Authenticated app shell layout with floating glass sidebar and ethereal background. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <WorkspaceProvider>
                <ToastProvider>
                    <div className="silk-bg min-h-[100dvh] flex p-4 md:p-6 gap-6 overflow-hidden">
                        <Sidebar />
                        
                        <motion.main
                            layout
                            className="flex-1 min-w-0 transition-all duration-300 relative z-10"
                        >
                            {children}
                        </motion.main>

                        {/* Persistent Right Rail — Context everywhere */}
                        <div className="hidden xl:block">
                            <GlobalWorkspaceRail />
                        </div>
                    </div>
                </ToastProvider>
            </WorkspaceProvider>
        </UserProvider>
    );
}

