'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';
import { motion } from 'framer-motion';

/** Authenticated app shell layout with floating glass sidebar and ethereal background. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <div className="silk-bg min-h-[100dvh] flex p-4 md:p-6 gap-6">
                <Sidebar />
                <motion.main
                    layout
                    className="flex-1 min-w-0 transition-all duration-300 rounded-[2.5rem]"
                >
                    {children}
                </motion.main>
            </div>
        </UserProvider>
    );
}
