'use client';

/**
 * Pipeline Progress — Visual step-by-step assembly progress view.
 *
 * Replaces the generic spinner with a 9-step pipeline trace:
 * Collecting → Classifying → Mapping → Review → Overrides → Drafting → Compliance → Rendering → Saving
 *
 * Shows current step, completed steps, and live progress detail.
 */

import { motion } from 'framer-motion';
import {
    Database,
    Brain,
    TreeStructure,
    UserCheck,
    Shuffle,
    PencilSimple,
    ShieldCheck,
    FilePdf,
    CloudArrowUp,
    CheckCircle,
    CircleNotch,
    Circle,
    WarningOctagon,
} from '@phosphor-icons/react';
import type { PipelinePhase } from '@/lib/export-assembly/orchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineProgressProps {
    /** Current pipeline phase */
    currentPhase: PipelinePhase;
    /** Overall progress 0-100 */
    progress: number;
    /** Detailed status message */
    detail: string;
    /** Phase where error occurred (for error state display) */
    errorPhase?: PipelinePhase;
}

// ---------------------------------------------------------------------------
// Steps Configuration
// ---------------------------------------------------------------------------

interface PipelineStep {
    phase: PipelinePhase;
    label: string;
    description: string;
    icon: typeof Database;
    color: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
    { phase: 'collecting', label: 'Collecting Sources', description: 'Gathering workspace nodes and timeline events', icon: Database, color: '#60A5FA' },
    { phase: 'classifying', label: 'Classifying Content', description: 'Detecting facts, arguments, and evidence signals', icon: Brain, color: '#A78BFA' },
    { phase: 'mapping', label: 'Mapping Sections', description: 'Routing content to document sections', icon: TreeStructure, color: '#34D399' },
    { phase: 'ready_for_review', label: 'Ready for Review', description: 'Assembly complete — awaiting your review', icon: UserCheck, color: '#F59E0B' },
    { phase: 'applying_overrides', label: 'Applying Overrides', description: 'Merging your edits and locks', icon: Shuffle, color: '#60A5FA' },
    { phase: 'drafting', label: 'Drafting Document', description: 'AI generating prose from your approved mapping', icon: PencilSimple, color: '#A78BFA' },
    { phase: 'compliance', label: 'Checking Compliance', description: 'Validating against court formatting rules', icon: ShieldCheck, color: '#34D399' },
    { phase: 'rendering', label: 'Rendering PDF', description: 'Generating court-ready PDF', icon: FilePdf, color: '#F59E0B' },
    { phase: 'saving', label: 'Saving Document', description: 'Uploading and finalizing document', icon: CloudArrowUp, color: '#60A5FA' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepIndex(phase: PipelinePhase): number {
    const idx = PIPELINE_STEPS.findIndex(s => s.phase === phase);
    return idx >= 0 ? idx : -1;
}

function getStepStatus(
    step: PipelineStep,
    currentPhase: PipelinePhase,
    errorPhase?: PipelinePhase,
): 'completed' | 'active' | 'pending' | 'error' {
    const stepIdx = getStepIndex(step.phase);

    // When in error state, show which step failed
    if (currentPhase === 'error') {
        // If no errorPhase provided, default to last step so prior steps show completed
        const failedIdx = errorPhase ? getStepIndex(errorPhase) : PIPELINE_STEPS.length - 1;
        if (stepIdx < failedIdx) return 'completed';
        if (stepIdx === failedIdx) return 'error';
        return 'pending';
    }

    if (currentPhase === 'completed') return 'completed';

    const currentIdx = getStepIndex(currentPhase);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PipelineProgress({ currentPhase, progress, detail, errorPhase }: PipelineProgressProps) {
    const isError = currentPhase === 'error';
    const isComplete = currentPhase === 'completed';
    const safeProgress = Math.max(0, Math.min(100, progress));

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Overall Progress Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40">
                        {isComplete ? 'Complete' : isError ? 'Error' : 'Assembly Pipeline'}
                    </span>
                    <span className="text-[13px] font-bold text-white/70">{safeProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${isError ? 'bg-rose-500' : isComplete ? 'bg-emerald-500' : 'bg-[#60A5FA]'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${safeProgress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
            </div>

            {/* Step List */}
            <div className="space-y-1">
                {PIPELINE_STEPS.map((step, i) => {
                    const status = getStepStatus(step, currentPhase, errorPhase);
                    const Icon = step.icon;

                    return (
                        <motion.div
                            key={step.phase}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                                status === 'error'
                                    ? 'bg-rose-500/10 border border-rose-500/30'
                                    : status === 'active'
                                        ? 'bg-white/10 border border-white/20'
                                        : status === 'completed'
                                            ? 'bg-white/5 border border-transparent'
                                            : 'opacity-40 border border-transparent'
                            }`}
                        >
                            {/* Status Icon */}
                            <div className="shrink-0">
                                {status === 'error' ? (
                                    <WarningOctagon
                                        size={22}
                                        weight="fill"
                                        className="text-rose-400"
                                    />
                                ) : status === 'completed' ? (
                                    <CheckCircle
                                        size={22}
                                        weight="fill"
                                        className="text-emerald-400"
                                    />
                                ) : status === 'active' ? (
                                    <CircleNotch
                                        size={22}
                                        weight="bold"
                                        className="animate-spin motion-reduce:animate-none"
                                        style={{ color: step.color }}
                                    />
                                ) : (
                                    <Circle
                                        size={22}
                                        weight="regular"
                                        className="text-white/20"
                                    />
                                )}
                            </div>

                            {/* Step Icon */}
                            <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    status === 'active' ? 'bg-white/15' : 'bg-white/5'
                                }`}
                            >
                                <Icon
                                    size={16}
                                    weight="duotone"
                                    style={{ color: status === 'pending' ? 'rgba(255,255,255,0.3)' : step.color }}
                                />
                            </div>

                            {/* Label */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-[13px] font-bold ${
                                    status === 'active' ? 'text-white' : status === 'completed' ? 'text-white/70' : 'text-white/40'
                                }`}>
                                    {step.label}
                                </p>
                                {(status === 'active' || status === 'error') && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className={`text-[11px] truncate ${
                                            status === 'error' ? 'text-rose-300' : 'text-white/50'
                                        }`}
                                    >
                                        {detail || step.description}
                                    </motion.p>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
