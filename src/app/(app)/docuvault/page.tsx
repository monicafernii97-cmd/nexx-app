'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import {
    Shield,
    Plus,
    Search,
    ChevronRight,
    Clock,
} from 'lucide-react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

export default function DocuVaultPage() {
    const { userId } = useUser();
    const incidents = useQuery(api.incidents.list);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredIncidents = (incidents ?? []).filter((incident) => {
        if (activeFilter && incident.category !== activeFilter) return false;
        if (searchQuery && !incident.narrative.toLowerCase().includes(searchQuery.toLowerCase())
            && !(incident.courtSummary || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between mb-6"
            >
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'rgba(197, 139, 7, 0.12)',
                                border: '1px solid rgba(197, 139, 7, 0.25)',
                            }}
                        >
                            <Shield size={20} style={{ color: '#C58B07' }} />
                        </div>
                        <h1 className="text-headline text-2xl" style={{ color: '#F5EFE0' }}>
                            DocuVault
                        </h1>
                    </div>
                    <p className="text-sm" style={{ color: '#8A7A60' }}>
                        Sanctuary of Truth and Admissibility — your court-ready incident records.
                    </p>
                </div>
                <Link href="/docuvault/new">
                    <button className="btn-gold text-xs flex items-center gap-2">
                        <Plus size={14} /> Log Incident
                    </button>
                </Link>
            </motion.div>

            {/* Search & Filters */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6 space-y-3"
            >
                <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#8A7A60' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search incidents..."
                        className="input-gilded pl-11"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFilter(null)}
                        className={`badge cursor-pointer transition-all ${!activeFilter ? 'badge-gold' : ''}`}
                        style={!activeFilter ? {} : { background: 'rgba(138, 122, 96, 0.1)', color: '#8A7A60' }}
                    >
                        All
                    </button>
                    {INCIDENT_CATEGORIES.slice(0, 6).map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => setActiveFilter(activeFilter === cat.value ? null : cat.value)}
                            className="badge cursor-pointer transition-all"
                            style={{
                                background: activeFilter === cat.value ? `${cat.color}25` : 'rgba(138, 122, 96, 0.08)',
                                color: activeFilter === cat.value ? cat.color : '#8A7A60',
                                border: activeFilter === cat.value ? `1px solid ${cat.color}40` : '1px solid transparent',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Timeline */}
            <div className="space-y-4">
                {filteredIncidents.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="card-gilded p-10 text-center"
                    >
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{ background: 'rgba(197, 139, 7, 0.08)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                        >
                            <Shield size={28} style={{ color: '#775E22' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: '#B8A88A' }}>
                            {incidents && incidents.length > 0 ? 'No incidents match your filters.' : 'No incidents documented yet.'}
                        </p>
                        <p className="text-xs mb-5" style={{ color: '#8A7A60' }}>
                            Start documenting incidents to build your court-ready evidence portfolio.
                        </p>
                        <Link href="/docuvault/new">
                            <button className="btn-gold text-xs">Log Your First Incident</button>
                        </Link>
                    </motion.div>
                ) : (
                    filteredIncidents.map((incident, i) => {
                        const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                        const date = new Date(incident.date);

                        return (
                            <motion.div
                                key={incident._id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * i }}
                            >
                                <div className="card-gilded p-5 group cursor-pointer relative overflow-hidden">
                                    {/* Severity Indicator */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                                        style={{ background: cat?.color || '#C58B07' }}
                                    />

                                    <div className="flex items-start gap-4 pl-3">
                                        {/* Date Column */}
                                        <div className="flex-shrink-0 text-center" style={{ minWidth: 60 }}>
                                            <p className="text-xs font-semibold" style={{ color: '#C58B07' }}>
                                                {date.toLocaleDateString('en-US', { month: 'short' })}
                                            </p>
                                            <p className="text-2xl font-bold" style={{ color: '#F5EFE0' }}>
                                                {date.getDate()}
                                            </p>
                                            <p className="text-xs" style={{ color: '#8A7A60' }}>
                                                {incident.time}
                                            </p>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span
                                                    className="badge text-xs"
                                                    style={{ background: `${cat?.color}20`, color: cat?.color }}
                                                >
                                                    {cat?.label || incident.category}
                                                </span>
                                                {incident.status === 'draft' && (
                                                    <span className="badge badge-warning text-xs">Draft</span>
                                                )}
                                                {incident.status === 'confirmed' && (
                                                    <span className="badge badge-success text-xs">Confirmed</span>
                                                )}
                                                <div className="flex gap-0.5 ml-auto">
                                                    {[1, 2, 3].map((level) => (
                                                        <div
                                                            key={level}
                                                            className="w-1.5 h-4 rounded-sm"
                                                            style={{
                                                                background: level <= incident.severity
                                                                    ? cat?.color
                                                                    : 'rgba(138, 122, 96, 0.15)',
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-sm leading-relaxed line-clamp-2" style={{ color: '#D4C9B0' }}>
                                                {incident.courtSummary || incident.narrative}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
