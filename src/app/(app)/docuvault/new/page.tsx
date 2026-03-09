'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
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
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

type Step = 'describe' | 'review' | 'confirmed';

export default function NewIncidentPage() {
    const { userId } = useUser();
    const router = useRouter();
    const [step, setStep] = useState<Step>('describe');
    const [narrative, setNarrative] = useState('');
    const [category, setCategory] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
    const [courtSummary, setCourtSummary] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const createIncident = useMutation(api.incidents.create);
    const confirmIncident = useMutation(api.incidents.confirm);

    const handleAnalyze = () => {
        if (!narrative.trim()) return;
        setIsAnalyzing(true);

        // Mock AI analysis (will be replaced with real OpenAI later)
        setTimeout(() => {
            setCourtSummary(
                `On ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at approximately ${time}, the following incident was documented:\n\n${narrative}\n\nThis incident has been recorded in a neutral, fact-based format suitable for court presentation. The event demonstrates a pattern consistent with documented co-parenting conflict behaviors.\n\nRecommendation: This incident should be preserved as part of the ongoing documentation portfolio.`
            );
            setStep('review');
            setIsAnalyzing(false);
        }, 2000);
    };

    const handleConfirm = async () => {
        if (!userId) return;

        const incidentId = await createIncident({
            narrative,
            courtSummary,
            category: (category || 'other') as 'emotional_abuse' | 'financial_abuse' | 'parental_alienation' | 'custody_violation' | 'harassment' | 'threats' | 'manipulation' | 'neglect' | 'other',
            severity: 2,
            date,
            time,
        });

        await confirmIncident({ id: incidentId });
        setStep('confirmed');
    };

    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-8"
            >
                <Link href="/docuvault">
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
                            placeholder="Describe the incident with precision..."
                            rows={6}
                            className="input-gilded resize-none"
                        />
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
                                Analyzing...
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
                    <div className="card-gilded p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold tracking-[0.15em] uppercase" style={{ color: '#C58B07' }}>
                                Court-Ready Summary
                            </h3>
                            <button className="btn-ghost text-xs flex items-center gap-1">
                                <Pencil size={12} /> Edit
                            </button>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D4C9B0' }}>
                            {courtSummary}
                        </p>
                    </div>
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
                        This record has been securely saved to your DocuVault and is court-ready.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <Link href="/docuvault">
                            <button className="btn-outline">View All Records</button>
                        </Link>
                        <button
                            onClick={() => { setStep('describe'); setNarrative(''); setCourtSummary(''); setCategory(''); }}
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
