'use client';

import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    Shield,
    MessageCircle,
    FileText,
    Plus,
    AlertTriangle,
    Clock,
    ArrowRight,
    Mic,
    ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

const quickActions = [
    { label: 'New Chat', desc: 'Talk to NEXX', href: '/chat', icon: Mic, color: '#C58B07' },
    { label: 'Log Incident', desc: 'Document an event', href: '/docuvault/new', icon: Plus, color: '#5A9E6F' },
    { label: 'Draft Document', desc: 'Create a legal doc', href: '/legal', icon: FileText, color: '#5A8EC9' },
];

export default function DashboardPage() {
    const { userId, isLoading: userLoading } = useUser();
    const incidents = useQuery(api.incidents.list);
    const conversations = useQuery(api.conversations.list, {});
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');

    const incidentCount = incidents?.length ?? 0;
    const conversationCount = conversations?.length ?? 0;
    const confirmedCount = incidents?.filter((i) => i.status === 'confirmed').length ?? 0;

    const stats = [
        { label: 'Documented Incidents', value: String(incidentCount), icon: Shield, color: '#C58B07' },
        { label: 'Active Conversations', value: String(conversationCount), icon: MessageCircle, color: '#5A9E6F' },
        { label: 'Court-Ready Records', value: String(confirmedCount), icon: FileText, color: '#5A8EC9' },
        { label: 'Pattern Alerts', value: '0', icon: AlertTriangle, color: '#E5A84A' },
    ];

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const userName = user?.name && user.name !== 'Guest' ? `, ${user.name}` : '';

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-8"
            >
                <h1 className="text-headline text-3xl mb-2" style={{ color: '#F5EFE0' }}>
                    {greeting()}{userName}
                </h1>
                <p className="text-sm" style={{ color: '#8A7A60' }}>
                    Your sanctuary of strategic empowerment.
                </p>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * i, duration: 0.5 }}
                            className="card-gilded p-5"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                                    style={{ background: `${stat.color}15`, border: `1px solid ${stat.color}30` }}
                                >
                                    <Icon size={18} style={{ color: stat.color }} />
                                </div>
                            </div>
                            <p className="text-2xl font-bold mb-1" style={{ color: '#F5EFE0' }}>
                                {stat.value}
                            </p>
                            <p className="text-xs" style={{ color: '#8A7A60' }}>
                                {stat.label}
                            </p>
                        </motion.div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mb-8"
            >
                <h2 className="text-sm font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: '#92783A' }}>
                    Quick Actions
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {quickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.label} href={action.href} className="no-underline">
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="card-gilded p-5 cursor-pointer group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:shadow-lg"
                                            style={{
                                                background: `linear-gradient(135deg, ${action.color}20, ${action.color}08)`,
                                                border: `1px solid ${action.color}40`,
                                            }}
                                        >
                                            <Icon size={20} style={{ color: action.color }} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-sm mb-0.5" style={{ color: '#F5EFE0' }}>
                                                {action.label}
                                            </p>
                                            <p className="text-xs" style={{ color: '#8A7A60' }}>
                                                {action.desc}
                                            </p>
                                        </div>
                                        <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: action.color }} />
                                    </div>
                                </motion.div>
                            </Link>
                        );
                    })}
                </div>
            </motion.div>

            {/* Recent Incidents */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
            >
                <h2 className="text-sm font-semibold tracking-[0.15em] uppercase mb-4" style={{ color: '#92783A' }}>
                    Recent Activity
                </h2>

                {!incidents || incidents.length === 0 ? (
                    <div className="card-gilded p-8 text-center">
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{ background: 'rgba(197, 139, 7, 0.08)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                        >
                            <Clock size={28} style={{ color: '#775E22' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: '#B8A88A' }}>
                            No activity yet
                        </p>
                        <p className="text-xs mb-5" style={{ color: '#8A7A60' }}>
                            Start a conversation with NEXX or document your first incident to see your activity here.
                        </p>
                        <Link href="/chat">
                            <button className="btn-gold text-xs">Start Your First Session</button>
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {incidents.slice(0, 5).map((incident) => {
                            const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                            const date = new Date(incident.date);
                            return (
                                <Link key={incident._id} href={`/docuvault/${incident._id}`} className="no-underline block">
                                    <div className="card-gilded p-4 group cursor-pointer">
                                        <div className="flex items-center gap-4">
                                            <div className="text-center flex-shrink-0" style={{ minWidth: 45 }}>
                                                <p className="text-xs font-semibold" style={{ color: '#C58B07' }}>
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </p>
                                                <p className="text-lg font-bold" style={{ color: '#F5EFE0' }}>
                                                    {date.getDate()}
                                                </p>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span
                                                        className="badge text-xs"
                                                        style={{ background: `${cat?.color}20`, color: cat?.color }}
                                                    >
                                                        {cat?.label || incident.category}
                                                    </span>
                                                    {incident.status === 'draft' && (
                                                        <span className="badge badge-warning text-xs">Draft</span>
                                                    )}
                                                </div>
                                                <p className="text-sm truncate" style={{ color: '#D4C9B0' }}>
                                                    {incident.courtSummary || incident.narrative}
                                                </p>
                                            </div>
                                            <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#C58B07' }} />
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
