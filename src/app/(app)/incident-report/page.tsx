'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import {
    ClipboardText,
    Plus,
    MagnifyingGlass,
    Trash,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { parseLocalDate } from '@/lib/dateUtils';

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
        <div className="max-w-4xl mx-auto pb-20 w-full px-2 mt-4">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pt-4 px-2"
            >
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border border-[rgba(255,255,255,0.3)] shadow-[0_8px_30px_rgba(46,92,154,0.5)] relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/10" />
                            <ClipboardText size={28} weight="fill" className="text-white relative z-10 drop-shadow-md" />
                        </div>
                        <h1 className="text-4xl font-serif text-headline text-white m-0 tracking-tight">
                            Incident <span className="text-editorial shimmer">Report</span>
                        </h1>
                    </div>
                    <p className="text-[15px] font-medium text-white/70 max-w-lg">
                        Sanctuary of Truth and Admissibility — your court-ready records.
                    </p>
                </div>
                <Link href="/incident-report/new" className="btn-primary inline-flex items-center justify-center gap-2 no-underline shadow-[0_8px_20px_rgba(18,61,126,0.4)] flex-shrink-0 px-6 py-3 rounded-xl">
                    <Plus size={16} weight="bold" /> Log Incident
                </Link>
            </motion.div>

            {/* Search & Filters */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mb-8 space-y-4"
            >
                <div className="relative max-w-md w-full">
                    <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search incidents..."
                        className="w-full h-12 bg-[#0A1128] border border-[rgba(255,255,255,0.15)] rounded-xl text-white placeholder:text-white/40 pl-11 pr-4 focus:outline-none focus:border-[rgba(255,255,255,0.4)] focus:shadow-[0_4px_20px_rgba(18,61,126,0.3)] transition-all"
                        aria-label="Search incidents"
                    />
                </div>
                <div className="flex flex-wrap gap-2.5 mt-4">
                    <button
                        onClick={() => setActiveFilter(null)}
                        aria-pressed={!activeFilter}
                        className={`px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-all duration-300 border shadow-sm ${
                            !activeFilter 
                                ? 'bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border-[rgba(255,255,255,0.3)] text-white shadow-[0_4px_20px_rgba(46,92,154,0.4)] scale-105 relative overflow-hidden z-10' 
                                : 'bg-[rgba(255,255,255,0.05)] backdrop-blur-md border-[rgba(255,255,255,0.15)] text-white hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.1)] hover:-translate-y-0.5'
                        }`}
                    >
                        {!activeFilter && <span className="absolute inset-0 bg-white/10" />}
                        <span className="relative z-10">All Records</span>
                    </button>
                    {INCIDENT_CATEGORIES.map((cat) => (
                        <button
                            key={cat.value}
                            onClick={() => setActiveFilter(activeFilter === cat.value ? null : cat.value)}
                            aria-pressed={activeFilter === cat.value}
                            className={`px-4 py-2.5 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-all duration-300 border shadow-sm ${
                                activeFilter === cat.value 
                                    ? 'bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border-[rgba(255,255,255,0.3)] text-white shadow-[0_4px_20px_rgba(46,92,154,0.4)] scale-105 relative overflow-hidden z-10' 
                                    : 'bg-[rgba(255,255,255,0.05)] backdrop-blur-md border-[rgba(255,255,255,0.15)] text-white hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.1)] hover:-translate-y-0.5'
                            }`}
                        >
                            {activeFilter === cat.value && <span className="absolute inset-0 bg-white/10" />}
                            <span className="relative z-10">{cat.label}</span>
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Incident Count & List */}
            <div className="space-y-4">
                {incidents && incidents.length > 0 && (
                    <p className="text-xs font-bold tracking-widest uppercase text-sapphire-muted px-2 pb-2">
                        {filteredIncidents.length} of {incidents.length} Records
                        {activeFilter || searchQuery ? ' (filtered)' : ''}
                    </p>
                )}

                {isLoading ? (
                    <div className="space-y-4">
                        {[0, 1, 2].map((j) => (
                            <div key={j} className="card-premium p-6 animate-pulse border-white flex gap-4">
                                <div className="w-12 h-16 rounded-xl bg-white/10" />
                                <div className="flex-1 space-y-3 pt-2">
                                    <div className="h-4 w-1/4 rounded bg-white/10" />
                                    <div className="h-4 w-3/4 rounded bg-white/5" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredIncidents.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-ethereal p-12 text-center rounded-[2rem] border-white"
                    >
                        <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center bg-white shadow-sm border border-[rgba(10,22,41,0.05)]">
                            <ClipboardText size={32} weight="duotone" className="text-[#0A1128]" />
                        </div>
                        <h2 className="text-xl font-serif font-bold text-white mb-2">
                            {incidents && incidents.length > 0 ? 'No exact matches found.' : 'Your record is pristine.'}
                        </h2>
                        <p className="text-sm font-medium text-sapphire-muted max-w-md mx-auto mb-8">
                            {incidents && incidents.length > 0
                                ? 'Adjust your search or filters to locate specific events.'
                                : 'Start documenting incidents to build your court-ready evidence portfolio securely.'}
                        </p>
                        {(!incidents || incidents.length === 0) && (
                            <Link href="/incident-report/new" className="btn-primary inline-flex no-underline">
                                Log Your First Incident
                            </Link>
                        )}
                    </motion.div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {filteredIncidents.map((incident, i) => {
                            const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
                            const date = parseLocalDate(incident.date);

                            return (
                                <motion.div
                                    key={incident._id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(0.05 * i, 0.4), type: 'spring' }}
                                    className="group relative flex items-stretch"
                                >
                                    <Link href={`/incident-report/${incident._id}`} className="flex-1 min-w-0 no-underline outline-none">
                                        <div className="card-premium p-5 hover:bg-white border-white/80 transition-all duration-300 flex items-start gap-5">
                                            {/* Date Column */}
                                            <div className="flex flex-col items-center justify-center min-w-[56px] py-2 bg-cloud rounded-xl px-2 shrink-0 border border-[rgba(10,22,41,0.03)]">
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-sapphire-muted">
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </p>
                                                <p className="text-2xl font-bold text-sapphire leading-none mt-1 mb-0.5">
                                                    {date.getDate()}
                                                </p>
                                                <p className="text-[10px] font-semibold text-sapphire-muted/60">
                                                    {incident.time}
                                                </p>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 py-1">
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase"
                                                        style={{ 
                                                            background: cat?.color ? `color-mix(in srgb, ${cat.color} 12%, transparent)` : 'var(--cloud)', 
                                                            color: cat?.color || 'var(--sapphire-muted)' 
                                                        }}
                                                    >
                                                        {cat?.label || incident.category}
                                                    </span>
                                                    {incident.status === 'draft' && (
                                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase bg-warning/10 text-warning">Draft</span>
                                                    )}
                                                    {incident.status === 'confirmed' && (
                                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase bg-emerald/10 text-emerald">Confirmed</span>
                                                    )}
                                                    {incident.childrenInvolved && (
                                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase bg-warning/10 text-warning">Children</span>
                                                    )}
                                                    
                                                    {/* Severity Indicator */}
                                                    {(() => {
                                                        const sev = Math.max(1, Math.min(3, incident.severity ?? 2));
                                                        return (
                                                            <div className="flex gap-1 ml-auto">
                                                                {[1, 2, 3].map((level) => (
                                                                    <div
                                                                        key={level}
                                                                        className="w-1.5 h-4 rounded-sm"
                                                                        style={{
                                                                            background: level <= sev
                                                                                ? (cat?.color || 'var(--sapphire)')
                                                                                : 'rgba(10,22,41,0.06)',
                                                                        }}
                                                                    />
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <p className="text-[14px] leading-relaxed text-sapphire font-medium line-clamp-2">
                                                    {incident.courtSummary || incident.narrative}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Reveal Delete Button on hover */}
                                    <button
                                        onClick={() => setDeleteId(incident._id)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center justify-center w-10 h-10 rounded-full bg-rose/10 text-rose hover:bg-rose hover:text-white transition-all duration-300 shadow-sm cursor-pointer border border-rose/20"
                                        title="Delete incident"
                                        aria-label="Delete incident"
                                    >
                                        <Trash size={18} weight="duotone" />
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={!!deleteId}
                isDeleting={isDeleting}
                deleteError={deleteError}
                onClose={() => { if (!isDeleting) { setDeleteId(null); setDeleteError(null); } }}
                onDelete={handleDelete}
                description="Are you sure you want to permanently delete this record? All associated analysis and court summaries will be unrecoverable."
                confirmLabel="Delete Permanently"
                showCloseButton
                dialogTitleId="list-delete-dialog-title"
            />
        </div>
    );
}
