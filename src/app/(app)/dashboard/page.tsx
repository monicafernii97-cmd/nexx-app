'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    ShieldCheck,
    ChatCircleText,
    FileText,
    Plus,
    WarningCircle,
    Clock,
    ArrowRight,
    Microphone,
    CaretRight,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { parseLocalDate } from '@/lib/dateUtils';

/** Quick-action cards linking to primary user flows. */
const quickActions = [
    { label: 'New Chat', desc: 'Secure session with NEXX', href: '/chat', icon: Microphone, accent: 'var(--champagne)' },
    { label: 'Log Incident', desc: 'Document an event', href: '/incident-report/new', icon: Plus, accent: 'var(--emerald)' },
    { label: 'Draft Document', desc: 'Generate court docs', href: '/docuvault', icon: FileText, accent: 'var(--info)' },
];

/** Ethereal Luxury Dashboard showing quick actions, recent incidents, and activity overview in Bento 2.0 layout. */
export default function DashboardPage() {
    const { userId } = useUser();
    const incidents = useQuery(api.incidents.list);
    const conversations = useQuery(api.conversations.list, {});
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');

    const incidentCount = incidents?.length ?? 0;
    const conversationCount = conversations?.length ?? 0;
    const confirmedCount = incidents?.filter((i) => i.status === 'confirmed').length ?? 0;

    /** Summary statistics displayed in the dashboard header bento grid. */
    const stats = [
        { label: 'Documented Incidents', value: String(incidentCount), icon: ShieldCheck, color: 'var(--sapphire)' },
        { label: 'Active Sessions', value: String(conversationCount), icon: ChatCircleText, color: 'var(--champagne)' },
        { label: 'Court-Ready Records', value: String(confirmedCount), icon: FileText, color: 'var(--info)' },
        { label: 'Pattern Alerts', value: '0', icon: WarningCircle, color: 'var(--warning)' },
    ];

    /** Time-of-day greeting, set client-side only to avoid hydration mismatch. */
    const [greetingText, setGreetingText] = useState('');
    useEffect(() => {
        const hour = new Date().getHours();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGreetingText(hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening');
    }, []);

    /** Formatted display name for the greeting header (empty if unavailable). */
    const userName = user?.name ? `, ${user.name}` : '';

    return (
        <div className="max-w-[1400px] w-full mx-auto h-full flex flex-col gap-8 pb-12 overflow-x-hidden">
            {/* Header Area */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 pt-4 px-2"
            >
                <div>
                    <h1 className="text-headline text-4xl mb-3 text-sapphire" suppressHydrationWarning>
                        {greetingText}<span className="text-editorial shimmer capitalize">{userName}</span>
                    </h1>
                    <p className="text-sapphire-muted font-medium text-[15px] tracking-wide max-w-lg">
                        Your sanctuary of strategic empowerment. Everything is securely encrypted and court-ready.
                    </p>
                </div>
                <div className="hidden md:block">
                    {/* Optional float decorative element or status pill */}
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-[11px] uppercase tracking-wider text-white bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-transparent shadow-[0_4px_12px_rgba(18,61,126,0.3)]">
                        <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981] animate-pulse" />
                        System Secure
                    </div>
                </div>
            </motion.div>

            {/* Bento Grid layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full relative z-10">
                
                {/* Left Column: Quick Actions & Stats (Cols 1-8) */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Quick Actions Array - Horizontal Bento Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {quickActions.map((action, i) => {
                            const Icon = action.icon;
                            return (
                                <Link key={action.label} href={action.href} className="no-underline block h-full">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 * i, duration: 0.5, type: 'spring' }}
                                        className="card-premium h-full p-6 flex flex-col justify-between group cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <Icon 
                                                size={32} 
                                                weight="regular" 
                                                style={{ color: action.accent }} 
                                                className="transition-transform duration-400 group-hover:scale-110" 
                                            />
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#0A1128] border border-[rgba(255,255,255,0.2)] opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0 duration-300 shadow-sm">
                                                <ArrowRight size={14} weight="bold" className="text-white" />
                                            </div>
                                        </div>
                                            <h3 className="font-semibold text-lg text-white mb-1 tracking-tight">
                                                {action.label}
                                            </h3>
                                            <p className="text-sm text-[rgba(255,255,255,0.6)] font-medium">
                                                {action.desc}
                                            </p>
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
                        className="glass-ethereal rounded-3xl p-6"
                    >
                        <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-sapphire-muted mb-6 px-2">
                            Overview Metrics
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {stats.map((stat) => {
                                const Icon = stat.icon;
                                return (
                                    <div key={stat.label} className="p-5 rounded-[2rem] bg-[#0A1128] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.2)] transition-colors shadow-sm cursor-default">
                                        <div className="flex items-center gap-3 mb-3">
                                            <Icon size={14} weight="regular" style={{ color: stat.color }} />
                                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{stat.label}</span>
                                        </div>
                                        <p className="text-3xl font-serif text-white tracking-tight">
                                            {stat.value}
                                        </p>
                                    </div>
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
                            <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] opacity-60 animate-pulse">
                                <div className="w-8 h-8 rounded-full border-2 border-champagne border-t-transparent animate-spin" />
                            </div>
                        ) : incidents.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[rgba(10,17,40,0.5)] rounded-[2rem] border border-[rgba(255,255,255,0.08)]">
                                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_15px_rgba(18,61,126,0.3)]">
                                    <Clock size={28} weight="fill" className="text-white" />
                                </div>
                                <p className="text-[16px] font-semibold text-white mb-2">
                                    Pristine Record
                                </p>
                                <p className="text-[13px] text-[rgba(255,255,255,0.6)] font-medium mb-6 max-w-[200px] leading-relaxed">
                                    Your activity feed is empty. Start a session to build your court-ready profile.
                                </p>
                                <Link href="/chat" className="btn-primary text-xs w-full shadow-md rounded-xl py-4 uppercase tracking-wider font-bold tracking-widest text-[#FFFFFF]">
                                    Begin Session
                                </Link>
                            </div>
                        ) : (
                            <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar pr-1 -mr-1">
                                {incidents.slice(0, 6).map((incident, i) => {
                                    const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                                    const date = parseLocalDate(incident.date);
                                    return (
                                        <motion.div
                                            key={incident._id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.6 + i * 0.1 }}
                                        >
                                            <Link href={`/incident-report/${incident._id}`} className="no-underline block outline-none">
                                                <div className="group relative bg-white/50 hover:bg-white border border-[rgba(10,22,41,0.04)] hover:border-[rgba(212,175,55,0.2)] p-4 rounded-2xl cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md">
                                                    <div className="flex items-start gap-4">
                                                        <div className="text-center flex-shrink-0 flex flex-col justify-center min-w-[42px] py-1 bg-cloud/50 rounded-xl px-2 h-fit">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-sapphire-muted">
                                                                {date.toLocaleDateString('en-US', { month: 'short' })}
                                                            </p>
                                                            <p className="text-lg font-bold text-sapphire leading-none mt-0.5">
                                                                {date.getDate()}
                                                            </p>
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                                <span
                                                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase"
                                                                    style={{ background: cat?.color ? `color-mix(in srgb, ${cat.color} 12%, transparent)` : 'var(--cloud)', color: cat?.color || 'var(--sapphire-muted)' }}
                                                                >
                                                                    {cat?.label || incident.category}
                                                                </span>
                                                                {incident.status === 'draft' && (
                                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-warning/10 text-warning">Draft</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[13px] font-medium text-sapphire line-clamp-2 leading-relaxed">
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
        </div>
    );
}
