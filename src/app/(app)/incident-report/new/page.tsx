'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useUser } from '@/lib/user-context';
import {
    Microphone,
    ArrowLeft,
    Sparkle,
    Check,
    PencilSimple,
    CalendarBlank,
    Clock,
    Tag,
    MapPin,
    Users,
    Baby,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

type Step = 'describe' | 'review' | 'confirmed';

/** Premium multi-step incident creation form with AI-powered narrative analysis. */
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
    const severityColors = ['var(--emerald)', 'var(--warning)', 'var(--rose)'];

    return (
        <div className="max-w-3xl mx-auto pb-16 w-full px-2 mt-4">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-5 mb-10"
            >
                <Link
                    href="/incident-report"
                    className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 bg-white shadow-sm border border-[rgba(10,22,41,0.05)] hover:shadow"
                    aria-label="Back to incident reports"
                >
                    <ArrowLeft size={20} weight="bold" className="text-sapphire" />
                </Link>
                <div>
                    <h1 className="text-3xl text-headline text-sapphire m-0">
                        Secure <span className="text-editorial shimmer">Testimony</span>
                    </h1>
                    <p className="text-[14px] font-medium text-sapphire-muted mt-1">
                        Sanctuary for Truth and Admissibility
                    </p>
                </div>
            </motion.div>

            {/* Progress Stepper */}
            <div className="flex items-center gap-3 mb-10 overflow-x-auto no-scrollbar py-2">
                {['Describe', 'Review', 'Confirmed'].map((label, i) => {
                    const steps: Step[] = ['describe', 'review', 'confirmed'];
                    const isActive = steps.indexOf(step) >= i;
                    const isPast = steps.indexOf(step) > i;
                    return (
                        <div key={label} className="flex items-center gap-3 flex-1 min-w-[120px]">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all duration-500 shrink-0 shadow-sm ${
                                    isActive 
                                    ? 'bg-sapphire text-white scale-110 shadow-md' 
                                    : 'bg-white text-sapphire-muted border border-[rgba(10,22,41,0.08)]'
                                }`}
                            >
                                {isPast ? <Check size={14} weight="bold" /> : i + 1}
                            </div>
                            <span className={`text-[13px] tracking-wide font-bold uppercase whitespace-nowrap ${isActive ? 'text-sapphire' : 'text-sapphire-muted'}`}>
                                {label}
                            </span>
                            {i < 2 && (
                                <div className="flex-1 h-px min-w-[20px] bg-gradient-to-r from-[rgba(10,22,41,0.08)] to-transparent" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* View Container */}
            <AnimatePresence mode="wait">
                {/* Step: Describe */}
                {step === 'describe' && (
                    <motion.div
                        key="describe"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4 }}
                        className="glass-ethereal rounded-[2rem] p-6 md:p-8 space-y-8"
                    >
                        {/* Voice Record Button (Placeholder) */}
                        <div className="text-center">
                            <button
                                className="w-24 h-24 rounded-full mx-auto flex items-center justify-center cursor-pointer transition-all hover:scale-105 bg-white shadow-lg border-[4px] border-cloud group relative overflow-hidden"
                                title="Voice recording (coming soon)"
                            >
                                <div className="absolute inset-0 bg-champagne/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Microphone size={36} weight="duotone" className="text-sapphire group-hover:text-champagne transition-colors" />
                            </button>
                            <p className="text-[13px] font-bold tracking-widest uppercase mt-4 text-sapphire-muted">
                                Tap to Record Testimony
                            </p>
                        </div>

                        <div className="primary-divider opacity-50" />

                        {/* Manual Narrative */}
                        <div>
                            <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-sapphire-muted">
                                <PencilSimple size={14} /> Manual Narrative
                            </label>
                            <div className="relative">
                                <textarea
                                    value={narrative}
                                    onChange={(e) => setNarrative(e.target.value)}
                                    placeholder="Describe the incident with precision — what happened, who was present, what was said or done..."
                                    rows={6}
                                    className="input-premium resize-none w-full bg-white/60 focus:bg-white text-[15px] leading-relaxed"
                                />
                                <p className={`absolute bottom-3 right-4 text-[11px] font-bold ${narrative.length > 4500 ? 'text-rose' : 'text-sapphire-muted/50'}`}>
                                    {narrative.length}/5000
                                </p>
                            </div>
                        </div>

                        {/* Date & Time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-sapphire-muted">
                                    <CalendarBlank size={14} /> Date
                                </label>
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-premium bg-white/60 focus:bg-white w-full" />
                            </div>
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-sapphire-muted">
                                    <Clock size={14} /> Time
                                </label>
                                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-premium bg-white/60 focus:bg-white w-full" />
                            </div>
                        </div>

                        {/* Severity Selector */}
                        <div>
                            <label className="text-[12px] font-bold tracking-widest uppercase mb-4 block text-sapphire-muted">
                                Severity Level
                            </label>
                            <div className="flex gap-3">
                                {[1, 2, 3].map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setSeverity(level)}
                                        className="flex-1 py-4 rounded-2xl text-[14px] font-semibold transition-all cursor-pointer shadow-sm border border-[rgba(10,22,41,0.04)]"
                                        style={{
                                            background: severity === level ? `color-mix(in srgb, ${severityColors[level - 1]} 10%, white)` : 'white',
                                            borderColor: severity === level ? severityColors[level - 1] : 'transparent',
                                            color: severity === level ? severityColors[level - 1] : 'var(--sapphire-muted)',
                                        }}
                                    >
                                        <div className="flex items-center justify-center gap-2.5">
                                            <div className="flex gap-1">
                                                {[1, 2, 3].map((bar) => (
                                                    <div
                                                        key={bar}
                                                        className="w-1.5 h-4 rounded-sm transition-all duration-300"
                                                        style={{
                                                            background: bar <= level ? severityColors[level - 1] : 'var(--cloud)',
                                                            opacity: severity === level ? 1 : 0.5,
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
                            <label className="text-[12px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2 text-sapphire-muted">
                                <Tag size={14} /> Incident Context
                            </label>
                            <div className="flex flex-wrap gap-2.5">
                                {INCIDENT_CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setCategory(category === cat.value ? '' : cat.value)}
                                        className="badge cursor-pointer transition-all px-4 py-2 border shadow-sm"
                                        style={{
                                            background: category === cat.value ? `color-mix(in srgb, ${cat.color} 15%, white)` : 'white',
                                            color: category === cat.value ? cat.color : 'var(--sapphire)',
                                            borderColor: category === cat.value ? `color-mix(in srgb, ${cat.color} 50%, transparent)` : 'transparent',
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Additional Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-sapphire-muted">
                                    <MapPin size={14} /> Location (optional)
                                </label>
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Where did it happen?"
                                    className="input-premium bg-white/60 focus:bg-white w-full"
                                />
                            </div>
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-sapphire-muted">
                                    <Users size={14} /> Witnesses (optional)
                                </label>
                                <input
                                    type="text"
                                    value={witnesses}
                                    onChange={(e) => setWitnesses(e.target.value)}
                                    placeholder="Comma-separated names"
                                    className="input-premium bg-white/60 focus:bg-white w-full"
                                />
                            </div>
                        </div>

                        {/* Children Involved */}
                        <label
                            className="flex items-center gap-4 p-5 rounded-2xl cursor-pointer transition-all shadow-sm border"
                            style={{
                                background: childrenInvolved ? 'color-mix(in srgb, var(--warning) 8%, white)' : 'white',
                                borderColor: childrenInvolved ? 'var(--warning)' : 'transparent',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={childrenInvolved}
                                onChange={(e) => setChildrenInvolved(e.target.checked)}
                                className="peer sr-only"
                            />
                            <div
                                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                                style={{
                                    background: childrenInvolved ? 'var(--warning)' : 'var(--cloud)',
                                }}
                            >
                                {childrenInvolved && <Check size={14} weight="bold" className="text-white" />}
                            </div>
                            <div className="flex items-center gap-2.5">
                                <Baby size={18} weight={childrenInvolved ? "fill" : "regular"} className={childrenInvolved ? "text-warning" : "text-sapphire"} />
                                <div>
                                    <p className={`text-[15px] font-semibold ${childrenInvolved ? 'text-warning' : 'text-sapphire'}`}>
                                        Children Involved
                                    </p>
                                    <p className="text-[12px] font-medium text-sapphire-muted">
                                        Check if minors were present during the event
                                    </p>
                                </div>
                            </div>
                        </label>

                        {/* Error */}
                        {analyzeError && (
                            <div className="p-4 rounded-xl bg-rose/10 border border-rose/20 text-rose text-[13px] font-semibold flex items-center gap-2">
                                <Sparkle size={16} /> {analyzeError}
                            </div>
                        )}

                        {/* Submit */}
                        <div className="pt-4">
                            <button
                                onClick={handleAnalyze}
                                disabled={!narrative.trim() || isAnalyzing}
                                className="btn-primary w-full flex items-center justify-center gap-2.5 shadow-lg shadow-sapphire/20 disabled:scale-100 disabled:opacity-50 py-4 text-[15px]"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
                                            <Sparkle size={20} weight="fill" className="text-champagne" />
                                        </motion.div>
                                        Analyzing Dynamics securely...
                                    </>
                                ) : (
                                    <><Sparkle size={20} weight="duotone" className="text-champagne" /> Generate Court-Ready Summary</>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step: Review */}
                {step === 'review' && (
                    <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                        {/* Court Summary */}
                        <div className="card-premium p-6 md:p-8">
                            <div className="flex items-center justify-between mb-5 border-b border-[rgba(10,22,41,0.04)] pb-4">
                                <h3 className="text-[13px] font-bold tracking-[0.2em] uppercase text-sapphire flex items-center gap-2">
                                    <Sparkle size={16} weight="duotone" className="text-champagne" /> Court-Ready Summary
                                </h3>
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className="px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-wider bg-cloud hover:bg-[rgba(10,22,41,0.08)] text-sapphire transition-colors flex items-center gap-2"
                                >
                                    <PencilSimple size={14} /> {isEditing ? 'Done' : 'Edit'}
                                </button>
                            </div>
                            {isEditing ? (
                                <textarea
                                    value={courtSummary}
                                    onChange={(e) => setCourtSummary(e.target.value)}
                                    className="input-premium resize-none w-full text-[15px] leading-relaxed bg-white/50 focus:bg-white"
                                    rows={8}
                                />
                            ) : (
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-sapphire">
                                    {courtSummary}
                                </p>
                            )}
                        </div>

                        {/* Behavioral Analysis & Strategic Response (Bento Row) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {behavioralAnalysis && (
                                <div className="card-premium p-6">
                                    <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase mb-4 flex items-center gap-2 text-warning">
                                        <Sparkle size={16} weight="duotone" /> Behavioral Analysis
                                    </h3>
                                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-sapphire">
                                        {behavioralAnalysis}
                                    </p>
                                </div>
                            )}

                            {strategicResponse && (
                                <div className="card-premium p-6">
                                    <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase mb-4 flex items-center gap-2 text-emerald">
                                        <Check size={16} weight="bold" /> Strategic Response
                                    </h3>
                                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-sapphire">
                                        {strategicResponse}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setStep('describe')} className="btn-secondary flex-1 py-4 uppercase text-[12px] tracking-widest bg-white hover:bg-cloud border-transparent shadow-sm">
                                Back to Edit
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isSaving}
                                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:scale-100 disabled:opacity-50 py-4 uppercase text-[12px] tracking-widest shadow-md"
                            >
                                <Check size={16} weight="bold" /> {isSaving ? 'Saving...' : 'Confirm & Save'}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step: Confirmed */}
                {step === 'confirmed' && (
                    <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-ethereal p-12 text-center rounded-[2rem] border-white">
                        <div
                            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-emerald shadow-[0_8px_24px_rgba(90,158,111,0.25)]"
                        >
                            <Check size={32} weight="bold" className="text-white" />
                        </div>
                        <h2 className="font-serif text-3xl font-bold mb-3 text-sapphire">
                            Incident Documented
                        </h2>
                        <p className="text-[15px] font-medium mb-8 text-sapphire-muted max-w-sm mx-auto leading-relaxed">
                            This record has been securely encrypted and is ready for court presentation when needed.
                        </p>
                        <div className="flex gap-4 justify-center">
                            <Link href="/incident-report" className="btn-secondary bg-white hover:bg-cloud shadow-sm no-underline text-[13px] uppercase tracking-widest rounded-xl">
                                View Records
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
                                className="btn-primary flex items-center gap-2 shadow-md text-[13px] uppercase tracking-widest rounded-xl"
                            >
                                <Plus size={16} weight="bold" /> Log Another
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
