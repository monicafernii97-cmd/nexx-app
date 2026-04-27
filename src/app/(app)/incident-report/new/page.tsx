'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import { useUser } from '@/lib/user-context';
import { useWorkspace } from '@/lib/workspace-context';
import {
    Microphone,
    MicrophoneSlash,
    ArrowLeft,
    CircleNotch,
    FileText,
    Check,
    PencilSimple,
    CalendarBlank,
    Clock,
    Tag,
    MapPin,
    Users,
    Baby,
    Plus,
    WarningCircle,
    FloppyDisk,
    ArrowRight,
    ListChecks,
    Brain,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { INCIDENT_CATEGORIES } from '@/lib/constants';

type Step = 'describe' | 'review' | 'confirmed';

/** Premium multi-step incident creation form with AI-powered narrative analysis. */
export default function NewIncidentPage() {
    const { userId } = useUser();
    const { activeCaseId } = useWorkspace();
    const router = useRouter();
    const [step, setStep] = useState<Step>('describe');
    const [narrative, setNarrative] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [date, setDate] = useState(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
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

    // ── Speech Recognition ──
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSpeechSupported(false);
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const finalChunks: string[] = [];
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalChunks.push(result[0].transcript.trim());
                }
            }
            if (finalChunks.length) {
                setNarrative((prev) => `${prev}${prev ? ' ' : ''}${finalChunks.join(' ')}`);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, []);

    const toggleListening = useCallback(() => {
        if (!recognitionRef.current) return;
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (err) {
                console.error('Failed to start speech recognition:', err);
            }
        }
    }, [isListening]);

    const createIncident = useMutation(api.incidents.create);
    const updateIncident = useMutation(api.incidents.update);
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
            setTags(data.tags || []);
            setStep('review');
        } catch (error) {
            console.error('Analysis error:', error);
            setAnalyzeError(error instanceof Error ? error.message : 'Failed to analyze incident');
        } finally {
            setIsAnalyzing(false);
        }
    };

    /** Save the incident as a draft (no confirmation). */
    const handleSaveDraft = async () => {
        if (!userId || !activeCaseId || isSaving) return;
        setIsSaving(true);
        setAnalyzeError(null);

        try {
            const witnessArr = witnesses.trim()
                ? witnesses.split(',').map((w) => w.trim()).filter(Boolean)
                : undefined;

            if (createdId) {
                // Already created — update the draft with current edits
                await updateIncident({
                    id: createdId,
                    narrative,
                    courtSummary: courtSummary || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    severity,
                    date,
                    time,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                    aiAnalysis: behavioralAnalysis || undefined,
                });
            } else {
                const incidentId = await createIncident({
                    narrative,
                    courtSummary: courtSummary || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    severity,
                    date,
                    time,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                    aiAnalysis: behavioralAnalysis || undefined,
                    caseId: activeCaseId!,
                });
                setCreatedId(incidentId);
            }
            router.push('/incident-report');
        } catch (error) {
            console.error('Draft save error:', error);
            setAnalyzeError('Failed to save draft. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    /** Publish the incident to the timeline (create + confirm). */
    const handlePublish = async () => {
        if (!userId || !activeCaseId || isSaving) return;
        setIsSaving(true);
        setAnalyzeError(null);

        try {
            const witnessArr = witnesses.trim()
                ? witnesses.split(',').map((w) => w.trim()).filter(Boolean)
                : undefined;

            let incidentId = createdId;
            if (!incidentId) {
                incidentId = await createIncident({
                    narrative,
                    courtSummary: courtSummary || undefined,
                    tags,
                    severity,
                    date,
                    time,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                    aiAnalysis: behavioralAnalysis || undefined,
                    caseId: activeCaseId!,
                });
                setCreatedId(incidentId);
            } else {
                // Update the draft with latest edits before confirming
                await updateIncident({
                    id: incidentId,
                    narrative,
                    courtSummary: courtSummary || undefined,
                    tags,
                    severity,
                    date,
                    time,
                    location: location.trim() || undefined,
                    witnesses: witnessArr,
                    childrenInvolved: childrenInvolved || undefined,
                    aiAnalysis: behavioralAnalysis || undefined,
                });
            }

            await confirmIncident({ id: incidentId });
            setStep('confirmed');
        } catch (error) {
            console.error('Publish error:', error);
            setAnalyzeError('Failed to publish incident. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const severityLabels = ['Low', 'Medium', 'High'];
    const severityColors = ['var(--emerald)', 'var(--warning)', 'var(--rose)'];

    return (
        <div className="max-w-5xl mx-auto pb-16 w-full px-6 lg:px-12 mt-4">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center gap-5 mb-10"
            >
                <Link
                    href="/incident-report"
                    className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-md border border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)]"
                    aria-label="Back to incident reports"
                >
                    <ArrowLeft size={20} weight="bold" className="text-white" />
                </Link>
                <div>
                    <h1 className="text-2xl font-serif font-bold text-white m-0">
                        Evidence & <span className="text-white shimmer">Pattern Log</span>
                    </h1>
                    <p className="text-[14px] font-medium text-white opacity-90 mt-1">
                        Documenting patterns of behavior with precision for court.
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
                                    ? 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] text-white scale-110 shadow-[0_4px_12px_rgba(18,61,126,0.3)] border border-[rgba(255,255,255,0.3)]' 
                                    : 'bg-[#0A1128] text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.2)]'
                                }`}
                            >
                                {isPast ? <Check size={14} weight="bold" /> : i + 1}
                            </div>
                            <span className={`text-[13px] tracking-wide font-bold uppercase whitespace-nowrap ${isActive ? 'text-[#FFFFFF]' : 'text-white/60'}`}>
                                {label}
                            </span>
                            {i < 2 && (
                                <div className="flex-1 h-px min-w-[20px] bg-[rgba(255,255,255,0.1)]" />
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
                        className="glass-ethereal rounded-xl p-6 md:p-8 space-y-8"
                    >
                        {/* Voice Record Button */}
                        <div className="text-center">
                            {speechSupported ? (
                                <>
                                    <button
                                        onClick={toggleListening}
                                        className={`w-[72px] h-[72px] rounded-full mx-auto flex items-center justify-center cursor-pointer transition-all hover:scale-105 shadow-[0_8px_32px_rgba(26,75,155,0.5)] border-[3px] group relative overflow-hidden ${
                                            isListening
                                                ? 'bg-[linear-gradient(135deg,#C75A5A,#8B3A3A)] border-[rgba(199,90,90,0.5)] animate-pulse shadow-[0_0_30px_rgba(199,90,90,0.5)]'
                                                : 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)]'
                                        }`}
                                        title={isListening ? 'Stop recording' : 'Start voice recording'}
                                    >
                                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        {isListening ? (
                                            <MicrophoneSlash size={28} weight="fill" className="text-white drop-shadow-md" />
                                        ) : (
                                            <Microphone size={28} weight="duotone" className="text-white group-hover:scale-110 transition-all drop-shadow-md" />
                                        )}
                                    </button>
                                    <p className={`text-[13px] font-bold tracking-widest uppercase mt-4 ${
                                        isListening ? 'text-rose' : 'text-white'
                                    }`}>
                                        {isListening ? '● Listening... Tap to Stop' : 'Tap to Record Testimony'}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="w-[72px] h-[72px] rounded-full mx-auto flex items-center justify-center bg-[rgba(255,255,255,0.05)] border-[3px] border-[rgba(255,255,255,0.08)] opacity-50">
                                        <MicrophoneSlash size={28} className="text-white/40" />
                                    </div>
                                    <p className="text-[12px] font-medium text-white/40 mt-4">
                                        Voice recording not supported in this browser.
                                        <br />Use Chrome, Edge, or Safari.
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="primary-divider opacity-50" />

                        {/* Manual Narrative */}
                        <div>
                            <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                <PencilSimple size={14} /> Manual Narrative
                            </label>
                            <div className="relative">
                                <textarea
                                    value={narrative}
                                    onChange={(e) => setNarrative(e.target.value)}
                                    placeholder="Describe the incident with precision — what happened, who was present, what was said or done..."
                                    rows={6}
                                    className="input-premium resize-none w-full bg-white text-[#0A1128] placeholder:text-[#0A1128]/50 text-[15px] leading-relaxed rounded-[1.5rem] focus:ring-2 focus:ring-[#1A4B9B] border-none shadow-inner"
                                />
                                <p className={`absolute bottom-3 right-4 text-[11px] font-bold ${narrative.length > 4500 ? 'text-rose' : 'text-[#0A1128]/40'}`}>
                                    {narrative.length}/5000
                                </p>
                            </div>
                        </div>

                        {/* Date & Time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                    <CalendarBlank size={14} /> Date
                                </label>
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-premium bg-white text-[#0A1128] w-full rounded-[1.5rem] border-none shadow-inner focus:ring-2 focus:ring-[#1A4B9B]" />
                            </div>
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                    <Clock size={14} /> Time
                                </label>
                                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input-premium bg-white text-[#0A1128] w-full rounded-[1.5rem] border-none shadow-inner focus:ring-2 focus:ring-[#1A4B9B]" />
                            </div>
                        </div>

                        {/* Severity Selector */}
                        <div>
                            <label className="text-[12px] font-bold tracking-widest uppercase mb-4 block text-white">
                                Severity Level
                            </label>
                            <div className="flex gap-3">
                                {[1, 2, 3].map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setSeverity(level)}
                                        className={`flex-1 py-4 rounded-[1.5rem] text-[14px] font-bold transition-all duration-300 cursor-pointer backdrop-blur-sm border ${
                                            severity === level
                                            ? 'bg-[linear-gradient(135deg,rgba(255,255,255,0.15),rgba(255,255,255,0.05))] border-[rgba(255,255,255,0.4)] shadow-[0_8px_24px_rgba(255,255,255,0.15)] text-white scale-[1.02] -translate-y-1'
                                            : 'bg-[rgba(10,22,41,0.4)] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)] text-white/50 hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-center gap-2.5">
                                            <div className="flex gap-1">
                                                {[1, 2, 3].map((bar) => (
                                                    <div
                                                        key={bar}
                                                        className="w-1.5 h-4 rounded-full transition-all duration-300"
                                                        style={{
                                                            background: bar <= level ? (severity === level ? severityColors[level - 1] : 'white') : 'rgba(255,255,255,0.1)',
                                                            opacity: severity === level ? 1 : 0.6,
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

                        {/* Additional Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                    <MapPin size={14} /> Location (optional)
                                </label>
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Where did it happen?"
                                    className="input-premium bg-white text-[#0A1128] placeholder:text-[#0A1128]/50 w-full rounded-[1.5rem] focus:ring-2 focus:ring-[#1A4B9B] border-none shadow-inner"
                                />
                            </div>
                            <div>
                                <label className="text-[12px] font-bold tracking-widest uppercase mb-3 flex items-center gap-2 text-white">
                                    <Users size={14} /> Witnesses (optional)
                                </label>
                                <input
                                    type="text"
                                    value={witnesses}
                                    onChange={(e) => setWitnesses(e.target.value)}
                                    placeholder="Comma-separated names"
                                    className="input-premium bg-white text-[#0A1128] placeholder:text-[#0A1128]/50 w-full rounded-[1.5rem] focus:ring-2 focus:ring-[#1A4B9B] border-none shadow-inner"
                                />
                            </div>
                        </div>

                        {/* Children Involved */}
                        <label
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-[1.5rem] cursor-pointer transition-all duration-300 border backdrop-blur-sm shadow-sm hover:shadow-md ${
                                childrenInvolved
                                ? 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border-[rgba(255,255,255,0.4)] shadow-[0_8px_24px_rgba(26,75,155,0.5)]'
                                : 'bg-[rgba(10,22,41,0.4)] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)]'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="relative flex-shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={childrenInvolved}
                                        onChange={(e) => setChildrenInvolved(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-6 h-6 rounded-md border-2 border-[rgba(255,255,255,0.4)] peer-checked:bg-white peer-checked:border-white transition-all flex items-center justify-center">
                                        {childrenInvolved && <Check size={14} weight="bold" className="text-[#123D7E]" />}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Baby size={20} weight={childrenInvolved ? "fill" : "duotone"} className={childrenInvolved ? "text-white" : "text-white/60"} />
                                    <div>
                                        <p className="text-[15px] font-bold text-white tracking-wide">
                                            Children Present
                                        </p>
                                        <p className="text-[12px] font-medium text-white/70">
                                            Flag this incident for custody impact analysis
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </label>

                        {/* Error */}
                        {analyzeError && (
                            <div className="p-4 rounded-xl bg-rose/10 border border-rose/20 text-rose text-[13px] font-semibold flex items-center gap-2">
                                <WarningCircle size={16} weight="fill" /> {analyzeError}
                            </div>
                        )}

                        {/* Submit */}
                        <div className="pt-4 space-y-3">
                            <button
                                onClick={handleAnalyze}
                                disabled={!narrative.trim() || isAnalyzing || !activeCaseId}
                                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] border border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)] shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.5)] hover:-translate-y-1 transition-all disabled:scale-100 disabled:opacity-50 py-5 text-[15px] text-white font-bold tracking-wide backdrop-blur-md cursor-pointer group"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                            <CircleNotch size={20} weight="bold" className="text-white" />
                                        </motion.div>
                                        Analyzing Dynamics securely...
                                    </>
                                ) : (
                                    <><FileText size={20} weight="duotone" className="text-white group-hover:animate-pulse" /> Generate Court-Ready Summary</>
                                )}
                            </button>
                            <button
                                onClick={handleSaveDraft}
                                disabled={!narrative.trim() || isAnalyzing || isSaving || !activeCaseId}
                                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-transparent border border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.04)] transition-all disabled:opacity-40 py-4 text-[13px] text-white/70 hover:text-white font-bold tracking-widest uppercase backdrop-blur-md cursor-pointer"
                            >
                                <FloppyDisk size={16} weight="duotone" /> {isSaving ? 'Saving...' : 'Save as Draft'}
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
                                    <ListChecks size={16} weight="bold" className="text-champagne drop-shadow-sm" /> Court-Ready Summary
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
                                        <Brain size={16} weight="fill" className="drop-shadow-sm" /> Behavioral Analysis
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

                            {tags.length > 0 && (
                                <div className="card-premium p-6 md:col-span-2">
                                    <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase mb-4 flex items-center gap-2 text-rose">
                                        <Tag size={16} weight="duotone" /> Detected Patterns
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag) => {
                                            const catTheme = INCIDENT_CATEGORIES.find(c => c.value === tag);
                                            const color = catTheme ? catTheme.color : 'var(--sapphire)';
                                            const label = catTheme ? catTheme.label : tag.replace(/_/g, ' ');
                                            return (
                                                <span 
                                                    key={tag} 
                                                    className="px-3 py-1.5 rounded-md text-[11px] font-bold tracking-wider uppercase border shadow-sm"
                                                    style={{ 
                                                        background: color ? `color-mix(in srgb, ${color} 15%, transparent)` : 'rgba(255,255,255,0.05)',
                                                        color: color || 'rgba(255,255,255,0.7)',
                                                        borderColor: color ? `color-mix(in srgb, ${color} 30%, transparent)` : 'rgba(255,255,255,0.1)'
                                                    }}
                                                >
                                                    {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[12px] font-medium text-sapphire/60 mt-3 pt-3 border-t border-[rgba(10,22,41,0.05)]">
                                        These patterns will be flagged in your court-ready summary.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Error display for review step */}
                        {analyzeError && (
                            <div className="p-4 rounded-xl bg-rose/10 border border-rose/20 text-rose text-[13px] font-semibold flex items-center gap-2">
                                <WarningCircle size={16} weight="fill" /> {analyzeError}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <button onClick={() => setStep('describe')} className="flex-1 py-4 uppercase text-[12px] font-bold tracking-widest rounded-xl transition-all shadow-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)]">
                                Back to Edit
                            </button>
                            <button
                                onClick={handleSaveDraft}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 disabled:scale-100 disabled:opacity-50 py-4 uppercase text-[12px] font-bold tracking-widest rounded-xl transition-all shadow-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.3)] cursor-pointer"
                            >
                                <FloppyDisk size={16} weight="duotone" /> {isSaving ? 'Saving...' : 'Save as Draft'}
                            </button>
                            <button
                                onClick={handlePublish}
                                disabled={isSaving}
                                className="btn-primary flex-[1.5] flex items-center justify-center gap-2 disabled:scale-100 disabled:opacity-50 py-4 uppercase text-[12px] tracking-widest shadow-md"
                            >
                                <ArrowRight size={16} weight="bold" /> {isSaving ? 'Publishing...' : 'Publish to Timeline'}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Step: Confirmed */}
                {step === 'confirmed' && (
                    <motion.div key="confirmed" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-ethereal p-4 text-center rounded-xl border-white">
                        <div
                            className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center bg-emerald shadow-[0_8px_24px_rgba(90,158,111,0.25)]"
                        >
                            <Check size={24} weight="bold" className="text-white" />
                        </div>
                        <h2 className="font-serif text-2xl font-bold mb-3 text-sapphire">
                            Incident Documented
                        </h2>
                        <p className="text-[15px] font-medium mb-8 text-sapphire-muted max-w-sm mx-auto leading-relaxed">
                            This record has been securely encrypted and is ready for court presentation when needed.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch">
                            <Link 
                                href="/incident-report" 
                                className="flex items-center justify-center px-6 py-3.5 rounded-xl text-[13px] font-bold tracking-widest uppercase transition-all bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.3)] hover:bg-[rgba(255,255,255,0.1)] text-white shadow-sm no-underline"
                            >
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
                                    setTags([]);
                                    setSeverity(2);
                                    setLocation('');
                                    setWitnesses('');
                                    setChildrenInvolved(false);
                                    setAnalyzeError(null);
                                    setCreatedId(null);
                                }}
                                className="btn-primary flex items-center justify-center px-6 py-3.5 gap-2 shadow-[0_4px_20px_rgba(26,75,155,0.4)] text-[13px] font-bold tracking-widest uppercase rounded-xl"
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
