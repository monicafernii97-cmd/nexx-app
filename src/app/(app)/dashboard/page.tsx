'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    Shield,
    ChatCircle,
    FileText,
    Plus,
    Clock,
    ArrowRight,
    Microphone,
    CaretRight,
    Warning,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { parseLocalDate } from '@/lib/dateUtils';

/** Quick-action cards linking to primary user flows. */
const quickActions = [
    { label: 'New Chat', desc: 'Talk to NEXX', href: '/chat', icon: Microphone },
    { label: 'Log Incident', desc: 'Document an event', href: '/incident-report/new', icon: Plus },
    { label: 'Draft Document', desc: 'Create a legal doc', href: '/docuvault', icon: FileText },
];

/** Stagger animation for list items. */
const stagger = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 20 } },
};

/** Main dashboard showing quick actions, recent incidents, and activity overview. */
export default function DashboardPage() {
    const { userId } = useUser();
    const incidents = useQuery(api.incidents.list);
    const conversations = useQuery(api.conversations.list, {});
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');

    const incidentCount = incidents?.length ?? 0;
    const conversationCount = conversations?.length ?? 0;
    const confirmedCount = incidents?.filter((i) => i.status === 'confirmed').length ?? 0;

    /** Summary statistics displayed in the dashboard header. */
    const stats = [
        { label: 'Documented Incidents', value: String(incidentCount), icon: Shield },
        { label: 'Active Conversations', value: String(conversationCount), icon: ChatCircle },
        { label: 'Court-Ready Records', value: String(confirmedCount), icon: FileText },
        { label: 'Pattern Alerts', value: '0', icon: Warning },
    ];

    /** Time-of-day greeting, set client-side only to avoid hydration mismatch. */
    const [greetingText] = useState(() => {
        if (typeof window === 'undefined') return '';
        const hour = new Date().getHours();
        return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    });

    const userName = user?.name ? `, ${user.name}` : '';

    return (
        <div className="max-w-6xl">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="mb-10"
            >
                <h1 className="text-headline text-3xl mb-2" style={{ color: 'var(--zinc-100)' }} suppressHydrationWarning>
                    {greetingText}{userName}
                </h1>
                <p className="text-sm" style={{ color: 'var(--zinc-500)' }}>
                    Your command center for strategic empowerment.
                </p>
            </motion.div>

            {/* Stats — Asymmetrical Bento Grid */}
            <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12"
            >
                {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    // Create an asymmetrical layout: first two take 6 cols each, next two take 6 cols each, or maybe 8/4 splits.
                    const colClass = i === 0 ? "md:col-span-8" : i === 1 ? "md:col-span-4" : i === 2 ? "md:col-span-7" : "md:col-span-5";
                    
                    return (
                        <motion.div
                            key={stat.label}
                            variants={fadeUp}
                            whileHover={{ y: -2, scale: 0.99 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className={`card-premium p-8 flex flex-col justify-between ${colClass}`}
                            style={{ minHeight: '180px' }}
                        >
                            <div className="flex items-center gap-4 mb-8">
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid var(--hairline)',
                                    }}
                                >
                                    <Icon size={24} weight="light" style={{ color: 'var(--emerald-400)' }} />
                                </div>
                                <p className="text-sm font-medium tracking-wide uppercase" style={{ color: 'var(--zinc-500)' }}>
                                    {stat.label}
                                </p>
                            </div>
                            <p className="text-5xl font-bold tracking-tighter" style={{ color: 'var(--zinc-100)' }}>
                                {stat.value}
                            </p>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Quick Actions — horizontal strip */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
                className="mb-12"
            >
                <h2 className="text-xs font-semibold tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--zinc-500)' }}>
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.label} href={action.href} className="no-underline">
                                <motion.div
                                    whileHover={{ y: -2, scale: 0.98 }}
                                    whileTap={{ scale: 0.95 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                    className="card-premium p-6 cursor-pointer group flex items-center gap-5"
                                >
                                    <div
                                        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-300 group-hover:bg-white/5"
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.02)',
                                            border: '1px solid var(--hairline)',
                                        }}
                                    >
                                        <Icon size={22} weight="light" style={{ color: 'var(--emerald-400)' }} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm mb-1" style={{ color: 'var(--zinc-100)' }}>
                                            {action.label}
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--zinc-500)' }}>
                                            {action.desc}
                                        </p>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white/10">
                                        <ArrowRight
                                            size={14}
                                            weight="bold"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                            style={{ color: 'var(--zinc-100)' }}
                                        />
                                    </div>
                                </motion.div>
                            </Link>
                        );
                    })}
                </div>
            </motion.div>

            {/* Recent Activity — clean list with divide-y */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
            >
                <h2 className="text-xs font-semibold tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--zinc-500)' }}>
                    Recent Activity
                </h2>

                {incidents === undefined ? (
                    <div className="card-premium p-12 text-center">
                        <p className="text-sm tracking-wide animate-pulse" style={{ color: 'var(--zinc-500)' }}>Syncing records...</p>
                    </div>
                ) : incidents.length === 0 ? (
                    <div className="card-premium p-16 text-center">
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                            style={{
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--hairline)',
                            }}
                        >
                            <Clock size={28} weight="light" style={{ color: 'var(--zinc-400)' }} />
                        </div>
                        <p className="text-lg font-light mb-3" style={{ color: 'var(--zinc-100)' }}>
                            No activity yet
                        </p>
                        <p className="text-sm mb-8 max-w-[45ch] mx-auto leading-relaxed" style={{ color: 'var(--zinc-500)' }}>
                            Start a conversation with NEXX or document your first incident to establish your timeline.
                        </p>
                        <Link href="/chat">
                            <button className="btn-primary flex items-center gap-3 mx-auto group">
                                <span className="text-sm tracking-wide">Start Session</span>
                                <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center transition-transform group-hover:translate-x-1">
                                    <ArrowRight size={12} weight="bold" />
                                </div>
                            </button>
                        </Link>
                    </div>
                ) : (
                    <div className="card-premium overflow-hidden divide-y divide-white/5">
                        {incidents.slice(0, 5).map((incident) => {
                            const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                            const date = parseLocalDate(incident.date);
                            return (
                                <Link key={incident._id} href={`/incident-report/${incident._id}`} className="no-underline block">
                                    <div className="px-8 py-5 group cursor-pointer hover:bg-white/[0.03] transition-colors duration-300">
                                        <div className="flex items-center gap-6">
                                            <div className="text-center flex-shrink-0" style={{ minWidth: 50 }}>
                                                <p className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--zinc-500)' }}>
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </p>
                                                <p className="text-xl font-bold tracking-tight" style={{ color: 'var(--zinc-100)' }}>
                                                    {date.getDate()}
                                                </p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span
                                                        className="badge px-3 py-1.5 text-[10px] uppercase tracking-wider border border-white/5"
                                                        style={{ background: `rgba(255,255,255,0.03)`, color: 'var(--zinc-300)' }}
                                                    >
                                                        {cat?.label || incident.category}
                                                    </span>
                                                    {incident.status === 'draft' && (
                                                        <span className="badge badge-warning text-[10px] uppercase tracking-wider backdrop-blur-md">Draft</span>
                                                    )}
                                                </div>
                                                <p className="text-sm truncate font-medium" style={{ color: 'var(--zinc-300)' }}>
                                                    {incident.courtSummary || incident.narrative}
                                                </p>
                                            </div>
                                            <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:bg-white/5">
                                                <CaretRight
                                                    size={14}
                                                    weight="light"
                                                    style={{ color: 'var(--zinc-400)' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
