'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';

/** Authenticated app shell layout with sidebar and user context provider. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <div className="min-h-[100dvh]" style={{ background: 'var(--base-bg)' }}>
                <Sidebar />
                <main
                    className="transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] min-h-[100dvh]"
                    style={{ marginLeft: 280, padding: '48px 64px' }}
                >
                    <div className="max-w-[1400px] mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>
        </UserProvider>
    );
}
