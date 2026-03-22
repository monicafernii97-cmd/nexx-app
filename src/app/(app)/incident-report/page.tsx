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
    Tag,
    ArrowRight,
    DownloadSimple,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
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

    // Group incidents by tag for Pattern Detected section
    const patternsMap = new Map<string, Array<{ id: Id<'incidents'>, date: Date, narrative: string }>>();
    if (incidents) {
        incidents.forEach(incident => {
            if (incident.tags && incident.tags.length > 0) {
                const date = parseLocalDate(incident.date);
                incident.tags.forEach(tag => {
                    if (!patternsMap.has(tag)) patternsMap.set(tag, []);
                    patternsMap.get(tag)!.push({ id: incident._id, date, narrative: incident.courtSummary || incident.narrative });
                });
            }
        });
    }

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
        <PageContainer>
            {/* Header */}
            <PageHeader
                icon={ClipboardText}
                title={
                    <>Incident <span className="text-editorial shimmer">Report</span></>
                }
                description="Transform chaos into undeniable proof. Log, analyze, and bulletproof your timeline for court."
                rightElement={
                    <div className="flex items-center gap-3">
                        {incidents && incidents.length > 0 && (
                            <a 
                                href="/api/incidents/export"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[12px] font-bold uppercase tracking-wider bg-[rgba(255,255,255,0.05)] text-white hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.3)] transition-all no-underline shrink-0"
                            >
                                <DownloadSimple size={16} weight="bold" /> Export Report
                            </a>
                        )}
                        <Link href="/incident-report/new" className="btn-primary inline-flex items-center justify-center gap-2 no-underline shadow-[0_8px_20px_rgba(18,61,126,0.4)] flex-shrink-0 px-6 py-3 rounded-xl">
                            <Plus size={16} weight="bold" /> Log Incident
                        </Link>
                    </div>
                }
            />

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
                                        <div className="card-premium p-5 pr-[4.5rem] hover:border-[rgba(255,255,255,0.4)] hover:shadow-[0_8px_32px_rgba(26,75,155,0.3)] transition-all duration-300 flex items-start gap-5">
                                            {/* Date Column */}
                                            <div className="flex flex-col items-center justify-center min-w-[56px] py-2 bg-[rgba(255,255,255,0.05)] rounded-xl px-2 shrink-0 border border-[rgba(255,255,255,0.1)]">
                                                <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                                                    {date.toLocaleDateString('en-US', { month: 'short' })}
                                                </p>
                                                <p className="text-2xl font-bold text-white leading-none mt-1 mb-0.5">
                                                    {date.getDate()}
                                                </p>
                                                <p className="text-[10px] font-semibold text-white/50">
                                                    {incident.time}
                                                </p>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 py-1">
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    {incident.tags && incident.tags.map(tag => {
                                                        const ct = INCIDENT_CATEGORIES.find((c) => c.value === tag);
                                                        return (
                                                            <span
                                                                key={tag}
                                                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase border shadow-sm"
                                                                style={{ 
                                                                    background: ct?.color ? `color-mix(in srgb, ${ct.color} 15%, transparent)` : 'rgba(255,255,255,0.05)', 
                                                                    color: ct?.color || 'rgba(255,255,255,0.7)',
                                                                    borderColor: ct?.color ? `color-mix(in srgb, ${ct.color} 30%, transparent)` : 'rgba(255,255,255,0.1)'
                                                                }}
                                                            >
                                                                {ct?.label || tag.replace(/_/g, ' ')}
                                                            </span>
                                                        );
                                                    })}
                                                    {(!incident.tags || incident.tags.length === 0) && incident.category && (
                                                        <span
                                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide uppercase"
                                                            style={{ 
                                                                background: cat?.color ? `color-mix(in srgb, ${cat.color} 12%, transparent)` : 'var(--cloud)', 
                                                                color: cat?.color || 'var(--sapphire-muted)' 
                                                            }}
                                                        >
                                                            {cat?.label || incident.category}
                                                        </span>
                                                    )}
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
                                                <p className="text-[14px] leading-relaxed text-white/80 font-medium line-clamp-2 mt-2">
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

                {/* Pattern Detected Section */}
                {incidents && incidents.length > 0 && Array.from(patternsMap.keys()).length > 0 && (
                    <div className="mt-16 mb-8">
                        <h2 className="text-[13px] font-bold tracking-[0.2em] uppercase text-rose flex items-center gap-2 mb-6">
                            <Tag size={18} weight="duotone" /> Pattern Detected
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {Array.from(patternsMap.entries())
                                .sort((a, b) => b[1].length - a[1].length) // Sort by number of occurrences
                                .map(([tag, occurrences]) => {
                                const catTheme = INCIDENT_CATEGORIES.find(c => c.value === tag);
                                const color = catTheme ? catTheme.color : 'var(--sapphire)';
                                const label = catTheme ? catTheme.label : tag.replace(/_/g, ' ');
                                
                                return (
                                    <div key={tag} className="card-premium p-6 border-[rgba(10,22,41,0.05)]">
                                        <div className="flex items-center justify-between mb-5">
                                            <span 
                                                className="px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wider uppercase shadow-sm border"
                                                style={{ 
                                                    background: `color-mix(in srgb, ${color} 15%, transparent)`,
                                                    color: color,
                                                    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`
                                                }}
                                            >
                                                {label}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 bg-[rgba(255,255,255,0.1)] px-2.5 py-1 rounded-md">
                                                {occurrences.length} {occurrences.length === 1 ? 'Event' : 'Events'}
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            {occurrences.sort((a,b) => b.date.getTime() - a.date.getTime()).slice(0, 3).map(occ => (
                                                <Link 
                                                    key={occ.id} 
                                                    href={`/incident-report/${occ.id}`}
                                                    className="block p-4 rounded-[1.2rem] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)] hover:shadow-[0_4px_20px_rgba(26,75,155,0.2)] transition-all no-underline group"
                                                >
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[11px] font-bold text-white/90">
                                                            {occ.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                                        </span>
                                                        <ArrowRight size={14} weight="bold" className="text-white/60 opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-4px] group-hover:translate-x-0" />
                                                    </div>
                                                    <p className="text-[13px] font-medium text-white/60 line-clamp-2 leading-relaxed">
                                                        {occ.narrative}
                                                    </p>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
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
        </PageContainer>
    );
}
