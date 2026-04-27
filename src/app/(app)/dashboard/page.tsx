'use client';

import { Suspense, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'convex/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    Note,
    FileText,
    Plus,
    Clock,
    Microphone,
    House,
} from '@phosphor-icons/react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import OnboardingTour from '@/components/OnboardingTour';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { parseLocalDate } from '@/lib/dateUtils';
import { useWorkspace } from '@/lib/workspace-context';

import '@/styles/pipelines.css';

/** 4-Pipeline Switcher Cards - The primary intent routes for NEXX. */
const pipelineCards = [
    { 
        label: 'Draft Court Document', 
        desc: 'Motion, Petition, Response, Declaration', 
        href: '/docuvault', 
        icon: FileText, 
        accent: '#6366F1',
        subtitle: 'Court-ready legal filings'
    },
    { 
        label: 'Export Workspace', 
        desc: 'Summary Report or Exhibit Document', 
        href: '/chat/overview', 
        icon: Note, 
        accent: '#10B981',
        subtitle: 'Evidence & summary reports'
    },
    { 
        label: 'Build Exhibit Packet', 
        desc: 'Single Exhibit or Full Packet with Bates', 
        href: '/docuvault/exhibits', 
        icon: Plus, 
        accent: '#F59E0B',
        subtitle: 'Evidence assembly'
    },
    { 
        label: 'Record Incident', 
        desc: 'Voice or text intake to structured timeline', 
        href: '/incident-report', 
        icon: Microphone, 
        accent: '#EF4444',
        subtitle: 'Source event intake'
    },
];

/** Ethereal Luxury Dashboard showing 4-Pipeline Switcher, recent incidents, and activity overview in Bento 2.0 layout. */
export default function DashboardPage() {
    return (
        <Suspense fallback={
            <PageContainer>
                <div className="flex items-center justify-center h-64">
                    <div className="w-10 h-10 rounded-full border-2 border-[#60A5FA] border-t-transparent animate-spin" />
                </div>
            </PageContainer>
        }>
            <DashboardContent />
        </Suspense>
    );
}

/** Inner dashboard content — reads search params for checkout toast and renders the bento grid. */
function DashboardContent() {
    const { userId } = useUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeCaseId } = useWorkspace();
    const incidents = useQuery(
        api.incidents.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const conversations = useQuery(
        api.conversations.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip'
    );
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');

    // ── Checkout success toast ──
    const isCheckoutSuccess = searchParams.get('checkout') === 'success';
    const [dismissedCheckoutToast, setDismissedCheckoutToast] = useState(false);
    const showCheckoutToast = isCheckoutSuccess && !dismissedCheckoutToast;

    useEffect(() => {
        if (!isCheckoutSuccess) return;
        const timer = setTimeout(() => {
            setDismissedCheckoutToast(true);
            router.replace('/dashboard', { scroll: false });
        }, 5000);
        return () => clearTimeout(timer);
    }, [isCheckoutSuccess, router]);



    /** Time-of-day greeting. */
    const [greetingText] = useState(() => {
        if (typeof window === 'undefined') return '';
        const hour = new Date().getHours();
        return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    });

    const userName = user?.name ? `, ${user.name}` : '';

    return (
        <PageContainer>
            <AnimatePresence>
                {showCheckoutToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        role="status"
                        aria-live="polite"
                        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-sm font-bold tracking-wide shadow-[0_8px_30px_rgba(16,185,129,0.3)] flex items-center gap-2"
                    >
                        ✓ Welcome! Your subscription is now active.
                    </motion.div>
                )}
            </AnimatePresence>

            <OnboardingTour />

            <PageHeader
                icon={House}
                title={
                    <span suppressHydrationWarning>
                        {greetingText}<span className="text-editorial shimmer capitalize">{userName}</span>
                    </span>
                }
                description="What would you like to do?"
            />

            {/* Pipeline Launcher Cards */}
            <div className="space-y-6 pb-6">
                <div id="pipeline-switcher" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {pipelineCards.map((card, i) => {
                        const Icon = card.icon;
                        return (
                            <Link key={card.label} href={card.href} className="no-underline block">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.08 * i, duration: 0.5, type: 'spring' }}
                                >
                                  <div className="floating-element hyper-glass flex flex-col items-center justify-center group relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:glow-slate py-4 sm:py-5">
                                    <div className="mb-2 p-2 rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-all duration-500">
                                        <Icon 
                                            size={18} 
                                            weight="light" 
                                            style={{ color: card.accent }} 
                                            className="transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3" 
                                        />
                                    </div>
                                    <h3 className="text-[13px] font-serif text-white mb-0.5 tracking-tight drop-shadow-sm">
                                        {card.label}
                                    </h3>
                                    <p className="text-[8px] text-white/40 font-medium uppercase tracking-[0.15em] drop-shadow-sm">
                                        {card.subtitle}
                                    </p>
                                    
                                    {/* Luxury glint effect */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                  </div>
                                </motion.div>
                            </Link>
                        );
                    })}
                </div>

                {/* Recent Activity — compact inline list */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
                >
                    <div className="glass-ethereal rounded-2xl p-3">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-[9px] font-bold tracking-[0.2em] uppercase text-sapphire-muted">
                                Recent Activity
                            </h2>
                            <Link href="/incident-report" className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors no-underline">
                                View all
                            </Link>
                        </div>

                        {incidents === undefined ? (
                            <div
                                className="flex items-center justify-center py-4 opacity-60 animate-pulse"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="w-5 h-5 rounded-full border-2 border-champagne border-t-transparent animate-spin" aria-hidden="true" />
                                <span className="sr-only">Loading recent activity</span>
                            </div>
                        ) : incidents.length === 0 ? (
                            <div className="flex items-center gap-3 py-3 px-4 bg-[rgba(10,17,40,0.4)] rounded-xl border border-[rgba(255,255,255,0.06)]">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-sm shrink-0">
                                    <Clock size={14} weight="fill" className="text-white" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-white/70">No activity yet</p>
                                    <p className="text-[10px] text-white/40">Start a session to build your timeline.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {incidents.slice(0, 4).map((incident, i) => {
                                    const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                                    const date = (() => {
                                        try {
                                            const parsed = parseLocalDate(incident.date);
                                            return Number.isNaN(parsed.getTime()) ? null : parsed;
                                        } catch {
                                            return null;
                                        }
                                    })();
                                    return (
                                        <motion.div
                                            key={incident._id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.5 + i * 0.08 }}
                                        >
                                            <Link href={`/incident-report/${incident._id}`} className="no-underline block">
                                                <div className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200">
                                                    <div className="text-center shrink-0 w-8">
                                                        <p className="text-[8px] font-bold uppercase text-white/40 leading-none">
                                                            {date ? date.toLocaleDateString('en-US', { month: 'short' }) : '—'}
                                                        </p>
                                                        <p className="text-[11px] font-bold text-white/80 leading-none mt-0.5">
                                                            {date ? date.getDate() : '—'}
                                                        </p>
                                                    </div>
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide uppercase border shrink-0"
                                                        style={{ 
                                                            background: cat?.color ? `color-mix(in srgb, ${cat.color} 12%, transparent)` : 'rgba(255,255,255,0.04)', 
                                                            color: cat?.color || 'rgba(255,255,255,0.7)',
                                                            borderColor: cat?.color ? `color-mix(in srgb, ${cat.color} 25%, transparent)` : 'rgba(255,255,255,0.08)'
                                                        }}
                                                    >
                                                        {cat?.label || incident.category}
                                                    </span>
                                                    <p className="text-[11px] text-white/50 truncate flex-1">
                                                        {incident.courtSummary || incident.narrative || 'Draft incident report...'}
                                                    </p>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </PageContainer>
    );
}
