'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// ThemeToggle — Persisted sun/moon toggle for dark ↔ light theme switching.
//
// Uses useSyncExternalStore to read from localStorage without triggering the
// react-hooks/set-state-in-effect lint rule. Defaults to 'dark' (galaxy theme).
// Applies/removes the .dark class on <html> to match globals.css tokens.
// ---------------------------------------------------------------------------

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'nexx-theme';

/** All active subscribers — notified when the theme changes. */
const listeners = new Set<() => void>();

/** Read the stored theme, falling back to 'dark'. */
function getSnapshot(): Theme {
    if (typeof window === 'undefined') return 'dark';
    return (localStorage.getItem(STORAGE_KEY) as Theme) || 'dark';
}

/** Server snapshot — always 'dark' to match the initial HTML class. */
function getServerSnapshot(): Theme {
    return 'dark';
}

/** Subscribe to theme changes (includes cross-tab sync via storage event). */
function subscribe(callback: () => void) {
    listeners.add(callback);
    const handleStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) {
            applyTheme(getSnapshot());
            callback();
        }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
        listeners.delete(callback);
        window.removeEventListener('storage', handleStorage);
    };
}

/** Apply the theme class to <html> */
function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
    } else {
        root.classList.add('light');
        root.classList.remove('dark');
    }
}

export function ThemeToggle() {
    const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const toggle = useCallback(() => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
        // Notify all subscribers so useSyncExternalStore re-reads the snapshot
        listeners.forEach((cb) => cb());
    }, [theme]);

    const isDark = theme === 'dark';

    return (
        <button
            onClick={toggle}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 cursor-pointer
                       hover:bg-black/5 dark:hover:bg-white/10
                       border border-transparent hover:border-black/10 dark:hover:border-white/20"
        >
            {/* Sun icon (visible in dark mode → click to go light) */}
            <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[18px] h-[18px] absolute"
                initial={false}
                animate={{
                    opacity: isDark ? 1 : 0,
                    scale: isDark ? 1 : 0.5,
                    rotate: isDark ? 0 : -90,
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ color: 'var(--metallic-silver, #E2E8F0)' }}
            >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </motion.svg>

            {/* Moon icon (visible in light mode → click to go dark) */}
            <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[18px] h-[18px] absolute"
                initial={false}
                animate={{
                    opacity: isDark ? 0 : 1,
                    scale: isDark ? 0.5 : 1,
                    rotate: isDark ? 90 : 0,
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ color: '#334155' }}
            >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </motion.svg>
        </button>
    );
}
