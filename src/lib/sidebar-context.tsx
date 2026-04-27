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

/** Provides sidebar drawer state (open/close) to child components via React context. */
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

/** Returns the sidebar drawer state and controls. Must be used within a SidebarProvider. */
export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider');
    return ctx;
}
