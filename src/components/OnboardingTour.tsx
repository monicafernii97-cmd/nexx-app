'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STORAGE_KEY = 'nexx-tour-seen';
const RESTART_EVENT = 'restart-nexx-tour';

/** Tour step definitions targeting sidebar nav IDs and dashboard elements. */
const tourSteps: DriveStep[] = [
    {
        element: '#nav-dashboard',
        popover: {
            title: '📊 Dashboard',
            description: 'Your command center — stats, recent incidents, quick actions, and an overview of your entire case at a glance.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-chat',
        popover: {
            title: '💬 Chat with NEXX',
            description: 'Your secure session with NEXX — get strategic guidance on how to handle your situation, draft court-ready documents tailored to your specific case, and receive step-by-step direction on what filings and processes you\'ll need.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-docuvault',
        popover: {
            title: '🏛 DocuVault',
            description: 'Browse dozens of court-specific legal templates. DocuVault takes the content NEXX drafted for your case and creates fully formatted, print-ready PDFs for court filings — ready to download, print, and submit.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-incident-report',
        popover: {
            title: '📋 Incident Report',
            description: 'Write what happened in your own words. NEXX takes your raw account and generates a court-safe, timestamped timeline — with PDF download and print options, ready to exhibit in court if necessary.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-nex-profile',
        popover: {
            title: '⚠️ NEX Profile',
            description: 'Map your opposing party\'s behavior patterns and tendencies. NEXX uses this profile to sharpen your strategy and anticipate their next moves.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-court-settings',
        popover: {
            title: '⚖️ Legal Suite',
            description: 'Configure your court settings — state, county, judge, case caption, and parties. This powers every document NEXX generates for you.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-efiling',
        popover: {
            title: '📤 eFiling',
            description: 'Your guided filing checklist — track what\'s been submitted, what\'s pending, and access your county\'s electronic filing portal directly.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-resources',
        popover: {
            title: '📚 Resources',
            description: 'Discover local resources for your jurisdiction — court clerks, legal aid organizations, and eFiling portals, all curated by NEXX for your county.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#quick-actions',
        popover: {
            title: '🚀 You\'re All Set!',
            description: 'Start a chat session, log your first incident, or generate a document. NEXX is ready when you are.',
            side: 'top',
            align: 'center',
        },
    },
];

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Onboarding tour component — shows a welcome dialog for first-time users
 * then walks them through the sidebar navigation. Persisted via localStorage.
 */
export default function OnboardingTour() {
    const [showWelcome, setShowWelcome] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Only show for first-time users
        if (typeof window === 'undefined') return;
        const seen = localStorage.getItem(TOUR_STORAGE_KEY);
        if (!seen) {
            // Small delay to let the dashboard/sidebar render first
            const timer = setTimeout(() => setShowWelcome(true), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    // Listen for restart event from the sidebar ? button.
    // If not on dashboard, navigate there first so tour targets exist.
    useEffect(() => {
        const handleRestart = () => {
            if (pathname !== '/dashboard') {
                // Navigate to dashboard, then show tour after mount
                localStorage.setItem('nexx-tour-pending', 'true');
                router.push('/dashboard');
            } else {
                setShowWelcome(true);
            }
        };
        window.addEventListener(RESTART_EVENT, handleRestart);
        return () => window.removeEventListener(RESTART_EVENT, handleRestart);
    }, [pathname, router]);

    // Check for pending tour after navigating to dashboard
    useEffect(() => {
        if (pathname === '/dashboard' && typeof window !== 'undefined') {
            const pending = localStorage.getItem('nexx-tour-pending');
            if (pending) {
                localStorage.removeItem('nexx-tour-pending');
                const timer = setTimeout(() => setShowWelcome(true), 500);
                return () => clearTimeout(timer);
            }
        }
    }, [pathname]);

    // Focus trap + Escape key handling for accessibility
    useEffect(() => {
        if (!showWelcome) return;

        // Save previously focused element to restore later
        previousFocusRef.current = document.activeElement as HTMLElement;

        // Focus the dialog on open
        requestAnimationFrame(() => dialogRef.current?.focus());

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowWelcome(false);
                localStorage.setItem(TOUR_STORAGE_KEY, 'true');
                return;
            }

            // Focus trap: cycle Tab through focusable elements inside the dialog
            if (e.key === 'Tab' && dialogRef.current) {
                const focusable = Array.from(
                    dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
                );
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey) {
                    // Shift+Tab on first element → wrap to last
                    if (document.activeElement === first || document.activeElement === dialogRef.current) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    // Tab on last element → wrap to first
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
            // Restore focus when dialog closes
            previousFocusRef.current?.focus();
        };
    }, [showWelcome]);

    const startTour = useCallback(() => {
        setShowWelcome(false);

        // Wait a tick for the dialog to close before starting the tour
        requestAnimationFrame(() => {
            // Persist "seen" flag immediately so even if the tour is interrupted
            // (tab refresh, route change), the user won't be shown it again
            localStorage.setItem(TOUR_STORAGE_KEY, 'true');

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
                steps: tourSteps,
                onDestroyStarted: () => {
                    driverObj.destroy();
                },
            });

            driverObj.drive();
        });
    }, []);

    const dismissWelcome = useCallback(() => {
        setShowWelcome(false);
        localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    }, []);

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
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full opacity-20 blur-[80px]"
                    style={{ background: 'radial-gradient(circle, #60A5FA, transparent)' }}
                />

                <div className="relative px-8 pt-10 pb-8 text-center">
                    {/* Logo mark */}
                    <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
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

/** Trigger function to restart the tour without a full page reload. */
export function restartTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(RESTART_EVENT));
}
