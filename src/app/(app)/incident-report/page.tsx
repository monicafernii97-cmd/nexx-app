'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
    ClipboardList,
    Plus,
    Search,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';

/** Incident Report listing page with search, category filters, and delete functionality. */
export default function IncidentReportPage() {
    const incidents = useQuery(api.incidents.list);
    const removeIncident = useMutation(api.incidents.remove);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteId, setDeleteId] = useState<Id<'incidents'> | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const isLoading = incidents === undefined;

    const filteredIncidents = (incidents ?? []).filter((incident) => {
        if (activeFilter && incident.category !== activeFilter) return false;
        if (searchQuery && !incident.narrative.toLowerCase().includes(searchQuery.toLowerCase())
            && !(incident.courtSummary || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const handleDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await removeIncident({ id: deleteId });
            setDeleteId(null);
        } catch (error) {
            console.error('Delete error:', error);
            setDeleteError('Failed to delete incident. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

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
                                background: 'rgba(199, 208, 229, 0.12)',
                                border: '1px solid rgba(199, 208, 229, 0.25)',
                            }}
                        >
                            <ClipboardList size={20} style={{ color: '#FFFAF3' }} />
                        </div>
                        <h1 className="text-headline text-2xl" style={{ color: '#FFFAF3' }}>
                            Incident Report
                        </h1>
                    </div>
                    <p className="text-sm" style={{ color: '#E8DDD3' }}>
                        Sanctuary of Truth and Admissibility — your court-ready incident records.
                    </p>
                </div>
                <Link href="/incident-report/new" className="btn-primary text-xs flex items-center gap-2 no-underline">
                    <Plus size={14} /> Log Incident
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
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#E8DDD3' }} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search incidents..."
                        className="input-premium pl-11"
                        aria-label="Search incidents"
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFilter(null)}
                        className={`badge cursor-pointer transition-all ${!activeFilter ? 'badge-primary' : ''}`}
                        style={!activeFilter ? {} : { background: 'rgba(138, 122, 96, 0.1)', color: '#E8DDD3' }}
                    >
                        All
                    </button>
                    {INCIDENT_CATEGORIES.map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => setActiveFilter(activeFilter === cat.value ? null : cat.value)}
                            className="badge cursor-pointer transition-all"
                            style={{
                                background: activeFilter === cat.value ? `${cat.color}25` : 'rgba(138, 122, 96, 0.08)',
                                color: activeFilter === cat.value ? cat.color : '#E8DDD3',
                                border: activeFilter === cat.value ? `1px solid ${cat.color}40` : '1px solid transparent',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Incident Count */}
            {incidents && incidents.length > 0 && (
                <p className="text-xs mb-4" style={{ color: '#5A4A30' }}>
                    {filteredIncidents.length} of {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
                    {activeFilter || searchQuery ? ' (filtered)' : ''}
                </p>
            )}

            {/* Incident List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-4">
                        {[0, 1, 2].map((j) => (
                            <div key={j} className="card-premium p-5 animate-pulse">
                                <div className="flex items-start gap-4 pl-3">
                                    <div className="flex-shrink-0 text-center" style={{ minWidth: 60 }}>
                                        <div className="h-3 w-10 rounded" style={{ background: 'rgba(199, 208, 229, 0.1)' }} />
                                        <div className="h-7 w-8 rounded mt-1 mx-auto" style={{ background: 'rgba(199, 208, 229, 0.08)' }} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="h-3 w-20 rounded mb-2" style={{ background: 'rgba(138, 122, 96, 0.1)' }} />
                                        <div className="h-3 w-full rounded" style={{ background: 'rgba(138, 122, 96, 0.06)' }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredIncidents.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="card-premium p-10 text-center"
                    >
                        <div
                            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                            style={{ background: 'rgba(199, 208, 229, 0.08)', border: '1px solid rgba(199, 208, 229, 0.15)' }}
                        >
                            <ClipboardList size={28} style={{ color: '#E8DDD3' }} />
                        </div>
                        <p className="text-sm font-medium mb-2" style={{ color: '#C7D0E5' }}>
                            {incidents && incidents.length > 0 ? 'No incidents match your filters.' : 'No incidents documented yet.'}
                        </p>
                        <p className="text-xs mb-5" style={{ color: '#E8DDD3' }}>
                            Start documenting incidents to build your court-ready evidence portfolio.
                        </p>
                        <Link href="/incident-report/new" className="btn-primary text-xs no-underline">
                            Log Your First Incident
                        </Link>
                    </motion.div>
                ) : (
                    filteredIncidents.map((incident, i) => {
                        const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                        const [yr, mo, dy] = incident.date.split('-').map(Number);
                        const date = new Date(yr, mo - 1, dy);

                        return (
                            <motion.div
                                key={incident._id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(0.05 * i, 0.5) }}
                            >
                                <div className="flex items-stretch gap-0 group relative">
                                    <Link href={`/incident-report/${incident._id}`} className="flex-1 min-w-0">
                                        <div className="card-premium p-5 cursor-pointer relative overflow-hidden hover:border-[rgba(199, 208, 229,0.3)] transition-all rounded-r-none">
                                            {/* Severity Indicator */}
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                                                style={{ background: cat?.color || '#FFFAF3' }}
                                            />

                                            <div className="flex items-start gap-4 pl-3">
                                                {/* Date Column */}
                                                <div className="flex-shrink-0 text-center" style={{ minWidth: 60 }}>
                                                    <p className="text-xs font-semibold" style={{ color: '#FFFAF3' }}>
                                                        {date.toLocaleDateString('en-US', { month: 'short' })}
                                                    </p>
                                                    <p className="text-2xl font-bold" style={{ color: '#FFFAF3' }}>
                                                        {date.getDate()}
                                                    </p>
                                                    <p className="text-xs" style={{ color: '#E8DDD3' }}>
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
                                                        {incident.childrenInvolved && (
                                                            <span className="badge text-xs" style={{ background: 'rgba(229, 168, 74, 0.15)', color: '#E5A84A' }}>
                                                                Children
                                                            </span>
                                                        )}
                                                        {(() => {
                                                            const sev = Math.max(1, Math.min(3, incident.severity ?? 2));
                                                            return (
                                                                <div className="flex gap-0.5 ml-auto">
                                                                    {[1, 2, 3].map((level) => (
                                                                        <div
                                                                            key={level}
                                                                            className="w-1.5 h-4 rounded-sm"
                                                                            style={{
                                                                                background: level <= sev
                                                                                    ? cat?.color
                                                                                    : 'rgba(138, 122, 96, 0.15)',
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <p className="text-sm leading-relaxed line-clamp-2" style={{ color: '#D4C9B0' }}>
                                                        {incident.courtSummary || incident.narrative}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Delete Button — outside Link for valid HTML */}
                                    <button
                                        onClick={() => setDeleteId(incident._id)}
                                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0 px-3 flex items-center rounded-r-2xl hover:bg-[rgba(199,90,90,0.1)]"
                                        style={{ border: '1px solid rgba(138, 122, 96, 0.08)', borderLeft: 'none' }}
                                        title="Delete incident"
                                        aria-label="Delete incident"
                                    >
                                        <Trash2 size={14} style={{ color: '#C75A5A' }} />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={!!deleteId}
                isDeleting={isDeleting}
                deleteError={deleteError}
                onClose={() => { if (!isDeleting) { setDeleteId(null); setDeleteError(null); } }}
                onDelete={handleDelete}
                description="Are you sure you want to permanently delete this incident record? All associated analysis and court summaries will be lost."
                confirmLabel="Delete Permanently"
                showCloseButton
                dialogTitleId="list-delete-dialog-title"
            />
        </div>
    );
}
