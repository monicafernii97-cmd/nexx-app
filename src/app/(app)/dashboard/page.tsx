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

            {/* Stats — 2-col asymmetric grid */}
            <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10"
            >
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <motion.div
                            key={stat.label}
                            variants={fadeUp}
                            className="card-premium p-6"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{
                                        background: 'rgba(16, 185, 129, 0.08)',
                                        border: '1px solid rgba(16, 185, 129, 0.12)',
                                    }}
                                >
                                    <Icon size={18} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                                </div>
                            </div>
                            <p className="text-3xl font-bold tracking-tight mb-1" style={{ color: 'var(--zinc-900)' }}>
                                {stat.value}
                            </p>
                            <p className="text-xs font-medium" style={{ color: 'var(--zinc-400)' }}>
                                {stat.label}
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
                className="mb-10"
            >
                <h2 className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--zinc-500)' }}>
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.label} href={action.href} className="no-underline">
                                <motion.div
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                    className="card-premium p-5 cursor-pointer group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300"
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.06)',
                                                border: '1px solid rgba(16, 185, 129, 0.1)',
                                            }}
                                        >
                                            <Icon size={20} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm mb-0.5" style={{ color: 'var(--zinc-900)' }}>
                                                {action.label}
                                            </p>
                                            <p className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                                                {action.desc}
                                            </p>
                                        </div>
                                        <ArrowRight
                                            size={16}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                            style={{ color: 'var(--emerald-500)' }}
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
                <h2 className="text-xs font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: 'var(--zinc-500)' }}>
                    Recent Activity
                </h2>

                {incidents === undefined ? (
                    <div className="card-premium p-8 text-center">
                        <p className="text-sm" style={{ color: 'var(--zinc-400)' }}>Loading activity...</p>
                    </div>
                ) : incidents.length === 0 ? (
                    <div className="card-premium p-10 text-center">
                        <div
                            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{
                                background: 'rgba(16, 185, 129, 0.06)',
                                border: '1px solid rgba(16, 185, 129, 0.1)',
                            }}
                        >
                            <Clock size={24} weight="duotone" style={{ color: 'var(--emerald-500)' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: 'var(--zinc-700)' }}>
                            No activity yet
                        </p>
                        <p className="text-xs mb-5 max-w-[40ch] mx-auto" style={{ color: 'var(--zinc-400)' }}>
                            Start a conversation with NEXX or document your first incident to see your activity here.
                        </p>
                        <Link href="/chat" className="btn-primary text-xs inline-block">
                            Start Your First Session
                        </Link>
                    </div>
                ) : (
                    <div className="card-premium overflow-hidden divide-y divide-zinc-100">
                        {incidents.slice(0, 5).map((incident) => {
                            const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                            const date = parseLocalDate(incident.date);
                            return (
                                <Link key={incident._id} href={`/incident-report/${incident._id}`} className="no-underline block">
                                    <div className="px-6 py-4 group cursor-pointer hover:bg-zinc-50/50 transition-colors duration-200">
                                        <div className="flex items-center gap-4">
                                            <div className="text-center flex-shrink-0" style={{ minWidth: 45 }}>
                                                <p className="text-xs font-semibold" style={{ color: 'var(--zinc-400)' }}>
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </p>
                                                <p className="text-lg font-bold" style={{ color: 'var(--zinc-900)' }}>
                                                    {date.getDate()}
                                                </p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span
                                                        className="badge text-xs"
                                                        style={{ background: `${cat?.color}15`, color: cat?.color }}
                                                    >
                                                        {cat?.label || incident.category}
                                                    </span>
                                                    {incident.status === 'draft' && (
                                                        <span className="badge badge-warning text-xs">Draft</span>
                                                    )}
                                                </div>
                                                <p className="text-sm truncate" style={{ color: 'var(--zinc-500)' }}>
                                                    {incident.courtSummary || incident.narrative}
                                                </p>
                                            </div>
                                            <CaretRight
                                                size={14}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                                style={{ color: 'var(--zinc-400)' }}
                                            />
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
