'use client';

import { Suspense, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'convex/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    Note,
    ChatCircleText,
    FileText,
    Plus,
    WarningCircle,
    Clock,
    ArrowRight,
    Microphone,
    CaretRight,
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

    const incidentCount = incidents === undefined ? null : incidents.length;
    const conversationCount = conversations === undefined ? null : conversations.filter((c) => c.status === 'active').length;
    const confirmedCount = incidents === undefined ? null : incidents.filter((i) => i.status === 'confirmed').length;

    /** Summary statistics displayed in the dashboard header bento grid. */
    const stats = [
        { label: 'Incidents', value: incidentCount === null ? '—' : String(incidentCount), icon: Note, color: '#F59E0B', href: '/incident-report' },
        { label: 'Sessions', value: conversationCount === null ? '—' : String(conversationCount), icon: ChatCircleText, color: 'var(--champagne)', href: '/chat' },
        { label: 'Records', value: confirmedCount === null ? '—' : String(confirmedCount), icon: FileText, color: '#60A5FA', href: '/docuvault/gallery' },
        { label: 'Alerts', value: '—', icon: WarningCircle, color: 'var(--warning)', href: '/nex-profile' },
    ];

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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full relative z-10 flex-1 min-h-0">
                
                {/* 4-Pipeline Switcher Grid (Cols 1-8) */}
                <div className="lg:col-span-8 flex flex-col min-h-0 space-y-6">
                    <div id="pipeline-switcher" className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-h-0">
                        {pipelineCards.map((card, i) => {
                            const Icon = card.icon;
                            return (
                                <Link key={card.label} href={card.href} className="no-underline block h-full">
                                    <motion.div
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 * i, duration: 0.6, type: 'spring' }}
                                        className="h-full"
                                    >
                                      <div className="floating-element hyper-glass h-full flex flex-col items-center justify-center group relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:glow-slate py-6">
                                        <div className="mb-4 p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-all duration-500">
                                            <Icon 
                                                size={24} 
                                                weight="light" 
                                                style={{ color: card.accent }} 
                                                className="transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3" 
                                            />
                                        </div>
                                        <h3 className="text-lg font-serif text-white mb-1.5 tracking-tight drop-shadow-sm">
                                            {card.label}
                                        </h3>
                                        <p className="text-[10px] text-white/40 font-medium mb-3 uppercase tracking-[0.2em] drop-shadow-sm">
                                            {card.subtitle}
                                        </p>
                                        <p className="text-[12px] text-white/50 font-medium px-6 text-center leading-relaxed">
                                            {card.desc}
                                        </p>
                                        
                                        {/* Luxury glint effect */}
                                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                      </div>
                                    </motion.div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Stats Grid - Bento Block */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4, duration: 0.6 }}
                        className="glass-ethereal rounded-3xl p-5 shrink-0"
                    >
                        <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase text-sapphire-muted mb-4 px-2">
                            Overview Metrics
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {stats.map((stat) => {
                                const Icon = stat.icon;
                                return (
                                    <Link key={stat.label} href={stat.href} className="no-underline block h-full">
                                        <div className="p-4 flex flex-col justify-between h-full rounded-[2rem] bg-[#0A1128] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)] hover:bg-[#121A3A] transition-colors shadow-sm cursor-pointer group">
                                            <div className="flex items-center gap-2 mb-2 shrink-0">
                                                <Icon size={12} weight="fill" color={stat.color} className="shrink-0 transition-transform group-hover:scale-110" />
                                                <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest leading-tight">{stat.label}</span>
                                            </div>
                                            <p className="text-lg font-serif text-white tracking-tight">
                                                {stat.value}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>

                {/* Right Column: Recent Activity Feed (Cols 9-12) */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
                    className="lg:col-span-4 flex flex-col h-full"
                >
                    <div className="glass-ethereal rounded-3xl p-6 flex-1 flex flex-col h-full border-white">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-sapphire-muted">
                                Recent Activity
                            </h2>
                            <Link href="/incident-report" className="text-xs font-semibold text-champagne hover:underline no-underline">
                                View all
                            </Link>
                        </div>

                        {incidents === undefined ? (
                            <div
                                className="flex-1 flex flex-col items-center justify-center min-h-[200px] opacity-60 animate-pulse"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="w-8 h-8 rounded-full border-2 border-champagne border-t-transparent animate-spin" aria-hidden="true" />
                                <span className="sr-only">Loading recent activity</span>
                            </div>
                        ) : incidents.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[rgba(10,17,40,0.5)] rounded-[2rem] border border-[rgba(255,255,255,0.08)]">
                                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_15px_rgba(18,61,126,0.3)]">
                                    <Clock size={20} weight="fill" className="text-white" />
                                </div>
                                <p className="text-[14px] font-semibold text-white mb-2">
                                    Pristine Record
                                </p>
                                <p className="text-[13px] text-[rgba(255,255,255,0.6)] font-medium mb-6 max-w-[200px] leading-relaxed">
                                    Your activity feed is empty. Start a session to build your court-ready profile.
                                </p>
                                <Link href="/chat" className="btn-primary text-xs w-full shadow-md rounded-xl py-4 uppercase font-bold tracking-widest text-[#FFFFFF]">
                                    Begin Session
                                </Link>
                            </div>
                        ) : (
                            <div className="flex-1 space-y-3 overflow-hidden flex flex-col">
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
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.6 + i * 0.1 }}
                                        >
                                            <Link href={`/incident-report/${incident._id}`} className="no-underline block rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1128]">
                                                <div className="group relative bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(212,175,55,0.3)] p-4 rounded-[1.5rem] cursor-pointer transition-all duration-300 shadow-sm hover:shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-md overflow-hidden">
                                                    {/* Hyperglass glint hover effect */}
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.05)] to-transparent -translate-x-full group-hover:animate-glint pointer-events-none" />
                                                    
                                                    <div className="flex items-start gap-4 relative z-10">
                                                        <div className="text-center flex-shrink-0 flex flex-col justify-center min-w-[42px] py-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[0.85rem] px-2 h-fit shadow-sm backdrop-blur-sm">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                                                                {date ? date.toLocaleDateString('en-US', { month: 'short' }) : '—'}
                                                            </p>
                                                            <p className="text-lg font-bold text-white/90 leading-none mt-0.5">
                                                                {date ? date.getDate() : '—'}
                                                            </p>
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                                <span
                                                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase border shadow-sm backdrop-blur-md"
                                                                    style={{ 
                                                                        background: cat?.color ? `color-mix(in srgb, ${cat.color} 15%, transparent)` : 'rgba(255,255,255,0.05)', 
                                                                        color: cat?.color || 'rgba(255,255,255,0.8)',
                                                                        borderColor: cat?.color ? `color-mix(in srgb, ${cat.color} 30%, transparent)` : 'rgba(255,255,255,0.1)'
                                                                    }}
                                                                >
                                                                    {cat?.label || incident.category}
                                                                </span>
                                                                {incident.status === 'draft' && (
                                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-[rgba(255,183,77,0.1)] text-warning border border-[rgba(255,183,77,0.2)] shadow-sm">Draft</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[13px] font-medium text-white/80 line-clamp-2 leading-relaxed">
                                                                {incident.courtSummary || incident.narrative || 'Draft incident report...'}
                                                            </p>
                                                        </div>
                                                        <div className="flex-shrink-0 mt-3 mr-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-[-8px] group-hover:translate-x-0">
                                                            <CaretRight size={14} weight="bold" className="text-champagne" />
                                                        </div>
                                                    </div>
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
