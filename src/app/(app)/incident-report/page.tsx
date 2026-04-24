'use client';

import { motion } from 'framer-motion';
import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { Id } from '@convex/_generated/dataModel';
import {
    ClipboardText,
    Plus,
    ArrowRight,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import { useWorkspace } from '@/lib/workspace-context';

import '@/styles/pipelines.css';
import { 
  Microphone, 
  Sparkle, 
  PlusCircle, 
  ArrowClockwise,
  CheckCircle,
  MagnifyingGlass as FileSearch,
  Clock as TimelineIcon
} from '@phosphor-icons/react';

/** Incident Intake Hub - The primary pipeline for event recording. */
export default function IncidentReportPage() {
    const { activeCaseId } = useWorkspace();
    const [narrative, setNarrative] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processError, setProcessError] = useState<string | null>(null);
    const [isPinning, setIsPinning] = useState<string | null>(null);

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
                setProcessError('Please enter a narrative.');
            } else if (!activeCaseId) {
                setProcessError('Please select or create a case first.');
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
            setProcessError(err instanceof Error ? err.message : 'Failed to save incident');
        } finally {
            setIsProcessing(false);
        }
    }, [narrative, activeCaseId, createIncident]);

    /** Pin an incident to the case workspace. Prevents duplicate clicks. */
    const handleAddToWorkspace = useCallback(async (incident: { _id: Id<'incidents'>; narrative: string; date: string }) => {
        if (!activeCaseId || isPinning === incident._id) return;
        setIsPinning(incident._id);

        try {
            await createCasePin({
                caseId: activeCaseId,
                type: 'key_fact',
                title: `Incident — ${incident.date}`,
                content: incident.narrative,
                requestId: `incident:${incident._id}:workspace`,
            });
        } catch (err) {
            console.error('[IncidentIntake] Pin creation failed:', err);
        } finally {
            setIsPinning(null);
        }
    }, [activeCaseId, createCasePin, isPinning]);



    return (
        <PageContainer>
            <PageHeader
                icon={ClipboardText}
                title={<>Record <span className="text-editorial shimmer">Incident</span></>}
                description="Turn a chaotic moment into a structured fact. Type or speak your narrative below."
            />

            <div className="max-w-4xl mx-auto space-y-12 pb-24">
                
                {/* 1. The Focused Intake Area */}
                <div className="relative group">
                    <textarea
                        value={narrative}
                        onChange={(e) => setNarrative(e.target.value)}
                        aria-label="Incident narrative"
                        placeholder="What happened? (e.g. 'At 2pm today, John arrived at the exchange location and started...')"
                        className="w-full bg-transparent border-none text-2xl md:text-3xl font-serif text-white placeholder:text-white/10 min-h-[300px] outline-none resize-none px-4 py-8 selection:bg-indigo-500/30"
                    />
                    
                    {/* Floating Glow Background */}
                    <div className="absolute inset-0 bg-indigo-500/5 blur-[100px] rounded-full -z-10 group-focus-within:bg-indigo-500/10 transition-all" />
                </div>

                {/* 2. Intake Controls */}
                <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <button disabled className="flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white/20 cursor-not-allowed text-sm font-bold" title="Coming soon">
                            <Microphone size={20} weight="fill" className="text-rose-400/40" />
                            Voice Input
                        </button>
                        <button disabled className="flex items-center gap-2 px-4 py-2 text-white/20 cursor-not-allowed text-xs font-bold uppercase tracking-widest" title="Coming soon">
                            <PlusCircle size={18} />
                            Add Photo/Video
                        </button>
                    </div>

                    <button 
                        onClick={handleProcess}
                        disabled={!narrative.trim() || isProcessing || !activeCaseId}
                        className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl ${
                            narrative.trim() && !isProcessing && activeCaseId
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30' 
                            : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed'
                        }`}
                    >
                        {isProcessing ? (
                            <ArrowClockwise size={18} className="animate-spin" />
                        ) : (
                            <Sparkle size={18} weight="fill" />
                        )}
                        {isProcessing ? 'Processing...' : 'Process Incident'}
                    </button>
                </div>

                {/* Error */}
                {processError && (
                    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {processError}
                    </div>
                )}

                {/* No case selected warning */}
                {!activeCaseId && (
                    <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm text-center">
                        Select a case from the sidebar to start recording incidents.
                    </div>
                )}

                {/* 3. Live Timeline from Convex */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-station p-8 border-white/5 shadow-2xl space-y-8"
                >
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <div className="flex items-center gap-3">
                            <TimelineIcon size={20} className="text-indigo-400" />
                            <h3 className="font-bold text-white uppercase tracking-widest text-xs">Recent Timeline Intake</h3>
                        </div>
                        <Link href="/incident-report/history" className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-2">
                            View Full History <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="space-y-6">
                        {/* No case selected state */}
                        {!activeCaseId && (
                            <p className="text-center text-white/20 text-xs uppercase tracking-widest font-bold py-6">
                                Select a case to view incidents
                            </p>
                        )}

                        {/* Loading state */}
                        {activeCaseId && incidents === undefined && (
                            <div className="flex items-center justify-center py-6">
                                <div className="w-5 h-5 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                            </div>
                        )}

                        {/* Empty state */}
                        {incidents && incidents.length === 0 && (
                            <p className="text-center text-white/20 text-xs uppercase tracking-widest font-bold py-6">
                                No incidents recorded yet
                            </p>
                        )}

                        {/* Live incidents */}
                        {incidents?.slice(0, 5).map((incident, i) => (
                            <div key={incident._id} className="flex gap-6 relative group">
                                {/* Vertical Timeline Line */}
                                {i !== Math.min((incidents?.length ?? 0) - 1, 4) && (
                                    <div className="absolute left-[7px] top-6 bottom-[-1.5rem] w-[2px] bg-indigo-500/20" />
                                )}
                                
                                <div className="mt-1 w-4 h-4 rounded-full border-2 border-indigo-500 bg-[#0F172A] z-10 shrink-0" />
                                
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter">{incident.date}</span>
                                            <span className="text-[10px] font-medium text-white/20">{incident.time}</span>
                                            {incident.status === 'confirmed' && (
                                                <span className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">✓ Confirmed</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button disabled className="text-[10px] font-bold text-white/20 uppercase tracking-widest cursor-not-allowed" title="Coming soon">
                                                Edit
                                            </button>
                                            <button disabled className="text-[10px] font-bold text-white/20 uppercase tracking-widest cursor-not-allowed" title="Coming soon">
                                                Verify
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-white/80 leading-relaxed max-w-2xl">
                                        {incident.narrative.length > 200
                                            ? incident.narrative.slice(0, 200) + '...'
                                            : incident.narrative}
                                    </p>
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => handleAddToWorkspace(incident)}
                                            disabled={isPinning === incident._id}
                                            className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border transition-colors ${
                                                isPinning === incident._id
                                                    ? 'bg-indigo-500/10 text-indigo-400/60 border-indigo-500/20 cursor-not-allowed'
                                                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
                                            }`}
                                        >
                                            {isPinning === incident._id ? 'Adding…' : '+ Add to Workspace'}
                                        </button>
                                        <button disabled className="px-2 py-1 rounded bg-amber-500/10 text-amber-400/40 text-[9px] font-bold uppercase tracking-widest border border-amber-500/10 cursor-not-allowed" title="Coming soon">
                                            + Send to Exhibit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* 4. Strategic Guidance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
                        <CheckCircle size={24} className="text-indigo-400 shrink-0" />
                        <div>
                            <h5 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Court-Ready Tip</h5>
                            <p className="text-[11px] text-white/40 leading-relaxed">
                                Avoid emotional descriptors. Focus on exact times, dates, and direct quotes for higher evidentiary value.
                            </p>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex items-start gap-4">
                        <FileSearch size={24} className="text-rose-400 shrink-0" />
                        <div>
                            <h5 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Pattern Detected</h5>
                            <p className="text-[11px] text-white/40 leading-relaxed">
                                {incidents && incidents.length >= 3
                                    ? `${incidents.length} incidents recorded. Patterns may be tracked for your next motion.`
                                    : 'Record 3+ incidents to enable pattern detection for legal filings.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
