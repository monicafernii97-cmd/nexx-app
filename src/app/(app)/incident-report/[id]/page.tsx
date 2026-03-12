'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Calendar,
    Clock,
    Tag,
    Shield,
    Pencil,
    Check,
    AlertTriangle,
    Sparkles,
    Save,
    Trash2,
    MapPin,
    Users,
    Baby,
    RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';

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
            <div className="max-w-3xl mx-auto flex items-center justify-center h-64">
                <div className="flex gap-1.5">
                    {[0, 1, 2].map((j) => (
                        <motion.div
                            key={j}
                            className="w-2 h-2 rounded-full"
                            style={{ background: '#C58B07' }}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: j * 0.2 }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    const cat = INCIDENT_CATEGORIES.find((c) => c.value === incident.category);
    const [yr, mo, dy] = incident.date.split('-').map(Number);
    const incidentDate = new Date(yr, mo - 1, dy);
    const severityColors = ['#5A9E6F', '#E5A84A', '#C75A5A'];
    const severityLabels = ['Low', 'Medium', 'High'];

    const startEditing = () => {
        setEditData({
            narrative: incident.narrative,
            courtSummary: incident.courtSummary || '',
            date: incident.date,
            time: incident.time,
            category: incident.category,
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
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-6"
            >
                <Link href="/incident-report">
                    <button
                        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                        style={{
                            background: 'rgba(197, 139, 7, 0.08)',
                            border: '1px solid rgba(197, 139, 7, 0.15)',
                        }}
                    >
                        <ArrowLeft size={16} style={{ color: '#C58B07' }} />
                    </button>
                </Link>
                <div className="flex-1">
                    <h1 className="text-headline text-xl" style={{ color: '#F5EFE0' }}>
                        Incident Record
                    </h1>
                    <p className="text-xs" style={{ color: '#8A7A60' }}>
                        {incidentDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                    </p>
                </div>
                <div className="flex gap-2">
                    {incident.status === 'draft' && (
                        <>
                            {!isEditing ? (
                                <button onClick={startEditing} className="btn-outline text-xs flex items-center gap-1">
                                    <Pencil size={12} /> Edit
                                </button>
                            ) : (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="btn-gold text-xs flex items-center gap-1"
                                >
                                    <Save size={12} /> {isSaving ? 'Saving...' : 'Save'}
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="btn-outline text-xs flex items-center gap-1"
                        style={{ borderColor: 'rgba(199, 90, 90, 0.2)', color: '#C75A5A' }}
                    >
                        <Trash2 size={12} /> Delete
                    </button>
                </div>
                {saveError && (
                    <p className="text-xs mt-1" style={{ color: '#C75A5A' }}>{saveError}</p>
                )}
            </motion.div>

            {/* Status & Meta */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-wrap items-center gap-3 mb-6"
            >
                <span
                    className="badge"
                    style={{
                        background: `${cat?.color || '#C58B07'}20`,
                        color: cat?.color || '#C58B07',
                    }}
                >
                    <Tag size={10} /> {cat?.label || incident.category}
                </span>
                {incident.status === 'draft' && (
                    <span className="badge badge-warning">Draft</span>
                )}
                {incident.status === 'confirmed' && (
                    <span className="badge badge-success">
                        <Check size={10} /> Confirmed
                    </span>
                )}
                <span className="badge" style={{ background: 'rgba(138, 122, 96, 0.1)', color: '#8A7A60' }}>
                    <Calendar size={10} /> {incident.date}
                </span>
                <span className="badge" style={{ background: 'rgba(138, 122, 96, 0.1)', color: '#8A7A60' }}>
                    <Clock size={10} /> {incident.time}
                </span>
                {/* Severity */}
                {(() => {
                    const sev = Math.max(1, Math.min(3, incident.severity ?? 2));
                    return (
                        <span
                            className="badge"
                            style={{
                                background: `${severityColors[sev - 1]}15`,
                                color: severityColors[sev - 1],
                            }}
                        >
                            <span className="flex gap-0.5 mr-1" aria-hidden="true">
                                {[1, 2, 3].map((level) => (
                                    <span
                                        key={level}
                                        className="w-1.5 h-3 rounded-sm inline-block"
                                        style={{
                                            background: level <= sev
                                                ? severityColors[sev - 1]
                                                : 'rgba(138, 122, 96, 0.15)',
                                        }}
                                    />
                                ))}
                            </span>
                            {severityLabels[sev - 1]}
                        </span>
                    );
                })()}
                {incident.childrenInvolved && (
                    <span className="badge" style={{ background: 'rgba(229, 168, 74, 0.12)', color: '#E5A84A' }}>
                        <Baby size={10} /> Children Involved
                    </span>
                )}
            </motion.div>

            {/* Location & Witnesses (if present) */}
            {(incident.location || (incident.witnesses && incident.witnesses.length > 0)) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="flex flex-wrap gap-4 mb-6"
                >
                    {incident.location && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#8A7A60' }}>
                            <MapPin size={12} /> {incident.location}
                        </div>
                    )}
                    {incident.witnesses && incident.witnesses.length > 0 && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: '#8A7A60' }}>
                            <Users size={12} /> Witnesses: {incident.witnesses.join(', ')}
                        </div>
                    )}
                </motion.div>
            )}

            {/* Narrative */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="card-gilded p-6 mb-6"
            >
                <h3
                    className="text-sm font-semibold tracking-[0.15em] uppercase mb-3"
                    style={{ color: '#92783A' }}
                >
                    Incident Narrative
                </h3>
                {isEditing && editData ? (
                    <textarea
                        value={editData.narrative}
                        onChange={(e) => setEditData({ ...editData, narrative: e.target.value })}
                        className="input-gilded resize-none w-full"
                        rows={6}
                    />
                ) : (
                    <p
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: '#D4C9B0' }}
                    >
                        {incident.narrative}
                    </p>
                )}
            </motion.div>

            {/* Court-Ready Summary */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card-gilded p-6 mb-6"
            >
                <div className="flex items-center justify-between mb-3">
                    <h3
                        className="text-sm font-semibold tracking-[0.15em] uppercase flex items-center gap-2"
                        style={{ color: '#C58B07' }}
                    >
                        <Shield size={14} /> Court-Ready Summary
                    </h3>
                    <div className="flex gap-2">
                        {incident.courtSummary && !isAnalyzing && !isEditing && (
                            <button
                                onClick={handleAnalyze}
                                className="btn-ghost text-xs flex items-center gap-1"
                            >
                                <RefreshCw size={12} /> Re-generate
                            </button>
                        )}
                        {!incident.courtSummary && !isAnalyzing && !isEditing && (
                            <button
                                onClick={handleAnalyze}
                                className="btn-outline text-xs flex items-center gap-1"
                            >
                                <Sparkles size={12} /> Generate with AI
                            </button>
                        )}
                    </div>
                </div>
                {isAnalyzing ? (
                    <div className="flex items-center gap-3 py-4">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                            <Sparkles size={16} style={{ color: '#C58B07' }} />
                        </motion.div>
                        <p className="text-sm" style={{ color: '#8A7A60' }}>
                            Analyzing incident and generating court-ready summary...
                        </p>
                    </div>
                ) : isEditing && editData ? (
                    <textarea
                        value={editData.courtSummary}
                        onChange={(e) =>
                            setEditData({ ...editData, courtSummary: e.target.value })
                        }
                        className="input-gilded resize-none w-full"
                        rows={6}
                        placeholder="Court-ready summary will appear here after AI analysis..."
                    />
                ) : incident.courtSummary ? (
                    <p
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: '#D4C9B0' }}
                    >
                        {incident.courtSummary}
                    </p>
                ) : (
                    <p className="text-sm italic" style={{ color: '#5A4A30' }}>
                        No court summary generated yet. Click &ldquo;Generate with AI&rdquo; to
                        create a court-ready version of this incident.
                    </p>
                )}
            </motion.div>

            {/* Analysis error */}
            {analysisError && (
                <p className="text-sm mb-4 px-1" style={{ color: '#C75A5A' }}>{analysisError}</p>
            )}

            {/* AI Analysis (if available) */}
            {analysis?.behavioralAnalysis && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-gilded p-6 mb-6"
                >
                    <h3
                        className="text-sm font-semibold tracking-[0.15em] uppercase mb-3 flex items-center gap-2"
                        style={{ color: '#E5A84A' }}
                    >
                        <AlertTriangle size={14} /> NPD Behavioral Analysis
                    </h3>
                    <p
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: '#D4C9B0' }}
                    >
                        {analysis.behavioralAnalysis}
                    </p>
                </motion.div>
            )}

            {analysis?.strategicResponse && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-gilded p-6 mb-6"
                >
                    <h3
                        className="text-sm font-semibold tracking-[0.15em] uppercase mb-3 flex items-center gap-2"
                        style={{ color: '#5A9E6F' }}
                    >
                        <Shield size={14} /> Strategic Response
                    </h3>
                    <p
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        style={{ color: '#D4C9B0' }}
                    >
                        {analysis.strategicResponse}
                    </p>
                </motion.div>
            )}

            {/* Actions */}
            {incident.status === 'draft' && !isEditing && (
                <>
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex gap-3"
                    >
                        {!incident.courtSummary && (
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                                className="btn-outline flex-1 flex items-center justify-center gap-2"
                            >
                                <Sparkles size={14} /> Analyze with AI
                            </button>
                        )}
                        <button
                            onClick={handleConfirm}
                            disabled={isConfirming}
                            className="btn-gold flex-1 flex items-center justify-center gap-2"
                        >
                            <Check size={14} /> {isConfirming ? 'Confirming...' : 'Confirm & Finalize'}
                        </button>
                    </motion.div>
                    {confirmError && (
                        <p className="text-sm mt-2" style={{ color: '#C75A5A' }}>{confirmError}</p>
                    )}
                </>
            )}

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
