'use client';

import { useState, useEffect, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STORAGE_KEY = 'nexx-tour-seen';

/** Tour step definitions targeting sidebar nav IDs and dashboard elements. */
const tourSteps: DriveStep[] = [
    {
        element: '#nav-dashboard',
        popover: {
            title: '📊 Dashboard',
            description: 'Your command center. See stats, recent incidents, and quick actions at a glance.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-chat',
        popover: {
            title: '💬 Chat with NEXX',
            description: 'Talk to your AI legal strategist — voice or text. Get real-time legal citations and tailored advice.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-docuvault',
        popover: {
            title: '🏛 DocuVault',
            description: 'Generate court-ready legal documents from templates calibrated to your jurisdiction.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-incident-report',
        popover: {
            title: '📋 Incident Report',
            description: 'Log incidents with AI-powered analysis. Build an airtight evidence timeline.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-nex-profile',
        popover: {
            title: '⚠️ NEX Profile',
            description: 'Map your opposing party\'s behavior patterns. NEXX uses this to tailor your strategy.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-court-settings',
        popover: {
            title: '⚖️ Legal Suite',
            description: 'Configure your court settings — state, county, judge, case caption. Powers all your documents.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '#nav-resources',
        popover: {
            title: '📚 Resources',
            description: 'AI-discovered local resources — court clerks, legal aid, and eFiling portals for your jurisdiction.',
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

/**
 * Onboarding tour component — shows a welcome dialog for first-time users
 * then walks them through the sidebar navigation. Persisted via localStorage.
 */
export default function OnboardingTour() {
    const [showWelcome, setShowWelcome] = useState(false);

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

    const startTour = useCallback(() => {
        setShowWelcome(false);

        // Wait a tick for the dialog to close before starting the tour
        requestAnimationFrame(() => {
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
                    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
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
                className="relative w-[90%] max-w-md rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
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

                    <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                        Welcome to <span className="font-serif italic">NEXX</span>
                    </h2>
                    <p className="text-[15px] text-white/70 font-medium leading-relaxed mb-8">
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

/** Trigger function to restart the tour programmatically (from the ? button). */
export function restartTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    // Reload so the tour component re-mounts fresh
    window.location.reload();
}
