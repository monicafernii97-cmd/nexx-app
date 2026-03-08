'use client';

import Sidebar from '@/components/Sidebar';
import { UserProvider } from '@/lib/user-context';
import { ReactNode } from 'react';

export default function AppShellLayout({ children }: { children: ReactNode }) {
    return (
        <UserProvider>
            <div className="min-h-screen" style={{ background: 'var(--dark-bg)' }}>
                <Sidebar />
                <main
                    className="transition-all duration-300 min-h-screen"
                    style={{ marginLeft: 260, padding: '24px 32px' }}
                >
                    {children}
                </main>
            </div>
        </UserProvider>
    );
}
