'use client';

import { motion } from 'framer-motion';
import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import {
    ClipboardText,
    ArrowRight,
    Microphone,
    PlusCircle,
    ArrowClockwise,
    CheckCircle,
    MagnifyingGlass as FileSearch,
    Clock as TimelineIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';

import '@/styles/pipelines.css';

/** Incident Intake Hub - The primary pipeline for event recording. */
export default function IncidentReportPage() {
    const { activeCaseId } = useWorkspace();
    const [narrative, setNarrative] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    /** Structured error for stable code-based matching instead of brittle string comparisons. */
    type ProcessError = { code: 'empty_narrative' | 'missing_case' | 'generic'; message: string } | null;
    const [processError, setProcessError] = useState<ProcessError>(null);
    const [isPinning, setIsPinning] = useState<string | null>(null);
    const [pinError, setPinError] = useState<string | null>(null);

    // Derive displayed error — automatically suppresses stale "no case" message once case is selected
    const displayedError = processError?.code === 'missing_case' && activeCaseId
        ? null
        : processError?.message ?? null;

    // Live data from Convex
    const incidents = useQuery(
        api.incidents.list,
        activeCaseId ? { caseId: activeCaseId } : 'skip',
    );
    const createIncident = useMutation(api.incidents.create);
    const createCasePin = useMutation(api.casePins.create);

    /** Process the incident narrative and save to Convex. */
    const handleProcess = useCallback(async () => {
        const trimmed = narrative.trim();
        if (!trimmed || !activeCaseId) {
            if (!trimmed) {
                setProcessError({ code: 'empty_narrative', message: 'Please enter a narrative.' });
            } else if (!activeCaseId) {
                setProcessError({ code: 'missing_case', message: 'Please select or create a case first.' });
            }
            return;
        }

        setIsProcessing(true);
        setProcessError(null);

        try {
            const now = new Date();
            const localDate = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0'),
            ].join('-');
            await createIncident({
                narrative: trimmed,
                severity: 1,
                date: localDate,
                time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                caseId: activeCaseId,
            });

            setNarrative('');
        } catch (err) {
            console.error('[IncidentIntake] Create failed:', err);
            setProcessError({ code: 'generic', message: err instanceof Error ? err.message : 'Failed to save incident' });
        } finally {
            setIsProcessing(false);
        }
    }, [narrative, activeCaseId, createIncident]);

    /** Pin an incident to the case workspace. Prevents duplicate clicks. */
    const handleAddToWorkspace = useCallback(async (incident: { _id: Id<'incidents'>; narrative: string; date: string }) => {
        if (!activeCaseId || isPinning) return;
        setIsPinning(incident._id);

        try {
            setPinError(null);
            await createCasePin({
                caseId: activeCaseId,
                type: 'key_fact',
                title: `Incident — ${incident.date}`,
                content: incident.narrative,
                requestId: `incident:${incident._id}:workspace`,
            });
        } catch (err) {
            console.error('[IncidentIntake] Pin creation failed:', err);
            setPinError('Failed to add incident to workspace. Please try again.');
        } finally {
            setIsPinning(null);
        }
    }, [activeCaseId, createCasePin, isPinning]);



    return (
        <PageContainer>
            <PageHeader
                icon={ClipboardText}
                title={<>Record <span className="text-editorial shimmer">Incident</span></>}
                description="Turn a chaotic moment into a structured fact. Type your narrative below."
            />

            <div className="max-w-4xl mx-auto space-y-8 pb-24">
                
                {/* 1. The Focused Intake Area (Luxury Glass) */}
                <div className="hyper-glass p-8 space-y-6 floating-element glow-slate">
                    <div className="relative group">
                        <textarea
                            value={narrative}
                            onChange={(e) => {
                                setNarrative(e.target.value);
                                if (processError) setProcessError(null);
                            }}
                            aria-label="Incident narrative"
                            placeholder="What happened? Record the facts exactly as they occurred..."
                            className="w-full bg-transparent border-none text-lg font-serif text-white placeholder:text-white/5 min-h-[160px] outline-none resize-none px-0 py-3 selection:bg-indigo-500/30 leading-relaxed"
                        />
                        
                        {/* Floating Glow Background */}
                        <div className="absolute inset-0 bg-indigo-500/5 blur-[80px] rounded-full -z-10 group-focus-within:bg-indigo-500/10 transition-all pointer-events-none" />
                    </div>

                    {/* 2. Intake Controls */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-6">
                            <button disabled className="flex items-center gap-2 text-white/20 cursor-not-allowed text-[11px] font-bold uppercase tracking-[0.2em] group transition-all" title="Coming soon">
                                <Microphone size={18} weight="light" className="group-hover:text-rose-400 transition-colors" />
                                Voice Entry
                            </button>
                            <button disabled className="flex items-center gap-2 text-white/20 cursor-not-allowed text-[11px] font-bold uppercase tracking-[0.2em] group transition-all" title="Coming soon">
                                <PlusCircle size={18} weight="light" className="group-hover:text-indigo-400 transition-colors" />
                                Attach Media
                            </button>
                        </div>

                        <button 
                            onClick={handleProcess}
                            disabled={!narrative.trim() || isProcessing || !activeCaseId}
                            className={`flex items-center gap-3 px-6 py-2.5 rounded-xl font-bold uppercase tracking-[0.2em] text-[10px] transition-all shadow-2xl ${
                                narrative.trim() && !isProcessing && activeCaseId
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30' 
                                : 'bg-white/5 text-white/10 border border-white/5 cursor-not-allowed'
                            }`}
                        >
                            {isProcessing ? (
                                <ArrowClockwise size={18} className="animate-spin" />
                            ) : (
                                <ClipboardText size={18} weight="fill" />
                            )}
                            {isProcessing ? 'Processing' : 'Log Incident'}
                        </button>
                    </div>
                </div>

                {/* Error & Warnings */}
                <div className="px-4 space-y-4">
                    {displayedError && (
                        <div role="alert" aria-live="assertive" className="px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest">
                            {displayedError}
                        </div>
                    )}
                    {!activeCaseId && (
                        <div className="px-6 py-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest text-center">
                            Select an active case to begin recording incidents
                        </div>
                    )}
                </div>

                {/* 3. Live Timeline (Luxury Glass) */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="hyper-glass p-6 space-y-6"
                >
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                <TimelineIcon size={20} className="text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="font-serif text-lg text-white tracking-tight">Timeline Intake</h3>
                                <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mt-1">Chronological Fact Logging</p>
                            </div>
                        </div>
                        <Link href="/incident-report/history" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-[0.2em] flex items-center gap-2 group transition-all">
                            Historical Archive <ArrowRight size={14} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    <div className="space-y-10">
                        {/* No case selected state */}
                        {!activeCaseId && (
                            <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.3em] font-bold py-10">
                                Case isolation active
                            </p>
                        )}

                        {/* Loading state */}
                        {activeCaseId && incidents === undefined && (
                            <div className="flex items-center justify-center py-10">
                                <div className="w-6 h-6 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin" />
                            </div>
                        )}

                        {/* Empty state */}
                        {incidents && incidents.length === 0 && (
                            <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.3em] font-bold py-10">
                                Queue clear • Awaiting entries
                            </p>
                        )}

                        {/* Pin error */}
                        {pinError && (
                            <div role="alert" aria-live="assertive" className="px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest">
                                {pinError}
                            </div>
                        )}

                        {/* Live incidents */}
                        {incidents?.slice(0, 5).map((incident, i) => (
                            <div key={incident._id} className="flex gap-8 relative group">
                                {/* Vertical Timeline Line */}
                                {i !== Math.min((incidents?.length ?? 0) - 1, 4) && (
                                    <div className="absolute left-[7px] top-8 bottom-[-2.5rem] w-[1px] bg-white/5" />
                                )}
                                
                                <div className="mt-2 w-4 h-4 rounded-full border border-indigo-500/50 bg-[#020617] z-10 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(99,102,241,0.3)]" />
                                
                                <div className="flex-1 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <span className="text-[11px] font-bold text-white tracking-[0.1em] uppercase">{incident.date}</span>
                                            <span className="text-[11px] font-medium text-white/20 uppercase tracking-widest">{incident.time}</span>
                                            {incident.status === 'confirmed' && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Verified</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button disabled className="text-[10px] font-bold text-white/30 hover:text-white uppercase tracking-widest transition-colors cursor-not-allowed">Edit</button>
                                        </div>
                                    </div>
                                    <p className="text-[15px] text-white/60 leading-relaxed font-serif max-w-2xl group-hover:text-white/80 transition-colors">
                                        {incident.narrative.length > 250
                                            ? incident.narrative.slice(0, 250) + '...'
                                            : incident.narrative}
                                    </p>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => handleAddToWorkspace(incident)}
                                            disabled={Boolean(isPinning)}
                                            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-[0.2em] border transition-all ${
                                                isPinning
                                                    ? 'bg-indigo-500/10 text-indigo-400/60 border-indigo-500/20 cursor-not-allowed'
                                                    : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white'
                                            }`}
                                        >
                                            {isPinning === incident._id ? 'Securing...' : isPinning ? 'Please wait' : 'Case Workspace'}
                                        </button>
                                        <button disabled className="px-4 py-2 rounded-lg bg-amber-500/5 text-amber-500/30 text-[9px] font-bold uppercase tracking-[0.2em] border border-amber-500/10 cursor-not-allowed" title="Coming soon">
                                            Export to Exhibit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* 4. Strategic Guidance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="hyper-glass p-8 flex items-start gap-5 group hover:border-indigo-500/30 transition-all">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-indigo-500/5 transition-all">
                            <CheckCircle size={24} weight="light" className="text-indigo-400" />
                        </div>
                        <div>
                            <h5 className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.25em] mb-2">Court-Ready Protocol</h5>
                            <p className="text-[12px] text-white/30 leading-relaxed group-hover:text-white/50 transition-colors">
                                Avoid subjective adjectives. Document exact times and specific dialogue to maximize evidentiary weight in future motions.
                            </p>
                        </div>
                    </div>
                    <div className="hyper-glass p-8 flex items-start gap-5 group hover:border-rose-500/30 transition-all">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-rose-500/5 transition-all">
                            <FileSearch size={24} weight="light" className="text-rose-400" />
                        </div>
                        <div>
                            <h5 className="text-[11px] font-bold text-rose-400 uppercase tracking-[0.25em] mb-2">Predictive Analysis</h5>
                            <p className="text-[12px] text-white/30 leading-relaxed group-hover:text-white/50 transition-colors">
                                {incidents && incidents.length >= 3
                                    ? `Pattern detected across ${incidents.length} entries. High-probability evidence for pattern-of-conduct claims.`
                                    : 'Recording 3+ specific incidents enables pattern detection and automated evidence grouping.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
