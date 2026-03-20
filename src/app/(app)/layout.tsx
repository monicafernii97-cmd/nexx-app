'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';

/** Authenticated app shell layout with sidebar and user context provider. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <div className="min-h-screen" style={{ background: 'var(--base-bg)' }}>
                <Sidebar />
                <main
                    className="transition-all duration-300 min-h-screen"
                    style={{ marginLeft: 260, padding: '32px 40px' }}
                >
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </UserProvider>
    );
}
