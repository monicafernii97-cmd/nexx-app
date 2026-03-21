'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    CalendarBlank,
    Clock,
    Tag,
    ShieldCheck,
    PencilSimple,
    Check,
    WarningCircle,
    Strategy,
    FloppyDisk,
    Trash,
    MapPin,
    Users,
    Baby,
    ArrowsClockwise,
    DownloadSimple,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';

/** Incident detail page showing court summary, behavioral analysis, and strategic response in Ethereal theme. */
export default function IncidentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const rawId = params.id;
    const isValidId = typeof rawId === 'string';
    const incidentId = isValidId ? (rawId as Id<'incidents'>) : ('' as Id<'incidents'>);

    // All hooks called unconditionally — use 'skip' when ID is invalid
    const incident = useQuery(api.incidents.get, isValidId ? { id: incidentId } : 'skip');
    const updateIncident = useMutation(api.incidents.update);
    const confirmIncident = useMutation(api.incidents.confirm);
    const removeIncident = useMutation(api.incidents.remove);

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<{
        narrative: string;
        courtSummary: string;
        date: string;
        time: string;
        category: string;
    } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<{
        behavioralAnalysis?: string;
        strategicResponse?: string;
    } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Redirect if ID is invalid (after all hooks)
    useEffect(() => {
        if (!isValidId) {
            router.replace('/incident-report');
        }
    }, [isValidId, router]);

    // Early return AFTER all hooks
    if (!isValidId) return null;

    if (!incident) {
        return (
            <div className="max-w-[85rem] mx-auto flex items-center justify-center h-64">
                <div className="w-10 h-10 rounded-full border-2 border-sapphire border-t-transparent animate-spin" />
            </div>
        );
    }

    const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
    const dateParts = incident.date?.split('-').map(Number) ?? [];
    const incidentDate = (() => {
        if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;
        const [year, month, day] = dateParts;
        const candidate = new Date(year, month - 1, day);
        return candidate.getFullYear() === year &&
            candidate.getMonth() === month - 1 &&
            candidate.getDate() === day
            ? candidate
            : null;
    })();
    const severityColors = ['var(--emerald)', 'var(--warning)', 'var(--rose)'];
    const severityLabels = ['Low', 'Medium', 'High'];

    const startEditing = () => {
        setEditData({
            narrative: incident.narrative,
            courtSummary: incident.courtSummary || '',
            date: incident.date,
            time: incident.time,
            category: incident.category || 'other',
        });
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!editData) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            await updateIncident({
                id: incidentId,
                narrative: editData.narrative,
                courtSummary: editData.courtSummary || undefined,
                date: editData.date,
                time: editData.time,
                category: editData.category as 'emotional_abuse' | 'financial_abuse' | 'parental_alienation' | 'custody_violation' | 'harassment' | 'threats' | 'manipulation' | 'neglect' | 'other',
            });
            setIsEditing(false);
            setEditData(null);
        } catch (error) {
            console.error('Failed to save:', error);
            setSaveError('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirm = async () => {
        setIsConfirming(true);
        setConfirmError(null);
        try {
            await confirmIncident({ id: incidentId });
        } catch (error) {
            console.error('Failed to confirm:', error);
            setConfirmError('Failed to confirm incident. Please try again.');
        } finally {
            setIsConfirming(false);
        }
    };

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setAnalysisError(null);
        try {
            const response = await fetch('/api/incidents/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    narrative: incident.narrative,
                    category: incident.category,
                    date: incident.date,
                    time: incident.time,
                }),
            });

            if (!response.ok) throw new Error('Analysis failed');

            const data = await response.json();

            // Update the court summary
            if (data.courtSummary) {
                await updateIncident({
                    id: incidentId,
                    courtSummary: data.courtSummary,
                });
            }

            setAnalysis({
                behavioralAnalysis: data.behavioralAnalysis,
                strategicResponse: data.strategicResponse,
            });
        } catch (error) {
            console.error('Analysis error:', error);
            setAnalysisError('Failed to analyze incident. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await removeIncident({ id: incidentId });
            router.replace('/incident-report');
        } catch (error) {
            console.error('Delete error:', error);
            setDeleteError('Failed to delete incident. Please try again.');
            setIsDeleting(false);
        }
    };

    return (
        <div className="max-w-[85rem] mx-auto pb-16 w-full px-6 lg:px-12">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pt-4"
            >
                <div className="flex items-start gap-4">
                    <Link
                        href="/incident-report"
                        className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 bg-white shadow-sm border border-[rgba(10,22,41,0.05)] hover:shadow shrink-0"
                        aria-label="Back to incident reports"
                    >
                        <ArrowLeft size={20} weight="bold" className="text-sapphire" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-serif font-bold text-sapphire mb-1 leading-tight">
                            Incident Record
                        </h1>
                        <p className="text-[14px] font-medium text-sapphire-muted">
                            {incidentDate
                                ? incidentDate.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })
                                : incident.date || 'Unknown date'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    {incident.status === 'draft' && (
                        <>
                            {!isEditing ? (
                                <button onClick={startEditing} className="px-5 py-2.5 rounded-xl bg-white border border-[rgba(10,22,41,0.05)] text-sapphire text-[13px] font-bold uppercase tracking-widest shadow-sm hover:shadow transition-all flex items-center gap-2">
                                    <PencilSimple size={16} /> Edit
                                </button>
                            ) : (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-5 py-2.5 rounded-xl bg-sapphire text-white text-[13px] font-bold uppercase tracking-widest shadow-md hover:bg-[#0F223D] transition-all flex items-center gap-2"
                                >
                                    <FloppyDisk size={16} className={isSaving ? "animate-pulse" : ""} /> {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isDeleting}
                        className="w-11 h-11 rounded-xl flex items-center justify-center bg-rose/10 text-rose hover:bg-rose hover:text-white transition-all shadow-sm cursor-pointer ml-1"
                        title="Delete incident"
                        aria-label="Delete incident"
                    >
                        <Trash size={20} weight="duotone" />
                    </button>
                    <button
                        onClick={() => window.open(`/api/incidents/${incidentId}/pdf`, '_blank')}
                        className="px-5 py-2.5 rounded-xl bg-[linear-gradient(135deg,#123D7E,#0A1128)] text-white text-[13px] font-bold uppercase tracking-widest shadow-md hover:shadow-[0_8px_16px_rgba(10,22,41,0.2)] hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-white/10 group"
                        title="Export Incident Record to PDF"
                    >
                        <DownloadSimple size={18} weight="bold" className="group-hover:-translate-y-0.5 transition-transform" /> Export PDF
                    </button>
                </div>
                {saveError && (
                    <p className="text-xs font-semibold text-rose mt-1 w-full md:w-auto text-right">{saveError}</p>
                )}
            </motion.div>

            {/* Status & Meta (Glass Pill Container) */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-wrap items-center gap-3 mb-8 p-3 rounded-2xl bg-white/50 border border-[rgba(10,22,41,0.03)] backdrop-blur-md"
            >
                <span
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase border border-transparent shadow-sm"
                    style={{
                        background: cat?.color ? `color-mix(in srgb, ${cat.color} 15%, white)` : 'var(--white)',
                        color: cat?.color || 'var(--sapphire)',
                        borderColor: cat?.color ? `color-mix(in srgb, ${cat.color} 30%, transparent)` : 'transparent',
                    }}
                >
                    <Tag size={14} weight="fill" /> {cat?.label || incident.category}
                </span>
                
                {incident.status === 'draft' && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-warning/15 text-warning">Draft</span>
                )}
                
                {incident.status === 'confirmed' && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-emerald/15 text-emerald shadow-sm">
                        <Check size={14} weight="bold" /> Confirmed
                    </span>
                )}
                
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-cloud text-sapphire shadow-sm">
                    <CalendarBlank size={14} /> {incident.date}
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-cloud text-sapphire shadow-sm">
                    <Clock size={14} /> {incident.time}
                </span>
                
                {/* Severity */}
                {(() => {
                    const sev = Math.max(1, Math.min(3, incident.severity ?? 2));
                    return (
                        <span
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-white border shadow-sm"
                            style={{ borderColor: severityColors[sev - 1], color: severityColors[sev - 1] }}
                        >
                            <span className="flex gap-0.5" aria-hidden="true">
                                {[1, 2, 3].map((level) => (
                                    <span
                                        key={level}
                                        className="w-1.5 h-3 rounded-sm inline-block"
                                        style={{ background: level <= sev ? severityColors[sev - 1] : 'var(--cloud)' }}
                                    />
                                ))}
                            </span>
                            {severityLabels[sev - 1]}
                        </span>
                    );
                })()}

                {incident.childrenInvolved && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-warning/15 text-warning shadow-sm">
                        <Baby size={14} weight="fill" /> Children Involved
                    </span>
                )}
                
                {/* Location & Witnesses inline if any */}
                {incident.location && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-cloud text-sapphire shadow-sm">
                        <MapPin size={14} /> {incident.location}
                    </span>
                )}
                {incident.witnesses && incident.witnesses.length > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase bg-cloud text-sapphire shadow-sm">
                        <Users size={14} /> {incident.witnesses.length} {incident.witnesses.length === 1 ? 'Witness' : 'Witnesses'}
                    </span>
                )}
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 gap-6">
                
                {/* Narrative */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="card-premium p-6 md:p-8"
                >
                    <h3 className="text-[12px] font-bold tracking-[0.2em] uppercase mb-4 text-sapphire flex items-center gap-2 border-b border-[rgba(10,22,41,0.04)] pb-4">
                        <PencilSimple size={16} className="text-sapphire-muted" /> Original Narrative
                    </h3>
                    {isEditing && editData ? (
                        <textarea
                            value={editData.narrative}
                            onChange={(e) => setEditData({ ...editData, narrative: e.target.value })}
                            className="input-premium resize-none w-full bg-white/50 focus:bg-white text-[15px] leading-relaxed"
                            rows={6}
                        />
                    ) : (
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-sapphire font-medium">
                            {incident.narrative}
                        </p>
                    )}
                </motion.div>

                {/* Court-Ready Summary */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="card-premium p-6 md:p-8"
                >
                    <div className="flex items-center justify-between mb-4 border-b border-[rgba(10,22,41,0.04)] pb-4">
                        <h3 className="text-[13px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 text-sapphire">
                            <ShieldCheck size={18} weight="duotone" className="text-champagne" /> Court-Ready Summary
                        </h3>
                        <div className="flex gap-2">
                            {incident.courtSummary && !isAnalyzing && !isEditing && (
                                <button
                                    onClick={handleAnalyze}
                                    className="px-3 py-1.5 rounded-lg bg-cloud hover:bg-[rgba(10,22,41,0.08)] text-sapphire text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                >
                                    <ArrowsClockwise size={14} /> Re-generate
                                </button>
                            )}
                            {!incident.courtSummary && !isAnalyzing && !isEditing && (
                                <button
                                    onClick={handleAnalyze}
                                    className="px-4 py-2 rounded-xl bg-champagne hover:bg-[#C59B27] text-white text-[11px] font-bold uppercase tracking-widest shadow-md flex items-center gap-1.5 transition-colors"
                                >
                                    <Strategy size={14} weight="fill" /> Generate with AI
                                </button>
                            )}
                        </div>
                    </div>
                    {isAnalyzing ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8 opacity-60">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                                <Strategy size={32} weight="duotone" className="text-champagne" />
                            </motion.div>
                            <p className="text-[13px] font-bold uppercase tracking-widest text-sapphire">
                                Generating encrypted court summary...
                            </p>
                        </div>
                    ) : isEditing && editData ? (
                        <textarea
                            value={editData.courtSummary}
                            onChange={(e) =>
                                setEditData({ ...editData, courtSummary: e.target.value })
                            }
                            className="input-premium resize-none w-full bg-white/50 focus:bg-white text-[15px] leading-relaxed"
                            rows={6}
                            placeholder="Court-ready summary will appear here after AI analysis..."
                        />
                    ) : incident.courtSummary ? (
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-sapphire">
                            {incident.courtSummary}
                        </p>
                    ) : (
                        <div className="py-6 text-center bg-cloud/50 rounded-xl border border-[rgba(10,22,41,0.04)] border-dashed">
                            <p className="text-[14px] font-medium text-sapphire-muted italic">
                                No court summary generated yet. Click generate to create a highly-structured output.
                            </p>
                        </div>
                    )}
                </motion.div>

                {/* Analysis error */}
                {analysisError && (
                    <div className="p-4 rounded-xl bg-rose/10 border border-rose/20 text-rose text-[13px] font-semibold flex items-center gap-2">
                        <WarningCircle size={16} /> {analysisError}
                    </div>
                )}

                {/* AI Analysis Grid (if available) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {analysis?.behavioralAnalysis && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="card-premium p-6"
                        >
                            <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase mb-4 flex items-center gap-2 text-warning pb-3 border-b border-[rgba(10,22,41,0.04)]">
                                <WarningCircle size={16} weight="duotone" /> NPD Behavioral Analysis
                            </h3>
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-sapphire font-medium">
                                {analysis.behavioralAnalysis}
                            </p>
                        </motion.div>
                    )}

                    {analysis?.strategicResponse && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="card-premium p-6"
                        >
                            <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase mb-4 flex items-center gap-2 text-emerald pb-3 border-b border-[rgba(10,22,41,0.04)]">
                                <ShieldCheck size={16} weight="duotone" /> Strategic Response
                            </h3>
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-sapphire font-medium">
                                {analysis.strategicResponse}
                            </p>
                        </motion.div>
                    )}
                </div>

                {/* Finalize Actions */}
                {incident.status === 'draft' && !isEditing && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex gap-4 pt-4"
                    >
                        {!incident.courtSummary && (
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                                className="btn-secondary flex-1 bg-white hover:bg-cloud shadow-sm text-[13px] uppercase tracking-widest py-4 border-transparent flex items-center justify-center gap-2"
                            >
                                <Strategy size={16} className="text-champagne" /> Analyze with AI
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className="btn-primary flex-1 shadow-md text-[13px] uppercase tracking-widest py-4 flex items-center justify-center gap-2"
                        >
                            <Check size={16} weight="bold" /> {isConfirming ? 'Finalizing...' : 'Confirm & Lock'}
                        </button>
                    </motion.div>
                )}
                {confirmError && (
                    <p className="text-[13px] font-semibold text-rose text-center mt-2">{confirmError}</p>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={showDeleteConfirm}
                isDeleting={isDeleting}
                deleteError={deleteError}
                onClose={() => { if (!isDeleting) { setShowDeleteConfirm(false); setDeleteError(null); } }}
                onDelete={handleDelete}
                dialogTitleId="delete-dialog-title"
            />
        </div>
    );
}
