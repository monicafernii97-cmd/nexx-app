'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SidebarContextValue {
    /** Whether the mobile drawer is open */
    isDrawerOpen: boolean;
    /** Toggle the mobile drawer */
    toggleDrawer: () => void;
    /** Explicitly close the drawer (e.g. on navigation) */
    closeDrawer: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const toggleDrawer = useCallback(() => setIsDrawerOpen(prev => !prev), []);
    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

    return (
        <SidebarContext.Provider value={{ isDrawerOpen, toggleDrawer, closeDrawer }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
    return ctx;
}
