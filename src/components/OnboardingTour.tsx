'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    TOUR_STORAGE_KEY,
    TOUR_PENDING_KEY,
    RESTART_EVENT,
    navIdSelector,
} from '@/lib/tourUtils';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tour step config — uses navIdSelector so selectors stay in sync with Sidebar IDs. */
function getTourSteps() {
    return [
        {
            element: navIdSelector('/dashboard'),
            popover: {
                title: '📊 Dashboard',
                description: 'Your command center — stats, recent incidents, quick actions, and an overview of your entire case at a glance.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/chat'),
            popover: {
                title: '💬 Chat with NEXX',
                description: 'Type or use your voice — get strategic guidance on how to handle your situation, draft court-ready documents tailored to your specific case, and receive step-by-step direction on what filings and processes you\'ll need.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/docuvault'),
            popover: {
                title: '🏛 DocuVault',
                description: 'Browse dozens of court-specific legal templates. DocuVault takes the content NEXX drafted for your case and creates fully formatted, print-ready PDFs for court filings — ready to download, print, and submit.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/incident-report'),
            popover: {
                title: '📋 Incident Report',
                description: 'Write or speak what happened in your own words. NEXX logs each incident into a court-safe, timestamped timeline — designed to track patterns and document incidents across time. Download as PDF, print, and exhibit in court when needed.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/nex-profile'),
            popover: {
                title: '⚠️ NEX Profile',
                description: 'Map your opposing party\'s behavior patterns and tendencies. NEXX uses this profile to sharpen your strategy and anticipate their next moves.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/court-settings'),
            popover: {
                title: '⚖️ Legal Suite',
                description: 'Configure your court settings — state, county, judge, case caption, and parties. This powers every document NEXX generates for you.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/efiling'),
            popover: {
                title: '📤 eFiling',
                description: 'Your guided filing checklist — track what\'s been submitted, what\'s pending, and access your county\'s electronic filing portal directly.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: navIdSelector('/resources'),
            popover: {
                title: '📚 Resources',
                description: 'Discover local resources for your jurisdiction — court clerks, legal aid organizations, and eFiling portals, all curated by NEXX for your county.',
                side: 'right' as const,
                align: 'center' as const,
            },
        },
        {
            element: '#quick-actions',
            popover: {
                title: '⚡ Quick Actions',
                description: 'Jump right in — start a new chat, log an incident, or draft a document. These shortcuts get you moving fast.',
                side: 'top' as const,
                align: 'center' as const,
            },
        },
        {
            // No element target — centered popover for a clean finish
            popover: {
                title: '🚀 You\'re All Set!',
                description: 'You\'ve seen it all — NEXX is ready when you are. You can replay this tour anytime from the sidebar.',
            },
        },
    ];
}

/**
 * Onboarding tour component — shows a welcome dialog for first-time users
 * then walks them through the sidebar navigation. Persisted via localStorage.
 */
export default function OnboardingTour() {
    const [showWelcome, setShowWelcome] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const startupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driverRef = useRef<any>(null);
    const mountedRef = useRef(true);
    const skipFocusRestoreRef = useRef(false);

    /** Cancel any pending startup timer to prevent it from re-opening the welcome modal. */
    const clearStartupTimer = useCallback(() => {
        if (startupTimerRef.current) {
            clearTimeout(startupTimerRef.current);
            startupTimerRef.current = null;
        }
    }, []);

    // Track mounted state and cleanup driver instance on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            driverRef.current?.destroy();
            driverRef.current = null;
        };
    }, []);

    // Consolidated startup: check both first-run and pending-replay in a single effect.
    // Schedules at most one timer to prevent overlapping show calls.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Pending replay (navigated here from another route via ? button)
        const pending = localStorage.getItem(TOUR_PENDING_KEY);
        if (pending) {
            localStorage.removeItem(TOUR_PENDING_KEY);
            startupTimerRef.current = setTimeout(() => setShowWelcome(true), 500);
            return () => {
                if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
            };
        }

        // First-time user (hasn't seen tour yet)
        const seen = localStorage.getItem(TOUR_STORAGE_KEY);
        if (!seen) {
            startupTimerRef.current = setTimeout(() => setShowWelcome(true), 800);
            return () => {
                if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
            };
        }
    }, []);

    // Listen for restart event (fired when already on /dashboard)
    useEffect(() => {
        const handleRestart = () => {
            clearStartupTimer();
            setShowWelcome(true);
        };
        window.addEventListener(RESTART_EVENT, handleRestart);
        return () => window.removeEventListener(RESTART_EVENT, handleRestart);
    }, [clearStartupTimer]);

    // Focus trap + Escape key handling for accessibility
    useEffect(() => {
        if (!showWelcome) return;

        previousFocusRef.current = document.activeElement as HTMLElement;
        requestAnimationFrame(() => dialogRef.current?.focus());

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowWelcome(false);
                return;
            }

            if (e.key === 'Tab' && dialogRef.current) {
                const focusable = Array.from(
                    dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
                );
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === first || document.activeElement === dialogRef.current) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            // Don't restore focus when transitioning into the tour
            if (!skipFocusRestoreRef.current) {
                previousFocusRef.current?.focus();
            }
            skipFocusRestoreRef.current = false;
        };
    }, [showWelcome]);

    /** Shared recovery handler — reverts storage key and re-shows welcome so user can retry. */
    const handleTourStartFailure = useCallback((err: unknown) => {
        console.error('[NEXX Tour] Failed to start tour:', err);
        driverRef.current = null;
        localStorage.removeItem(TOUR_STORAGE_KEY);
        if (mountedRef.current) {
            setShowWelcome(true);
        }
    }, []);

    const startTour = useCallback(async () => {
        clearStartupTimer();
        skipFocusRestoreRef.current = true;
        setShowWelcome(false);

        // Persist "seen" flag before async imports so even if interrupted it won't re-show
        localStorage.setItem(TOUR_STORAGE_KEY, 'true');

        try {
            // Lazy-load driver.js only when starting the tour (keeps initial bundle small)
            const { driver } = await import('driver.js');
            if (!mountedRef.current) return;

            // @ts-expect-error -- CSS module has no type declarations for dynamic import
            await import('driver.js/dist/driver.css');
            if (!mountedRef.current) return;

            requestAnimationFrame(() => {
                if (!mountedRef.current) return;

                try {
                    const driverObj = driver({
                        showProgress: true,
                        animate: true,
                        smoothScroll: true,
                        allowClose: true,
                        stagePadding: 6,
                        stageRadius: 16,
                        popoverClass: 'nexx-tour-popover',
                        progressText: '{{current}} of {{total}}',
                        nextBtnText: 'Next →',
                        prevBtnText: '← Back',
                        doneBtnText: 'Let\'s Go!',
                        steps: getTourSteps(),
                        onDestroyStarted: () => {
                            driverObj.destroy();
                            driverRef.current = null;
                        },
                    });

                    driverRef.current = driverObj;
                    driverObj.drive();
                } catch (err) {
                    // Cleanup partially-created driver before recovery
                    if (driverRef.current) {
                        driverRef.current.destroy();
                        driverRef.current = null;
                    }
                    handleTourStartFailure(err);
                }
            });
        } catch (err) {
            handleTourStartFailure(err);
        }
    }, [clearStartupTimer, handleTourStartFailure]);

    const dismissWelcome = useCallback(() => {
        clearStartupTimer();
        setShowWelcome(false);
        // Don't persist — "Skip for Now" means the tour will return next session
    }, [clearStartupTimer]);

    if (!showWelcome) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="welcome-title"
                aria-describedby="welcome-description"
                tabIndex={-1}
                className="relative w-[90%] max-w-md rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.5)] outline-none"
                style={{
                    background: 'linear-gradient(160deg, #0D1B3E 0%, #0A1128 40%, #132042 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
            >
                {/* Decorative glow */}
                <div aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full opacity-20 blur-[80px]"
                    style={{ background: 'radial-gradient(circle, #60A5FA, transparent)' }}
                />

                <div className="relative px-8 pt-10 pb-8 text-center">
                    {/* Logo mark */}
                    <div aria-hidden="true" className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
                        style={{
                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                        }}
                    >
                        <span
                            className="text-[38px] font-black font-serif italic uppercase tracking-tighter"
                            style={{
                                background: 'linear-gradient(135deg, #0A1128 0%, #1E3A8A 30%, #94A3B8 60%, #0A1128 100%)',
                                backgroundSize: '200% auto',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                animation: 'shimmer-bg 4s linear infinite',
                            }}
                        >
                            N
                        </span>
                    </div>

                    <h2 id="welcome-title" className="text-2xl font-bold text-white mb-2 tracking-tight">
                        Welcome to <span className="font-serif italic">NEXX</span>
                    </h2>
                    <p id="welcome-description" className="text-[15px] text-white/70 font-medium leading-relaxed mb-8">
                        Want a quick tour? We&apos;ll walk you through everything in under a minute.
                    </p>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={startTour}
                            className="w-full py-3.5 px-6 rounded-2xl text-[14px] font-bold tracking-wide text-white cursor-pointer transition-all duration-300 shadow-[0_8px_24px_rgba(26,75,155,0.4)] hover:shadow-[0_12px_32px_rgba(26,75,155,0.6)] hover:-translate-y-0.5 border border-white/20 hover:border-white/40"
                            style={{
                                background: 'linear-gradient(135deg, #1A4B9B, #123D7E)',
                            }}
                        >
                            ✨ Take the Tour
                        </button>
                        <button
                            onClick={dismissWelcome}
                            className="w-full py-3 px-6 rounded-2xl text-[13px] font-semibold tracking-wide text-white/60 hover:text-white/90 cursor-pointer transition-all duration-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
                        >
                            Skip for Now
                        </button>
                    </div>

                    <p className="text-[11px] text-white/40 font-medium mt-5 tracking-wide">
                        You can replay this tour anytime from the sidebar
                    </p>
                </div>
            </div>
        </div>
    );
}
