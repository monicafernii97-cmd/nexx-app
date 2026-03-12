'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useUser } from '@/lib/user-context';
import {
    Mic,
    ArrowLeft,
    Sparkles,
    Check,
    Pencil,
    Calendar,
    Clock,
    Tag,
    MapPin,
    Users,
    Baby,
} from 'lucide-react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

type Step = 'describe' | 'review' | 'confirmed';

export default function NewIncidentPage() {
    const { userId } = useUser();
    const [step, setStep] = useState<Step>('describe');
    const [narrative, setNarrative] = useState('');
    const [category, setCategory] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [severity, setSeverity] = useState(2);
    const [location, setLocation] = useState('');
    const [witnesses, setWitnesses] = useState('');
    const [childrenInvolved, setChildrenInvolved] = useState(false);
    const [courtSummary, setCourtSummary] = useState('');
    const [behavioralAnalysis, setBehavioralAnalysis] = useState('');
    const [strategicResponse, setStrategicResponse] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [createdId, setCreatedId] = useState<Id<'incidents'> | null>(null);

    const createIncident = useMutation(api.incidents.create);
    const confirmIncident = useMutation(api.incidents.confirm);

    const handleAnalyze = async () => {
        if (!narrative.trim()) return;
        setIsAnalyzing(true);
        setAnalyzeError(null);

        try {
            const witnessArr = witnesses.trim()
                ? witnesses.split(',').map((w) => w.trim()).filter(Boolean)
                : undefined;

            const response = await fetch('/api/incidents/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    narrative: narrative.trim(),
                    category: category || 'other',
                    date,
                    time,
                    severity,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Analysis failed');
            }

            const data = await response.json();
            setCourtSummary(data.courtSummary || '');
            setBehavioralAnalysis(data.behavioralAnalysis || '');
            setStrategicResponse(data.strategicResponse || '');
            setStep('review');
        } catch (error) {
            console.error('Analysis error:', error);
            setAnalyzeError(error instanceof Error ? error.message : 'Failed to analyze incident');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleConfirm = async () => {
        if (!userId || isSaving) return;
        setIsSaving(true);

        try {
            const witnessArr = witnesses.trim()
                ? witnesses.split(',').map((w) => w.trim()).filter(Boolean)
                : undefined;

            // Reuse previously created ID to prevent duplicates on retry
            let incidentId = createdId;
            if (!incidentId) {
                incidentId = await createIncident({
                    narrative,
                    courtSummary,
                    category: (category || 'other') as 'emotional_abuse' | 'financial_abuse' | 'parental_alienation' | 'custody_violation' | 'harassment' | 'threats' | 'manipulation' | 'neglect' | 'other',
                    severity,
                    date,
                    time,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                    aiAnalysis: behavioralAnalysis || undefined,
                });
                setCreatedId(incidentId);
            }

            await confirmIncident({ id: incidentId });
            setStep('confirmed');
        } catch (error) {
            console.error('Save error:', error);
            setAnalyzeError('Failed to save incident. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const severityLabels = ['Low', 'Medium', 'High'];
    const severityColors = ['#5A9E6F', '#E5A84A', '#C75A5A'];

    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-8"
            >
                <Link href="/incident-report">
                    <button
                        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors"
                        style={{ background: 'rgba(197, 139, 7, 0.08)', border: '1px solid rgba(197, 139, 7, 0.15)' }}
                    >
                        <ArrowLeft size={16} style={{ color: '#C58B07' }} />
                    </button>
                </Link>
                <div>
                    <h1 className="text-headline text-xl" style={{ color: '#F5EFE0' }}>
                        Secure Testimony
                    </h1>
                    <p className="text-xs" style={{ color: '#8A7A60' }}>
                        Sanctuary for Truth and Admissibility
                    </p>
                </div>
            </motion.div>

            {/* Progress */}
            <div className="flex items-center gap-3 mb-8">
                {['Describe', 'Review', 'Confirmed'].map((label, i) => {
                    const steps: Step[] = ['describe', 'review', 'confirmed'];
                    const isActive = steps.indexOf(step) >= i;
                    return (
                        <div key={label} className="flex items-center gap-3 flex-1">
                            <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                                style={{
                                    background: isActive ? 'linear-gradient(135deg, #C58B07, #E5B84A)' : 'rgba(138, 122, 96, 0.1)',
                                    color: isActive ? '#02022d' : '#8A7A60',
                                }}
                            >
                                {steps.indexOf(step) > i ? <Check size={12} /> : i + 1}
                            </div>
                            <span className="text-xs font-medium" style={{ color: isActive ? '#C58B07' : '#8A7A60' }}>
                                {label}
                            </span>
                            {i < 2 && (
                                <div className="flex-1 h-px" style={{ background: isActive ? 'rgba(197, 139, 7, 0.3)' : 'rgba(138, 122, 96, 0.1)' }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step: Describe */}
            {step === 'describe' && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    {/* Voice Record Button */}
                    <div className="text-center">
                        <button
                            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center cursor-pointer transition-all hover:scale-105"
                            style={{
                                background: 'linear-gradient(135deg, rgba(197, 139, 7, 0.15), rgba(197, 139, 7, 0.05))',
                                border: '2px solid rgba(197, 139, 7, 0.3)',
                            }}
                            title="Voice recording (coming soon)"
                        >
                            <Mic size={28} style={{ color: '#C58B07' }} />
                        </button>
                        <p className="text-xs mt-2" style={{ color: '#8A7A60' }}>
                            Tap to Record Testimony
                        </p>
                    </div>

                    <div className="gold-divider" />

                    {/* Manual Narrative */}
                    <div>
                        <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#92783A' }}>
                            Manual Narrative
                        </label>
                        <textarea
                            value={narrative}
                            onChange={(e) => setNarrative(e.target.value)}
                            placeholder="Describe the incident with precision — what happened, who was present, what was said or done..."
                            rows={6}
                            className="input-gilded resize-none"
                        />
                        <p className="text-xs mt-1 text-right" style={{ color: narrative.length > 4500 ? '#C75A5A' : '#5A4A30' }}>
                            {narrative.length}/5000
                        </p>
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 flex items-center gap-2 block" style={{ color: '#92783A' }}>
                                <Calendar size={12} /> Date
                            </label>
                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-gilded" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 flex items-center gap-2 block" style={{ color: '#92783A' }}>
                                <Clock size={12} /> Time
                            </label>
                            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-gilded" />
                        </div>
                    </div>

                    {/* Severity Selector */}
                    <div>
                        <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-3 block" style={{ color: '#92783A' }}>
                            Severity Level
                        </label>
                        <div className="flex gap-3">
                            {[1, 2, 3].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setSeverity(level)}
                                    className="flex-1 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                                    style={{
                                        background: severity === level
                                            ? `${severityColors[level - 1]}20`
                                            : 'rgba(42, 29, 14, 0.3)',
                                        border: `1px solid ${severity === level
                                            ? `${severityColors[level - 1]}50`
                                            : 'rgba(138, 122, 96, 0.1)'}`,
                                        color: severity === level
                                            ? severityColors[level - 1]
                                            : '#8A7A60',
                                    }}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3].map((bar) => (
                                                <div
                                                    key={bar}
                                                    className="w-1.5 h-4 rounded-sm"
                                                    style={{
                                                        background: bar <= level
                                                            ? severityColors[level - 1]
                                                            : 'rgba(138, 122, 96, 0.15)',
                                                        opacity: severity === level ? 1 : 0.4,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        {severityLabels[level - 1]}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Category Tags */}
                    <div>
                        <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-3 flex items-center gap-2 block" style={{ color: '#92783A' }}>
                            <Tag size={12} /> Incident Context
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {INCIDENT_CATEGORIES.map((cat) => (
                                <button
                                    key={cat.value}
                                    onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                                    className="badge cursor-pointer transition-all"
                                    style={{
                                        background: category === cat.value ? `${cat.color}25` : 'rgba(42, 29, 14, 0.4)',
                                        color: category === cat.value ? cat.color : '#8A7A60',
                                        border: `1px solid ${category === cat.value ? `${cat.color}40` : 'transparent'}`,
                                    }}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Additional Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 flex items-center gap-2 block" style={{ color: '#92783A' }}>
                                <MapPin size={12} /> Location (optional)
                            </label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="Where did it happen?"
                                className="input-gilded"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 flex items-center gap-2 block" style={{ color: '#92783A' }}>
                                <Users size={12} /> Witnesses (optional)
                            </label>
                            <input
                                type="text"
                                value={witnesses}
                                onChange={(e) => setWitnesses(e.target.value)}
                                placeholder="Comma-separated names"
                                className="input-gilded"
                            />
                        </div>
                    </div>

                    {/* Children Involved */}
                    <label
                        className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all"
                        style={{
                            background: childrenInvolved ? 'rgba(229, 168, 74, 0.08)' : 'rgba(42, 29, 14, 0.3)',
                            border: `1px solid ${childrenInvolved ? 'rgba(229, 168, 74, 0.25)' : 'rgba(138, 122, 96, 0.1)'}`,
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={childrenInvolved}
                            onChange={(e) => setChildrenInvolved(e.target.checked)}
                            className="sr-only"
                        />
                        <div
                            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{
                                background: childrenInvolved ? 'rgba(229, 168, 74, 0.25)' : 'rgba(138, 122, 96, 0.1)',
                                border: `1px solid ${childrenInvolved ? '#E5A84A' : 'rgba(138, 122, 96, 0.2)'}`,
                            }}
                        >
                            {childrenInvolved && <Check size={12} style={{ color: '#E5A84A' }} />}
                        </div>
                        <div className="flex items-center gap-2">
                            <Baby size={14} style={{ color: childrenInvolved ? '#E5A84A' : '#8A7A60' }} />
                            <span className="text-sm" style={{ color: childrenInvolved ? '#E5A84A' : '#8A7A60' }}>
                                Children were present or involved
                            </span>
                        </div>
                    </label>

                    {/* Error */}
                    {analyzeError && (
                        <p className="text-sm px-1" style={{ color: '#C75A5A' }}>{analyzeError}</p>
                    )}

                    {/* Submit */}
                    <button
                        onClick={handleAnalyze}
                        disabled={!narrative.trim() || isAnalyzing}
                        className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        {isAnalyzing ? (
                            <>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                    <Sparkles size={16} />
                                </motion.div>
                                Analyzing with AI...
                            </>
                        ) : (
                            <><Sparkles size={16} /> Generate Court-Ready Summary</>
                        )}
                    </button>
                </motion.div>
            )}

            {/* Step: Review */}
            {step === 'review' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                    {/* Court Summary */}
                    <div className="card-gilded p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold tracking-[0.15em] uppercase" style={{ color: '#C58B07' }}>
                                Court-Ready Summary
                            </h3>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="btn-ghost text-xs flex items-center gap-1"
                            >
                                <Pencil size={12} /> {isEditing ? 'Done' : 'Edit'}
                            </button>
                        </div>
                        {isEditing ? (
                            <textarea
                                value={courtSummary}
                                onChange={(e) => setCourtSummary(e.target.value)}
                                className="input-gilded resize-none w-full"
                                rows={8}
                            />
                        ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4C9B0' }}>
                                {courtSummary}
                            </p>
                        )}
                    </div>

                    {/* Behavioral Analysis */}
                    {behavioralAnalysis && (
                        <div className="card-gilded p-6">
                            <h3 className="text-sm font-semibold tracking-[0.15em] uppercase mb-3 flex items-center gap-2" style={{ color: '#E5A84A' }}>
                                <Sparkles size={14} /> NPD Behavioral Analysis
                            </h3>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4C9B0' }}>
                                {behavioralAnalysis}
                            </p>
                        </div>
                    )}

                    {/* Strategic Response */}
                    {strategicResponse && (
                        <div className="card-gilded p-6">
                            <h3 className="text-sm font-semibold tracking-[0.15em] uppercase mb-3 flex items-center gap-2" style={{ color: '#5A9E6F' }}>
                                <Check size={14} /> Strategic Response
                            </h3>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4C9B0' }}>
                                {strategicResponse}
                            </p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={() => setStep('describe')} className="btn-outline flex-1">
                            Back to Edit
                        </button>
                        <button onClick={handleConfirm} className="btn-gold flex-1 flex items-center justify-center gap-2">
                            <Check size={16} /> Confirm & Save
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Step: Confirmed */}
            {step === 'confirmed' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card-gilded p-10 text-center">
                    <div
                        className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                        style={{ background: 'rgba(90, 158, 111, 0.15)', border: '1px solid rgba(90, 158, 111, 0.3)' }}
                    >
                        <Check size={28} style={{ color: '#5A9E6F' }} />
                    </div>
                    <h2 className="font-serif text-xl font-semibold mb-2" style={{ color: '#F5EFE0' }}>
                        Incident Documented
                    </h2>
                    <p className="text-sm mb-6" style={{ color: '#8A7A60' }}>
                        This record has been securely saved and is court-ready.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link href="/incident-report">
                            <button className="btn-outline">View All Records</button>
                        </Link>
                        <button
                            onClick={() => {
                                setStep('describe');
                                setIsEditing(false);
                                setNarrative('');
                                setCourtSummary('');
                                setBehavioralAnalysis('');
                                setStrategicResponse('');
                                setCategory('');
                                setSeverity(2);
                                setLocation('');
                                setWitnesses('');
                                setChildrenInvolved(false);
                                setAnalyzeError(null);
                                setCreatedId(null);
                            }}
                            className="btn-gold"
                        >
                            Log Another
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
